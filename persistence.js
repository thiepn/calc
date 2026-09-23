(function(global){
"use strict";

const DB_NAME="calc-db";
const DB_VERSION=4;
const BACKUP_SCHEMA="calc.backup/v1";
const ENCRYPTED_BACKUP_SCHEMA="calc.backup.encrypted/v1";
const SYNC_SCHEMA="calc.sync/v1";
const STORES=Object.freeze({
  history:"history",
  notebooks:"worksheets",
  settings:"settings",
  customTools:"customTools",
  meta:"meta",
  journal:"journal",
  tombstones:"tombstones"
});
const DATA_STORES=Object.freeze([STORES.history,STORES.notebooks,STORES.settings,STORES.customTools,STORES.tombstones]);
const ALL_STORES=Object.freeze(DATA_STORES.concat([STORES.meta,STORES.journal]));
const MAX_BACKUP_BYTES=25*1024*1024;
const MAX_BACKUP_ITEMS=20000;
const CHANNEL_NAME="calc-persistence-v1";

class PersistenceError extends Error{
  constructor(code,message,details){super(message);this.name="PersistenceError";this.code=code||"PERSISTENCE_ERROR";this.details=details||null;}
}
class BackupError extends PersistenceError{constructor(message,details){super("BACKUP_ERROR",message,details);}}
class RestoreError extends PersistenceError{constructor(message,details){super("RESTORE_ERROR",message,details);}}
class RestoreStaleError extends PersistenceError{constructor(message,details){super("RESTORE_STALE_PLAN",message,details);}}
class IntegrityError extends PersistenceError{constructor(message,details){super("INTEGRITY_ERROR",message,details);}}
class MigrationError extends PersistenceError{constructor(message,details){super("MIGRATION_ERROR",message,details);}}

function stableSortObject(v){
  if(v===null||typeof v!=="object")return v;
  if(Array.isArray(v))return v.map(stableSortObject);
  const out={};Object.keys(v).sort().forEach(k=>{out[k]=stableSortObject(v[k]);});return out;
}
function stableStringify(v){return JSON.stringify(stableSortObject(v));}
function utf8Bytes(s){
  if(typeof TextEncoder!=="undefined")return new TextEncoder().encode(String(s));
  if(typeof Buffer!=="undefined")return Uint8Array.from(Buffer.from(String(s),"utf8"));
  throw new PersistenceError("ENCODER_UNAVAILABLE","UTF-8 encoder unavailable");
}
function bytesToHex(bytes){return Array.from(bytes).map(b=>b.toString(16).padStart(2,"0")).join("");}
async function sha256Text(text){
  const bytes=utf8Bytes(text);
  if(global.crypto&&global.crypto.subtle){
    const digest=await global.crypto.subtle.digest("SHA-256",bytes);return bytesToHex(new Uint8Array(digest));
  }
  // Deterministic fallback for restricted environments. Marked explicitly as non-cryptographic.
  let h1=0x811c9dc5,h2=0x9e3779b9;
  for(const b of bytes){h1=Math.imul(h1^b,16777619)>>>0;h2=Math.imul(h2^(b+h1),2246822519)>>>0;}
  return "fnv32x2-"+h1.toString(16).padStart(8,"0")+h2.toString(16).padStart(8,"0");
}
async function hashValue(v){return sha256Text(stableStringify(v));}
function randomBytes(length){
  if(!(global.crypto&&typeof global.crypto.getRandomValues==="function"))throw new BackupError("Secure random generator is unavailable");
  const out=new Uint8Array(length);global.crypto.getRandomValues(out);return out;
}
function bytesToBase64(bytes){
  if(typeof btoa==="function"){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s);}
  if(typeof Buffer!=="undefined")return Buffer.from(bytes).toString("base64");
  throw new BackupError("Base64 encoder unavailable");
}
function base64ToBytes(text){
  if(typeof atob==="function"){const s=atob(text),out=new Uint8Array(s.length);for(let i=0;i<s.length;i++)out[i]=s.charCodeAt(i);return out;}
  if(typeof Buffer!=="undefined")return Uint8Array.from(Buffer.from(text,"base64"));
  throw new BackupError("Base64 decoder unavailable");
}
async function deriveBackupKey(password,salt,iterations){
  if(!(global.crypto&&global.crypto.subtle))throw new BackupError("Web Crypto is unavailable; encrypted backups cannot be used");
  password=String(password||"");if(!password)throw new BackupError("Backup password is required");
  const material=await global.crypto.subtle.importKey("raw",utf8Bytes(password),{name:"PBKDF2"},false,["deriveKey"]);
  return global.crypto.subtle.deriveKey({name:"PBKDF2",hash:"SHA-256",salt:salt,iterations:iterations},material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}

function now(){return Date.now();}
function randomId(prefix){
  if(global.crypto&&typeof global.crypto.randomUUID==="function")return (prefix||"id")+"-"+global.crypto.randomUUID();
  return (prefix||"id")+"-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,10);
}
function requestPromise(req){
  return new Promise(function(resolve,reject){req.onsuccess=function(){resolve(req.result);};req.onerror=function(){reject(req.error||new PersistenceError("IDB_REQUEST","IndexedDB request failed"));};});
}
function txPromise(tx){
  return new Promise(function(resolve,reject){tx.oncomplete=function(){resolve();};tx.onerror=function(){reject(tx.error||new PersistenceError("IDB_TRANSACTION","IndexedDB transaction failed"));};tx.onabort=function(){reject(tx.error||new PersistenceError("IDB_ABORT","IndexedDB transaction aborted"));};});
}
function ensureStore(db,name,keyPath){
  if(!db.objectStoreNames.contains(name))db.createObjectStore(name,{keyPath:keyPath});
}
function migrationPlan(oldVersion,newVersion){
  const steps=[];
  if(oldVersion<1&&newVersion>=1)steps.push("create-core-stores");
  if(oldVersion<2&&newVersion>=2)steps.push("create-custom-tools");
  if(oldVersion<3&&newVersion>=3)steps.push("create-meta-journal");
  if(oldVersion<4&&newVersion>=4)steps.push("create-tombstones");
  return steps;
}
function applyUpgrade(db,tx,oldVersion,newVersion){
  try{
    if(oldVersion<1){ensureStore(db,STORES.history,"id");ensureStore(db,STORES.notebooks,"id");ensureStore(db,STORES.settings,"key");}
    if(oldVersion<2)ensureStore(db,STORES.customTools,"id");
    if(oldVersion<3){ensureStore(db,STORES.meta,"key");ensureStore(db,STORES.journal,"id");}
    if(oldVersion<4)ensureStore(db,STORES.tombstones,"id");
    if(tx&&db.objectStoreNames.contains(STORES.meta)){
      try{tx.objectStore(STORES.meta).put({key:"schema",dbVersion:newVersion,migratedFrom:oldVersion,steps:migrationPlan(oldVersion,newVersion),updatedAt:now()});}catch(e){}
    }
  }catch(e){throw new MigrationError("Database migration failed",{oldVersion:oldVersion,newVersion:newVersion,message:e.message});}
}

function assertVersionedWrite(current,incoming,expectedRevision,store,key){
  const actual=current?revisionOf(current):null,incomingRevision=revisionOf(incoming);
  if(expectedRevision!==undefined&&expectedRevision!==null&&actual!==null&&Number(actual)!==Number(expectedRevision))throw new PersistenceError("REVISION_CONFLICT","A newer version already exists",{store:store,key:key,expected:Number(expectedRevision),actual:Number(actual),current:current});
  if((expectedRevision===null||expectedRevision===undefined)&&current&&Number(actual)>Number(incomingRevision))throw new PersistenceError("REVISION_CONFLICT","Refusing to replace a newer stored revision",{store:store,key:key,actual:Number(actual),incoming:Number(incomingRevision),current:current});
  return true;
}
class Repository{
  constructor(dbPromise,store,keyField){this.dbPromise=dbPromise;this.store=store;this.keyField=keyField||"id";}
  async withStore(mode,fn){
    const db=await this.dbPromise,tx=db.transaction(this.store,mode),os=tx.objectStore(this.store);let value;
    try{value=await fn(os,tx);}catch(e){try{tx.abort();}catch(_e){}throw e;}await txPromise(tx);return value;
  }
  all(){return this.withStore("readonly",os=>requestPromise(os.getAll()));}
  get(key){return this.withStore("readonly",os=>requestPromise(os.get(key)));}
  put(value){return this.withStore("readwrite",os=>requestPromise(os.put(value)));}
  putVersioned(value,expectedRevision){
    const self=this,key=value&&value[this.keyField];if(key===undefined||key===null)throw new PersistenceError("MISSING_KEY","Versioned write requires a stable key");
    return this.withStore("readwrite",async function(os){
      const current=await requestPromise(os.get(key));assertVersionedWrite(current,value,expectedRevision,self.store,key);
      await requestPromise(os.put(value));return key;
    });
  }
  delete(key){return this.withStore("readwrite",os=>requestPromise(os.delete(key)));}
  clear(){return this.withStore("readwrite",os=>requestPromise(os.clear()));}
  count(){return this.withStore("readonly",os=>requestPromise(os.count()));}
}

class CalcDatabase{
  constructor(options){
    options=options||{};this.name=options.name||DB_NAME;this.version=options.version||DB_VERSION;this.indexedDB=options.indexedDB||global.indexedDB;this._promise=null;
  }
  open(){
    if(this._promise)return this._promise;
    if(!this.indexedDB)return Promise.reject(new PersistenceError("INDEXEDDB_UNAVAILABLE","IndexedDB is unavailable"));
    const self=this;this._promise=new Promise(function(resolve,reject){
      const req=self.indexedDB.open(self.name,self.version);
      req.onupgradeneeded=function(event){applyUpgrade(req.result,req.transaction,event.oldVersion,self.version);};
      req.onsuccess=function(){const db=req.result;db.onversionchange=function(){db.close();};resolve(db);};
      req.onerror=function(){reject(req.error||new PersistenceError("DB_OPEN_FAILED","Could not open Calc database"));};
      req.onblocked=function(){reject(new PersistenceError("DB_UPGRADE_BLOCKED","Database upgrade is blocked by another Calc tab"));};
    });return this._promise;
  }
  close(){return this._promise?this._promise.then(db=>{db.close();this._promise=null;}):Promise.resolve();}
  repository(store){return new Repository(this.open(),store,store===STORES.settings||store===STORES.meta?"key":"id");}
  async transaction(stores,mode,fn){
    const db=await this.open(),tx=db.transaction(stores,mode),objects={};stores.forEach(s=>objects[s]=tx.objectStore(s));let result;
    try{result=await fn(objects,tx);}catch(e){try{tx.abort();}catch(_e){}throw e;}await txPromise(tx);return result;
  }
  async allData(){
    const result={};for(const s of DATA_STORES)result[s]=await this.repository(s).all();return result;
  }
}

function normalizeSettings(items,clientSettings){
  const map={};(items||[]).forEach(x=>{if(x&&x.key)map[x.key]=x.value;});
  Object.keys(clientSettings||{}).forEach(k=>{map[k]=clientSettings[k];});
  return Object.keys(map).sort().map(k=>({key:k,value:map[k]}));
}
function entityKey(store,item){
  if(store===STORES.settings)return item&&item.key;
  return item&&item.id;
}
function validateStoreItems(store,items){
  if(!Array.isArray(items))throw new BackupError("Backup store '"+store+"' must be an array");
  if(items.length>MAX_BACKUP_ITEMS)throw new BackupError("Backup store '"+store+"' exceeds item limit");
  const seen=new Set();
  for(const item of items){
    if(!item||typeof item!=="object"||Array.isArray(item))throw new BackupError("Backup store '"+store+"' contains an invalid record");
    const key=entityKey(store,item);if(typeof key!=="string"||!key)throw new BackupError("Backup store '"+store+"' contains a record without a stable key");
    if(seen.has(key))throw new BackupError("Backup store '"+store+"' contains duplicate key '"+key+"'");seen.add(key);
  }
}
function countBackupItems(data){return DATA_STORES.reduce((n,s)=>n+(Array.isArray(data[s])?data[s].length:0),0);}
async function buildBackup(options){
  options=options||{};const db=options.db;if(!db)throw new BackupError("Database is required");
  const data=await db.allData();data[STORES.settings]=normalizeSettings(data[STORES.settings],options.clientSettings||{});
  for(const s of DATA_STORES)validateStoreItems(s,data[s]);
  const storeHashes={};for(const s of DATA_STORES)storeHashes[s]=await hashValue(data[s]);
  const payloadHash=await hashValue({stores:data,storeHashes:storeHashes});
  return {
    schema:BACKUP_SCHEMA,createdAt:new Date().toISOString(),app:{name:"Calc",dbVersion:DB_VERSION,appVersion:options.appVersion||"dev"},
    manifest:{stores:DATA_STORES.slice(),counts:Object.fromEntries(DATA_STORES.map(s=>[s,data[s].length])),storeHashes:storeHashes,payloadHash:payloadHash,totalItems:countBackupItems(data)},
    data:data
  };
}
async function validateBackup(input){
  let backup=input;
  if(typeof input==="string"){
    if(utf8Bytes(input).byteLength>MAX_BACKUP_BYTES)throw new BackupError("Backup exceeds "+MAX_BACKUP_BYTES+" bytes");
    try{backup=JSON.parse(input);}catch(e){throw new BackupError("Invalid backup JSON: "+e.message);}
  }
  if(!backup||typeof backup!=="object"||backup.schema!==BACKUP_SCHEMA)throw new BackupError("Unsupported backup schema");
  if(!backup.manifest||!backup.data)throw new BackupError("Backup manifest/data is missing");
  if(backup.app&&Number(backup.app.dbVersion)>DB_VERSION)throw new BackupError("Backup was created by a newer Calc database schema",{backupDbVersion:Number(backup.app.dbVersion),supportedDbVersion:DB_VERSION});
  const allowed=new Set(DATA_STORES);for(const s of backup.manifest.stores||[])if(!allowed.has(s))throw new BackupError("Unknown backup store '"+s+"'");
  for(const s of DATA_STORES){if(!Array.isArray(backup.data[s]))backup.data[s]=[];validateStoreItems(s,backup.data[s]);}
  if(countBackupItems(backup.data)>MAX_BACKUP_ITEMS)throw new BackupError("Backup exceeds total item limit");
  const hashes={};for(const s of DATA_STORES){hashes[s]=await hashValue(backup.data[s]);if(backup.manifest.storeHashes&&backup.manifest.storeHashes[s]&&hashes[s]!==backup.manifest.storeHashes[s])throw new IntegrityError("Integrity check failed for "+s,{expected:backup.manifest.storeHashes[s],actual:hashes[s]});}
  const payloadHash=await hashValue({stores:backup.data,storeHashes:hashes});
  if(backup.manifest.payloadHash&&payloadHash!==backup.manifest.payloadHash)throw new IntegrityError("Backup payload hash mismatch",{expected:backup.manifest.payloadHash,actual:payloadHash});
  return {backup:backup,storeHashes:hashes,payloadHash:payloadHash};
}
async function encryptBackup(backupInput,password,options){
  options=options||{};const checked=await validateBackup(backupInput),iterations=Math.max(1000,Number(options.iterations)||250000),salt=randomBytes(16),iv=randomBytes(12),key=await deriveBackupKey(password,salt,iterations);
  const plaintext=stableStringify(checked.backup),plaintextHash=await sha256Text(plaintext),cipher=await global.crypto.subtle.encrypt({name:"AES-GCM",iv:iv},key,utf8Bytes(plaintext));
  return {schema:ENCRYPTED_BACKUP_SCHEMA,createdAt:new Date().toISOString(),kdf:{name:"PBKDF2",hash:"SHA-256",iterations:iterations,salt:bytesToBase64(salt)},cipher:{name:"AES-GCM",iv:bytesToBase64(iv)},plaintextHash:plaintextHash,ciphertext:bytesToBase64(new Uint8Array(cipher))};
}
async function decryptBackup(encrypted,password){
  if(typeof encrypted==="string"){try{encrypted=JSON.parse(encrypted);}catch(e){throw new BackupError("Invalid encrypted backup JSON: "+e.message);}}
  if(!encrypted||encrypted.schema!==ENCRYPTED_BACKUP_SCHEMA)throw new BackupError("Unsupported encrypted backup schema");
  const kdf=encrypted.kdf||{},cipher=encrypted.cipher||{};if(kdf.name!=="PBKDF2"||kdf.hash!=="SHA-256"||cipher.name!=="AES-GCM")throw new BackupError("Unsupported encrypted backup algorithm");
  try{
    const salt=base64ToBytes(kdf.salt),iv=base64ToBytes(cipher.iv),key=await deriveBackupKey(password,salt,Number(kdf.iterations)),bytes=base64ToBytes(encrypted.ciphertext);
    const plainBuffer=await global.crypto.subtle.decrypt({name:"AES-GCM",iv:iv},key,bytes),plaintext=new TextDecoder().decode(plainBuffer);
    const actualHash=await sha256Text(plaintext);if(encrypted.plaintextHash&&actualHash!==encrypted.plaintextHash)throw new IntegrityError("Decrypted backup plaintext hash mismatch");
    const checked=await validateBackup(plaintext);return checked.backup;
  }catch(e){if(e instanceof PersistenceError)throw e;throw new BackupError("Could not decrypt backup. The password may be incorrect or the file may be damaged.");}
}
async function openBackup(input,password){
  let root=input;if(typeof input==="string"){if(utf8Bytes(input).byteLength>MAX_BACKUP_BYTES*2)throw new BackupError("Backup file is too large");try{root=JSON.parse(input);}catch(e){throw new BackupError("Invalid backup JSON: "+e.message);}}
  if(root&&root.schema===ENCRYPTED_BACKUP_SCHEMA){const decrypted=await decryptBackup(root,password);return validateBackup(decrypted);}
  return validateBackup(root);
}
function revisionOf(item){return Number(item&&item.revision)||Number(item&&item.updatedAt)||Number(item&&item.time)||0;}
function mergeStore(current,incoming,store,policy){
  policy=policy||"newer";const map=new Map(),conflicts=[];
  for(const item of current||[])map.set(entityKey(store,item),item);
  for(const item of incoming||[]){
    const key=entityKey(store,item),existing=map.get(key);if(!existing){map.set(key,item);continue;}
    if(stableStringify(existing)===stableStringify(item))continue;
    if(store===STORES.settings){if(policy==="incoming")map.set(key,item);else if(policy==="newer")map.set(key,item);continue;}
    const a=revisionOf(existing),b=revisionOf(item);
    if(policy==="incoming"||b>a)map.set(key,item);
    else if(policy==="conflict-copy"||a===b){
      const copy=cloneWithConflictId(item,store,key);map.set(entityKey(store,copy),copy);conflicts.push({store:store,key:key,copyKey:entityKey(store,copy)});
    }
  }
  return {items:Array.from(map.values()),conflicts:conflicts};
}
function cloneWithConflictId(item,store,key){
  const c=JSON.parse(JSON.stringify(item)),suffix="-conflict-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,6);
  if(store===STORES.settings)c.key=String(key)+suffix;else c.id=String(key)+suffix;
  if(c.title)c.title+=" (conflict copy)";if(c.name)c.name+=" (conflict copy)";c.updatedAt=now();return c;
}
async function planRestore(db,backupInput,options){
  options=options||{};const checked=await validateBackup(backupInput),backup=checked.backup,mode=options.mode||"merge";
  if(!["merge","replace"].includes(mode))throw new RestoreError("Restore mode must be merge or replace");
  const selectedStores=(options.stores&&options.stores.length?options.stores:DATA_STORES).filter((s,i,a)=>DATA_STORES.includes(s)&&a.indexOf(s)===i);
  if(!selectedStores.length)throw new RestoreError("Select at least one store to restore");
  const current=await db.allData(),result={},conflicts=[],currentHashes={};
  for(const s of DATA_STORES){
    currentHashes[s]=await hashValue(current[s]);
    if(!selectedStores.includes(s)){result[s]=current[s].map(x=>JSON.parse(JSON.stringify(x)));continue;}
    if(mode==="replace")result[s]=backup.data[s].map(x=>JSON.parse(JSON.stringify(x)));
    else{const merged=mergeStore(current[s],backup.data[s],s,options.conflictPolicy||"newer");result[s]=merged.items;conflicts.push.apply(conflicts,merged.conflicts);}
  }
  return {schema:BACKUP_SCHEMA,mode:mode,selectedStores:selectedStores,data:result,conflicts:conflicts,currentHashes:currentHashes,summary:{current:Object.fromEntries(DATA_STORES.map(s=>[s,current[s].length])),incoming:Object.fromEntries(DATA_STORES.map(s=>[s,backup.data[s].length])),result:Object.fromEntries(DATA_STORES.map(s=>[s,result[s].length]))},verifiedHash:checked.payloadHash};
}
async function applyRestore(db,plan){
  if(!plan||!plan.data)throw new RestoreError("Restore plan is missing");
  const selectedStores=plan.selectedStores&&plan.selectedStores.length?plan.selectedStores:DATA_STORES;
  if(plan.currentHashes){
    const current=await db.allData(),changed=[];
    for(const s of selectedStores){const h=await hashValue(current[s]);if(h!==plan.currentHashes[s])changed.push(s);}
    if(changed.length)throw new RestoreStaleError("Local data changed after the restore preview. Rebuild the restore plan before applying.",{stores:changed});
  }
  const journalId=randomId("restore"),entry={id:journalId,type:"restore",status:"started",mode:plan.mode,createdAt:now(),summary:plan.summary};
  await db.repository(STORES.journal).put(entry);
  try{
    const storesForTransaction=selectedStores.concat([STORES.journal,STORES.meta]);
    await db.transaction(storesForTransaction,"readwrite",async function(stores){
      for(const s of selectedStores){
        await requestPromise(stores[s].clear());
        for(const item of plan.data[s])await requestPromise(stores[s].put(item));
      }
      entry.status="committed";entry.committedAt=now();
      await requestPromise(stores[STORES.journal].put(entry));
      await requestPromise(stores[STORES.meta].put({key:"lastRestore",id:journalId,mode:plan.mode,committedAt:entry.committedAt,verifiedHash:plan.verifiedHash}));
    });
    return entry;
  }catch(e){
    entry.status="failed";entry.failedAt=now();entry.error=e.message;try{await db.repository(STORES.journal).put(entry);}catch(_e){}
    if(e&&e.code==="RESTORE_STALE_PLAN")throw e;
    throw new RestoreError("Atomic restore failed; original transaction was aborted",{message:e.message,journalId:journalId});
  }
}
async function integrityReport(db){
  const data=await db.allData(),issues=[],hashes={},counts={};
  for(const s of DATA_STORES){counts[s]=data[s].length;try{validateStoreItems(s,data[s]);hashes[s]=await hashValue(data[s]);}catch(e){issues.push({store:s,message:e.message,code:e.code||"ERROR"});}}
  const schema=await db.repository(STORES.meta).get("schema");
  return {ok:issues.length===0,dbVersion:DB_VERSION,schemaMeta:schema||null,counts:counts,hashes:hashes,issues:issues,checkedAt:now()};
}
async function storageEstimate(){
  if(global.navigator&&navigator.storage&&navigator.storage.estimate){
    const e=await navigator.storage.estimate(),usage=Number(e.usage)||0,quota=Number(e.quota)||0;return {supported:true,usage:usage,quota:quota,ratio:quota?usage/quota:0,persisted:navigator.storage.persisted?await navigator.storage.persisted():null};
  }
  return {supported:false,usage:0,quota:0,ratio:0,persisted:null};
}
async function requestPersistentStorage(){
  if(global.navigator&&navigator.storage&&navigator.storage.persist)return navigator.storage.persist();
  return false;
}
async function cleanupJournal(db,maxAgeMs){
  maxAgeMs=maxAgeMs||7*86400000;const repo=db.repository(STORES.journal),items=await repo.all(),cutoff=now()-maxAgeMs,removed=[];
  for(const item of items)if((item.committedAt||item.failedAt||item.createdAt||0)<cutoff){await repo.delete(item.id);removed.push(item.id);}return removed;
}
async function recordTombstone(db,entityType,entityId,revision,extra){
  const item=Object.assign({id:String(entityType)+":"+String(entityId),entityType:String(entityType),entityId:String(entityId),revision:Number(revision)||0,deletedAt:now(),deviceId:null},extra||{});
  await db.repository(STORES.tombstones).put(item);return item;
}
async function deleteWithTombstone(db,store,key,options){
  options=options||{};if(!DATA_STORES.includes(store)||store===STORES.tombstones)throw new PersistenceError("TOMBSTONE_STORE","Unsupported tombstone source store");
  const repo=db.repository(store),current=await repo.get(key),revision=Number(options.revision)||(current?revisionOf(current)+1:1);
  await db.transaction([store,STORES.tombstones],"readwrite",async function(stores){
    await requestPromise(stores[store].delete(key));
    await requestPromise(stores[STORES.tombstones].put({id:String(store)+":"+String(key),entityType:store,entityId:String(key),revision:revision,deletedAt:now(),deviceId:options.deviceId||null}));
  });
  return {store:store,key:key,revision:revision};
}
async function recoveryReport(db){
  const journal=await db.repository(STORES.journal).all(),incomplete=journal.filter(x=>x.status==="started"),failed=journal.filter(x=>x.status==="failed");
  return {incomplete:incomplete,failed:failed,needsAttention:incomplete.length>0||failed.length>0};
}

class CrossTabCoordinator{
  constructor(options){
    options=options||{};this.channelName=options.channelName||CHANNEL_NAME;this.sender=options.sender||randomId("tab");this.channel=null;this.listeners=new Set();this.lastSeen=new Map();
  }
  start(){
    if(this.channel||typeof BroadcastChannel==="undefined")return false;const self=this;this.channel=new BroadcastChannel(this.channelName);this.channel.onmessage=function(e){const m=e.data||{};if(m.sender===self.sender)return;const key=m.entityType+":"+m.entityId,prev=self.lastSeen.get(key)||0;if(m.revision!==undefined&&m.revision<prev)return;if(m.revision!==undefined)self.lastSeen.set(key,m.revision);self.listeners.forEach(fn=>fn(m));};return true;
  }
  subscribe(fn){this.listeners.add(fn);return ()=>this.listeners.delete(fn);}
  publish(message){const m=Object.assign({schema:"calc.broadcast/v1",sender:this.sender,time:now()},message);if(m.entityType&&m.entityId&&m.revision!==undefined)this.lastSeen.set(m.entityType+":"+m.entityId,m.revision);if(this.channel)this.channel.postMessage(m);return m;}
  stop(){if(this.channel){this.channel.close();this.channel=null;}}
}

class SyncAdapter{
  constructor(id){this.id=id||"adapter";}
  async push(_bundle){throw new PersistenceError("SYNC_UNSUPPORTED","Sync adapter does not implement push");}
  async pull(){throw new PersistenceError("SYNC_UNSUPPORTED","Sync adapter does not implement pull");}
}
class DisabledSyncAdapter extends SyncAdapter{
  constructor(){super("disabled");}
  async push(){return {status:"disabled"};}async pull(){return {status:"disabled",bundle:null};}
}
class SyncManager{
  constructor(options){options=options||{};this.adapter=options.adapter||new DisabledSyncAdapter();this.enabled=!!options.enabled;this.deviceId=options.deviceId||randomId("device");}
  status(){return {schema:SYNC_SCHEMA,enabled:this.enabled,adapter:this.adapter.id,deviceId:this.deviceId};}
  setAdapter(adapter){this.adapter=adapter||new DisabledSyncAdapter();}
  setEnabled(value){this.enabled=!!value;}
  async push(bundle){if(!this.enabled)return {status:"disabled"};return this.adapter.push({schema:SYNC_SCHEMA,deviceId:this.deviceId,bundle:bundle});}
  async pull(){if(!this.enabled)return {status:"disabled",bundle:null};return this.adapter.pull();}
}

global.CalcPersistence={
  VERSION:"1.0.0-persistence",DB_NAME:DB_NAME,DB_VERSION:DB_VERSION,BACKUP_SCHEMA:BACKUP_SCHEMA,ENCRYPTED_BACKUP_SCHEMA:ENCRYPTED_BACKUP_SCHEMA,SYNC_SCHEMA:SYNC_SCHEMA,STORES:STORES,DATA_STORES:DATA_STORES,
  PersistenceError:PersistenceError,BackupError:BackupError,RestoreError:RestoreError,RestoreStaleError:RestoreStaleError,IntegrityError:IntegrityError,MigrationError:MigrationError,
  stableStringify:stableStringify,sha256Text:sha256Text,hashValue:hashValue,migrationPlan:migrationPlan,applyUpgrade:applyUpgrade,
  Repository:Repository,CalcDatabase:CalcDatabase,assertVersionedWrite:assertVersionedWrite,buildBackup:buildBackup,validateBackup:validateBackup,encryptBackup:encryptBackup,decryptBackup:decryptBackup,openBackup:openBackup,mergeStore:mergeStore,planRestore:planRestore,applyRestore:applyRestore,
  integrityReport:integrityReport,storageEstimate:storageEstimate,requestPersistentStorage:requestPersistentStorage,cleanupJournal:cleanupJournal,recordTombstone:recordTombstone,deleteWithTombstone:deleteWithTombstone,recoveryReport:recoveryReport,
  CrossTabCoordinator:CrossTabCoordinator,SyncAdapter:SyncAdapter,DisabledSyncAdapter:DisabledSyncAdapter,SyncManager:SyncManager
};
})(window);