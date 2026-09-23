(function(global){
"use strict";

const DB_NAME="calc-db";
const DB_VERSION=5;
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
  tombstones:"tombstones",
  chunks:"chunks"
});
const DATA_STORES=Object.freeze([STORES.history,STORES.notebooks,STORES.settings,STORES.customTools,STORES.tombstones]);
const INTERNAL_STORES=Object.freeze([STORES.meta,STORES.journal,STORES.chunks]);
const ALL_STORES=Object.freeze(DATA_STORES.concat(INTERNAL_STORES));
const MAX_BACKUP_BYTES=64*1024*1024;
const MAX_BACKUP_ITEMS=100000;
const NOTEBOOK_EXTERNALIZE_BYTES=48*1024;
const NOTEBOOK_CHUNK_BYTES=64*1024;
const BACKUP_PART_CHARS=256*1024;
const TRASH_RETENTION_MS=30*86400000;
const NOTEBOOK_STORAGE_SCHEMA="calc.notebook.storage/v1";
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
  if(oldVersion<5&&newVersion>=5)steps.push("create-payload-chunks");
  return steps;
}
function applyUpgrade(db,tx,oldVersion,newVersion){
  try{
    if(oldVersion<1){ensureStore(db,STORES.history,"id");ensureStore(db,STORES.notebooks,"id");ensureStore(db,STORES.settings,"key");}
    if(oldVersion<2)ensureStore(db,STORES.customTools,"id");
    if(oldVersion<3){ensureStore(db,STORES.meta,"key");ensureStore(db,STORES.journal,"id");}
    if(oldVersion<4)ensureStore(db,STORES.tombstones,"id");
    if(oldVersion<5)ensureStore(db,STORES.chunks,"id");
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
    const result={};
    for(const s of DATA_STORES)result[s]=s===STORES.notebooks?await loadNotebooks(this):await this.repository(s).all();
    return result;
  }
}

function jsonClone(v){return v===undefined?undefined:JSON.parse(JSON.stringify(v));}
function clockNow(){return global.performance&&typeof global.performance.now==="function"?global.performance.now():Date.now();}
function notebookChunkId(notebookId,blockId,index){return "nbchunk:"+String(notebookId)+":"+String(blockId)+":source:"+index;}
function externalizedEntries(record){
  return record&&record.persistence&&record.persistence.schema===NOTEBOOK_STORAGE_SCHEMA&&Array.isArray(record.persistence.externalized)?record.persistence.externalized:[];
}
function chunkRefsOf(record){
  const out=[];externalizedEntries(record).forEach(function(e){(e.chunks||[]).forEach(function(ch){if(ch&&ch.id)out.push(ch.id);});});return out;
}
function splitStringChunks(text,maxBytes){
  text=String(text||"");maxBytes=Math.max(1024,Number(maxBytes)||NOTEBOOK_CHUNK_BYTES);if(!text)return [""];
  const out=[];let start=0;
  while(start<text.length){
    let cap=Math.min(text.length,start+maxBytes),best=cap;
    if(utf8Bytes(text.slice(start,cap)).byteLength>maxBytes){
      let lo=start+1,hi=cap;best=lo;
      while(lo<=hi){
        const mid=Math.floor((lo+hi)/2),size=utf8Bytes(text.slice(start,mid)).byteLength;
        if(size<=maxBytes){best=mid;lo=mid+1;}else hi=mid-1;
      }
    }
    if(best<text.length&&best>start){
      const prev=text.charCodeAt(best-1),next=text.charCodeAt(best);
      if(prev>=0xD800&&prev<=0xDBFF&&next>=0xDC00&&next<=0xDFFF)best--;
    }
    if(best<=start)best=Math.min(text.length,start+1);
    out.push(text.slice(start,best));start=best;
  }
  return out;
}
async function encodeNotebookForStorage(notebook,options){
  options=options||{};const threshold=Math.max(4096,Number(options.externalizeBytes)||NOTEBOOK_EXTERNALIZE_BYTES),chunkBytes=Math.max(4096,Number(options.chunkBytes)||NOTEBOOK_CHUNK_BYTES),record=jsonClone(notebook),chunks=[],externalized=[];
  delete record.persistence;
  for(const block of record.blocks||[]){
    const source=String(block.source||""),bytes=utf8Bytes(source).byteLength;
    if(bytes<threshold)continue;
    const parts=splitStringChunks(source,chunkBytes),refs=[];
    for(let i=0;i<parts.length;i++){
      const data=parts[i],id=notebookChunkId(record.id,block.id,i),hash=await sha256Text(data),partBytes=utf8Bytes(data).byteLength;
      refs.push({id:id,hash:hash,bytes:partBytes});
      chunks.push({id:id,notebookId:String(record.id),blockId:String(block.id),field:"source",index:i,total:parts.length,hash:hash,bytes:partBytes,data:data,updatedAt:Number(record.updatedAt)||now()});
    }
    externalized.push({blockId:String(block.id),field:"source",hash:await sha256Text(source),bytes:bytes,chunks:refs});
    block.source="";
  }
  if(externalized.length)record.persistence={schema:NOTEBOOK_STORAGE_SCHEMA,externalized:externalized,chunkBytes:chunkBytes,updatedAt:Number(record.updatedAt)||now()};
  return {record:record,chunks:chunks,externalizedBytes:externalized.reduce((n,e)=>n+e.bytes,0)};
}
async function hydrateNotebookRecord(db,raw){
  if(!raw)return raw;const record=jsonClone(raw),entries=externalizedEntries(record);if(!entries.length){delete record.persistence;return record;}
  const byId=new Map((record.blocks||[]).map(function(b){return [String(b.id),b];})),loaded=new Map(),allRefs=[];
  entries.forEach(function(e){(e.chunks||[]).forEach(function(ch){if(ch&&ch.id)allRefs.push(ch);});});
  await db.transaction([STORES.chunks],"readonly",async function(stores){
    for(const ref of allRefs){loaded.set(ref.id,await requestPromise(stores[STORES.chunks].get(ref.id)));}
  });
  for(const entry of entries){
    const block=byId.get(String(entry.blockId));if(!block)throw new IntegrityError("Chunk metadata references a missing notebook block",{notebookId:record.id,blockId:entry.blockId});
    let source="";
    for(const ref of entry.chunks||[]){
      const chunk=loaded.get(ref.id);if(!chunk)throw new IntegrityError("Notebook payload chunk is missing",{notebookId:record.id,blockId:entry.blockId,chunkId:ref.id});
      const actual=await sha256Text(String(chunk.data||""));if(ref.hash&&actual!==ref.hash)throw new IntegrityError("Notebook payload chunk hash mismatch",{notebookId:record.id,blockId:entry.blockId,chunkId:ref.id,expected:ref.hash,actual:actual});
      source+=String(chunk.data||"");
    }
    const totalHash=await sha256Text(source);if(entry.hash&&totalHash!==entry.hash)throw new IntegrityError("Notebook payload hash mismatch",{notebookId:record.id,blockId:entry.blockId,expected:entry.hash,actual:totalHash});
    block.source=source;
  }
  delete record.persistence;return record;
}
async function loadNotebook(db,id){return hydrateNotebookRecord(db,await db.repository(STORES.notebooks).get(id));}
async function loadNotebooks(db){
  const raw=await db.repository(STORES.notebooks).all(),out=[];
  for(const item of raw)out.push(await hydrateNotebookRecord(db,item));
  return out;
}
async function saveNotebookIncremental(db,notebook,expectedRevision,options){
  const encoded=await encodeNotebookForStorage(notebook,options);let stats;
  try{
    stats=await db.transaction([STORES.notebooks,STORES.chunks],"readwrite",async function(stores){
      const current=await requestPromise(stores[STORES.notebooks].get(encoded.record.id));assertVersionedWrite(current,encoded.record,expectedRevision,STORES.notebooks,encoded.record.id);
      const oldMeta=new Map();externalizedEntries(current).forEach(function(e){(e.chunks||[]).forEach(function(ch){if(ch&&ch.id)oldMeta.set(ch.id,ch.hash||"");});});
      const nextIds=new Set(encoded.chunks.map(function(ch){return ch.id;})),oldIds=chunkRefsOf(current),removed=oldIds.filter(function(id){return !nextIds.has(id);});let writes=0;
      for(const id of removed)await requestPromise(stores[STORES.chunks].delete(id));
      for(const chunk of encoded.chunks){if(oldMeta.get(chunk.id)===chunk.hash)continue;await requestPromise(stores[STORES.chunks].put(chunk));writes++;}
      await requestPromise(stores[STORES.notebooks].put(encoded.record));
      return {key:encoded.record.id,chunkWrites:writes,chunkDeletes:removed.length,chunkRecords:encoded.chunks.length,externalizedBytes:encoded.externalizedBytes};
    });
    return stats;
  }catch(e){
    if(e&&e.code==="REVISION_CONFLICT"&&e.details&&e.details.current){
      try{e.details.current=await hydrateNotebookRecord(db,e.details.current);}catch(_hydrate){}
    }
    throw e;
  }
}
async function deleteNotebookWithTombstone(db,key,options){
  options=options||{};const raw=await db.repository(STORES.notebooks).get(key),canonical=raw?await hydrateNotebookRecord(db,raw):null,baseRevision=raw?revisionOf(raw):0,revision=Number(options.revision)||baseRevision+1;
  const tomb={id:STORES.notebooks+":"+String(key),entityType:STORES.notebooks,entityId:String(key),revision:revision,deletedAt:now(),deviceId:options.deviceId||null,payload:canonical?jsonClone(canonical):null,recoverable:!!canonical,purgeAfter:now()+TRASH_RETENTION_MS};
  await db.transaction([STORES.notebooks,STORES.tombstones,STORES.chunks],"readwrite",async function(stores){
    const latest=await requestPromise(stores[STORES.notebooks].get(key));if(raw&&latest&&revisionOf(latest)!==baseRevision)throw new PersistenceError("REVISION_CONFLICT","Notebook changed before deletion",{store:STORES.notebooks,key:key,expected:baseRevision,actual:revisionOf(latest)});
    for(const id of chunkRefsOf(latest||raw))await requestPromise(stores[STORES.chunks].delete(id));
    await requestPromise(stores[STORES.notebooks].delete(key));await requestPromise(stores[STORES.tombstones].put(tomb));
  });
  return {store:STORES.notebooks,key:key,revision:revision,tombstone:tomb};
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
  let encodedNotebooks=[];
  if(selectedStores.includes(STORES.notebooks)){
    for(const notebook of plan.data[STORES.notebooks]||[])encodedNotebooks.push(await encodeNotebookForStorage(notebook));
  }
  const journalId=randomId("restore"),entry={id:journalId,type:"restore",status:"started",mode:plan.mode,createdAt:now(),summary:plan.summary};
  await db.repository(STORES.journal).put(entry);
  try{
    const storesForTransaction=Array.from(new Set(selectedStores.concat([STORES.journal,STORES.meta],selectedStores.includes(STORES.notebooks)?[STORES.chunks]:[])));
    await db.transaction(storesForTransaction,"readwrite",async function(stores){
      for(const s of selectedStores){
        if(s===STORES.notebooks){
          await requestPromise(stores[STORES.notebooks].clear());await requestPromise(stores[STORES.chunks].clear());
          for(const encoded of encodedNotebooks){for(const chunk of encoded.chunks)await requestPromise(stores[STORES.chunks].put(chunk));await requestPromise(stores[STORES.notebooks].put(encoded.record));}
        }else{
          await requestPromise(stores[s].clear());
          for(const item of plan.data[s])await requestPromise(stores[s].put(item));
        }
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
  const issues=[],warnings=[],hashes={},counts={},rawNotebooks=await db.repository(STORES.notebooks).all(),referenced=new Set(),canonical=[];
  counts[STORES.notebooks]=rawNotebooks.length;
  for(const raw of rawNotebooks){
    chunkRefsOf(raw).forEach(function(id){referenced.add(id);});
    try{canonical.push(await hydrateNotebookRecord(db,raw));}catch(e){issues.push({store:STORES.notebooks,key:raw&&raw.id,message:e.message,code:e.code||"ERROR"});}
  }
  if(!issues.some(function(i){return i.store===STORES.notebooks;})){try{validateStoreItems(STORES.notebooks,canonical);hashes[STORES.notebooks]=await hashValue(canonical);}catch(e){issues.push({store:STORES.notebooks,message:e.message,code:e.code||"ERROR"});}}
  for(const s of DATA_STORES){
    if(s===STORES.notebooks)continue;
    try{const items=await db.repository(s).all();counts[s]=items.length;validateStoreItems(s,items);hashes[s]=await hashValue(items);}catch(e){issues.push({store:s,message:e.message,code:e.code||"ERROR"});}
  }
  const chunkItems=await db.repository(STORES.chunks).all(),orphans=chunkItems.filter(function(ch){return !referenced.has(ch.id);});
  if(orphans.length)warnings.push({store:STORES.chunks,code:"ORPHAN_CHUNKS",message:orphans.length+" unreferenced payload chunk(s) can be cleaned safely"});
  const schema=await db.repository(STORES.meta).get("schema");
  return {ok:issues.length===0,dbVersion:DB_VERSION,schemaMeta:schema||null,counts:counts,hashes:hashes,issues:issues,warnings:warnings,chunkStats:{records:chunkItems.length,referenced:referenced.size,orphaned:orphans.length},checkedAt:now()};
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
  const item=Object.assign({id:String(entityType)+":"+String(entityId),entityType:String(entityType),entityId:String(entityId),revision:Number(revision)||0,deletedAt:now(),deviceId:null,payload:null,recoverable:false,purgeAfter:now()+TRASH_RETENTION_MS},extra||{});
  await db.repository(STORES.tombstones).put(item);return item;
}
async function deleteWithTombstone(db,store,key,options){
  options=options||{};if(!DATA_STORES.includes(store)||store===STORES.tombstones)throw new PersistenceError("TOMBSTONE_STORE","Unsupported tombstone source store");
  if(store===STORES.notebooks)return deleteNotebookWithTombstone(db,key,options);
  const repo=db.repository(store),current=await repo.get(key),revision=Number(options.revision)||(current?revisionOf(current)+1:1),tomb={id:String(store)+":"+String(key),entityType:store,entityId:String(key),revision:revision,deletedAt:now(),deviceId:options.deviceId||null,payload:current?jsonClone(current):null,recoverable:!!current,purgeAfter:now()+TRASH_RETENTION_MS};
  await db.transaction([store,STORES.tombstones],"readwrite",async function(stores){
    const latest=await requestPromise(stores[store].get(key));if(current&&latest&&revisionOf(latest)!==revisionOf(current))throw new PersistenceError("REVISION_CONFLICT","Item changed before deletion",{store:store,key:key,expected:revisionOf(current),actual:revisionOf(latest)});
    await requestPromise(stores[store].delete(key));await requestPromise(stores[STORES.tombstones].put(tomb));
  });
  return {store:store,key:key,revision:revision,tombstone:tomb};
}
async function listTrash(db){const items=await db.repository(STORES.tombstones).all();return items.sort(function(a,b){return Number(b.deletedAt||0)-Number(a.deletedAt||0);});}
async function purgeTombstone(db,id){await db.repository(STORES.tombstones).delete(id);return true;}
async function emptyTrash(db){await db.repository(STORES.tombstones).clear();return true;}
async function cleanupTrash(db,maxAgeMs){
  maxAgeMs=Number(maxAgeMs)||TRASH_RETENTION_MS;const items=await db.repository(STORES.tombstones).all(),cutoff=now()-maxAgeMs,removed=[];
  for(const item of items){if(Number(item.deletedAt||0)<cutoff){await db.repository(STORES.tombstones).delete(item.id);removed.push(item.id);}}
  return removed;
}
async function restoreTombstone(db,id){
  const tomb=await db.repository(STORES.tombstones).get(id);if(!tomb)throw new RestoreError("Trash item no longer exists");
  if(!tomb.payload)throw new RestoreError("This older trash record contains deletion metadata only and cannot be restored");
  const store=tomb.entityType;if(!DATA_STORES.includes(store)||store===STORES.tombstones)throw new RestoreError("Unsupported trash entity type");
  let payload=jsonClone(tomb.payload),key=entityKey(store,payload);
  if(store===STORES.notebooks){
    const existing=await db.repository(store).get(key);
    if(existing){payload.id=randomId("notebook-restored");payload.title=(payload.title||"Notebook")+" (restored copy)";payload.revision=Math.max(1,revisionOf(payload)+1);payload.updatedAt=now();key=payload.id;}
    const encoded=await encodeNotebookForStorage(payload);
    await db.transaction([STORES.notebooks,STORES.chunks,STORES.tombstones],"readwrite",async function(stores){
      for(const chunk of encoded.chunks)await requestPromise(stores[STORES.chunks].put(chunk));
      await requestPromise(stores[STORES.notebooks].put(encoded.record));await requestPromise(stores[STORES.tombstones].delete(id));
    });
    return {store:store,key:key,item:payload};
  }
  const existing=await db.repository(store).get(key);
  if(existing){
    if(store===STORES.settings)throw new RestoreError("A setting with this key already exists; restore it through backup/restore instead");
    payload.id=String(key)+"-restored-"+Date.now().toString(36);if(payload.title)payload.title+=" (restored copy)";if(payload.name)payload.name+=" (restored copy)";payload.updatedAt=now();key=payload.id;
  }
  await db.transaction([store,STORES.tombstones],"readwrite",async function(stores){await requestPromise(stores[store].put(payload));await requestPromise(stores[STORES.tombstones].delete(id));});
  return {store:store,key:key,item:payload};
}
async function recoveryReport(db){
  const journal=await db.repository(STORES.journal).all(),incomplete=journal.filter(x=>x.status==="started"),failed=journal.filter(x=>x.status==="failed"),trash=await db.repository(STORES.tombstones).count();
  return {incomplete:incomplete,failed:failed,trashCount:trash,needsAttention:incomplete.length>0||failed.length>0};
}

function appendChunkedText(parts,text,size){
  text=String(text);size=Math.max(16384,Number(size)||BACKUP_PART_CHARS);for(let i=0;i<text.length;i+=size)parts.push(text.slice(i,i+size));
}
function buildBackupBlob(payload,options){
  options=options||{};const partChars=Math.max(16384,Number(options.partChars)||BACKUP_PART_CHARS),parts=[];
  if(payload&&payload.schema===BACKUP_SCHEMA&&payload.data){
    const head={schema:payload.schema,createdAt:payload.createdAt,app:payload.app,manifest:payload.manifest},prefix=JSON.stringify(head);
    appendChunkedText(parts,prefix.slice(0,-1)+',"data":{',partChars);
    DATA_STORES.forEach(function(store,si){
      if(si)parts.push(",");parts.push(JSON.stringify(store)+":[");
      const items=Array.isArray(payload.data[store])?payload.data[store]:[];
      items.forEach(function(item,ii){if(ii)parts.push(",");appendChunkedText(parts,JSON.stringify(item),partChars);});
      parts.push("]");
    });
    parts.push("}}");
  }else appendChunkedText(parts,JSON.stringify(payload),partChars);
  return new Blob(parts,{type:"application/json"});
}
async function storagePerformance(db,options){
  options=options||{};const totalBytes=Math.max(64*1024,Math.min(4*1024*1024,Number(options.totalBytes)||1024*1024)),chunkBytes=Math.max(16*1024,Math.min(256*1024,Number(options.chunkBytes)||64*1024)),count=Math.ceil(totalBytes/chunkBytes),prefix="diag:"+randomId("perf"),payload="x".repeat(chunkBytes),ids=[];
  for(let i=0;i<count;i++)ids.push(prefix+":"+i);
  let writeMs=0,readMs=0,deleteMs=0;
  try{
    let t=clockNow();
    await db.transaction([STORES.chunks],"readwrite",async function(stores){for(let i=0;i<count;i++)await requestPromise(stores[STORES.chunks].put({id:ids[i],diagnostic:true,data:payload,bytes:chunkBytes,updatedAt:now()}));});
    writeMs=clockNow()-t;t=clockNow();
    await db.transaction([STORES.chunks],"readonly",async function(stores){for(const id of ids){const item=await requestPromise(stores[STORES.chunks].get(id));if(!item)throw new IntegrityError("Storage benchmark read-back failed",{id:id});}});
    readMs=clockNow()-t;t=clockNow();
    await db.transaction([STORES.chunks],"readwrite",async function(stores){for(const id of ids)await requestPromise(stores[STORES.chunks].delete(id));});
    deleteMs=clockNow()-t;
    return {ok:true,totalBytes:count*chunkBytes,count:count,writeMs:writeMs,readMs:readMs,deleteMs:deleteMs,writeMBps:writeMs?((count*chunkBytes)/(1024*1024))/(writeMs/1000):null,readMBps:readMs?((count*chunkBytes)/(1024*1024))/(readMs/1000):null};
  }catch(e){
    try{await db.transaction([STORES.chunks],"readwrite",async function(stores){for(const id of ids)await requestPromise(stores[STORES.chunks].delete(id));});}catch(_cleanup){}
    throw e;
  }
}
function deleteDatabasePromise(idb,name){
  return new Promise(function(resolve,reject){const req=idb.deleteDatabase(name);req.onsuccess=function(){resolve();};req.onerror=function(){reject(req.error||new Error("Could not delete test database"));};req.onblocked=function(){resolve();};});
}
function openMigrationTestDb(idb,name,version){
  return new Promise(function(resolve,reject){const req=idb.open(name,version);req.onupgradeneeded=function(e){applyUpgrade(req.result,req.transaction,e.oldVersion,version);};req.onsuccess=function(){resolve(req.result);};req.onerror=function(){reject(req.error||new MigrationError("Migration soak open failed",{version:version}));};req.onblocked=function(){reject(new MigrationError("Migration soak was blocked",{version:version}));};});
}
async function migrationSoakTest(){
  if(!global.indexedDB)return {status:"skipped",message:"IndexedDB unavailable"};
  const name=DB_NAME+"-migration-soak-"+randomId("run");let db=null;
  try{
    for(let version=1;version<=DB_VERSION;version++){db=await openMigrationTestDb(global.indexedDB,name,version);db.close();db=null;}
    db=await openMigrationTestDb(global.indexedDB,name,DB_VERSION);const stores=Array.from(db.objectStoreNames),missing=ALL_STORES.filter(function(s){return !stores.includes(s);});db.close();db=null;
    if(missing.length)throw new MigrationError("Migration soak finished with missing stores",{missing:missing});
    return {status:"pass",message:"v1 → v"+DB_VERSION+" migration chain opened cleanly",stores:stores.length};
  }finally{if(db)db.close();try{await deleteDatabasePromise(global.indexedDB,name);}catch(_e){}}
}
async function multiTabStressTest(){
  if(typeof BroadcastChannel==="undefined")return {status:"skipped",message:"BroadcastChannel unavailable"};
  const name=CHANNEL_NAME+"-stress-"+randomId("run"),a=new CrossTabCoordinator({channelName:name,sender:"a"}),b=new CrossTabCoordinator({channelName:name,sender:"b"}),seen=[];
  try{
    a.start();b.start();b.subscribe(function(m){if(m.entityType==="diag"&&m.entityId==="shared")seen.push(m.revision);});
    for(let i=1;i<=50;i++)a.publish({entityType:"diag",entityId:"shared",revision:i,action:"put"});
    a.publish({entityType:"diag",entityId:"shared",revision:25,action:"put"});
    await new Promise(function(resolve){setTimeout(resolve,120);});
    const last=seen.length?seen[seen.length-1]:0;if(last!==50)throw new PersistenceError("CROSS_TAB_STRESS","Cross-tab revision ordering failed",{received:seen.length,last:last});
    return {status:"pass",message:"50 ordered revisions delivered; stale revision rejected",received:seen.length};
  }finally{a.stop();b.stop();}
}
async function adversarialPersistenceTest(){
  if(!global.indexedDB)return {status:"skipped",message:"IndexedDB unavailable"};
  const name=DB_NAME+"-adversarial-"+randomId("run"),testDb=new CalcDatabase({name:name,version:DB_VERSION,indexedDB:global.indexedDB});
  try{
    await testDb.open();await testDb.repository(STORES.history).put({id:"h1",expression:"1+1",result:"2",time:1,revision:1});
    const backup=await buildBackup({db:testDb,appVersion:"diagnostic"}),corrupt=jsonClone(backup);corrupt.data[STORES.history][0].result="999";
    let corruptionRejected=false;try{await validateBackup(corrupt);}catch(e){corruptionRejected=e instanceof IntegrityError||e.code==="INTEGRITY_ERROR";}if(!corruptionRejected)throw new IntegrityError("Corrupted backup was accepted");
    const plan=await planRestore(testDb,backup,{mode:"merge"});await testDb.repository(STORES.history).put({id:"h2",expression:"2+2",result:"4",time:2,revision:1});
    let staleRejected=false;try{await applyRestore(testDb,plan);}catch(e){staleRejected=e instanceof RestoreStaleError||e.code==="RESTORE_STALE_PLAN";}if(!staleRejected)throw new RestoreError("Stale restore plan was accepted");
    return {status:"pass",message:"Corruption and stale-restore fault injection were rejected"};
  }finally{await testDb.close().catch(function(){});try{await deleteDatabasePromise(global.indexedDB,name);}catch(_e){}}
}
async function updatePreflight(db){
  const integrity=await integrityReport(db),recovery=await recoveryReport(db);
  return {ok:integrity.ok&&!recovery.needsAttention,integrity:integrity,recovery:recovery,checkedAt:now()};
}
async function resilienceDiagnostics(db,options){
  options=options||{};const started=clockNow(),results=[];
  async function run(name,fn){try{const r=await fn();results.push(Object.assign({name:name,status:"pass"},r||{}));}catch(e){results.push({name:name,status:"fail",message:e.message,code:e.code||e.name||"ERROR"});}}
  await run("Migration soak",migrationSoakTest);
  await run("Corruption + restore adversarial",adversarialPersistenceTest);
  await run("Multi-tab stress",multiTabStressTest);
  await run("Quota pressure + storage performance",async function(){
    const estimate=await storageEstimate(),headroom=estimate.quota?Math.max(0,estimate.quota-estimate.usage):null,target=headroom===null?512*1024:Math.max(64*1024,Math.min(1024*1024,Math.floor(headroom*0.02)));
    if(headroom!==null&&headroom<128*1024)return {status:"skipped",message:"Insufficient safe quota headroom for a bounded write test",estimate:estimate};
    const perf=await storagePerformance(db,{totalBytes:target});return {status:"pass",message:"Bounded write/read/delete cycle completed",estimate:estimate,performance:perf};
  });
  await run("Update preflight",async function(){const p=await updatePreflight(db);if(!p.ok)throw new IntegrityError("Update preflight found unresolved persistence issues",{integrity:p.integrity.issues,recovery:p.recovery});return {status:"pass",message:"Integrity and recovery journal are clean"};});
  return {ok:results.every(function(r){return r.status!=="fail";}),results:results,durationMs:clockNow()-started};
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
  VERSION:"1.1.0-persistence-phase12",DB_NAME:DB_NAME,DB_VERSION:DB_VERSION,BACKUP_SCHEMA:BACKUP_SCHEMA,ENCRYPTED_BACKUP_SCHEMA:ENCRYPTED_BACKUP_SCHEMA,SYNC_SCHEMA:SYNC_SCHEMA,NOTEBOOK_STORAGE_SCHEMA:NOTEBOOK_STORAGE_SCHEMA,STORES:STORES,DATA_STORES:DATA_STORES,INTERNAL_STORES:INTERNAL_STORES,MAX_BACKUP_BYTES:MAX_BACKUP_BYTES,MAX_BACKUP_ITEMS:MAX_BACKUP_ITEMS,NOTEBOOK_CHUNK_BYTES:NOTEBOOK_CHUNK_BYTES,TRASH_RETENTION_MS:TRASH_RETENTION_MS,
  PersistenceError:PersistenceError,BackupError:BackupError,RestoreError:RestoreError,RestoreStaleError:RestoreStaleError,IntegrityError:IntegrityError,MigrationError:MigrationError,
  stableStringify:stableStringify,sha256Text:sha256Text,hashValue:hashValue,migrationPlan:migrationPlan,applyUpgrade:applyUpgrade,
  Repository:Repository,CalcDatabase:CalcDatabase,assertVersionedWrite:assertVersionedWrite,buildBackup:buildBackup,buildBackupBlob:buildBackupBlob,validateBackup:validateBackup,encryptBackup:encryptBackup,decryptBackup:decryptBackup,openBackup:openBackup,mergeStore:mergeStore,planRestore:planRestore,applyRestore:applyRestore,
  encodeNotebookForStorage:encodeNotebookForStorage,hydrateNotebookRecord:hydrateNotebookRecord,loadNotebook:loadNotebook,loadNotebooks:loadNotebooks,saveNotebookIncremental:saveNotebookIncremental,deleteNotebookWithTombstone:deleteNotebookWithTombstone,
  integrityReport:integrityReport,storageEstimate:storageEstimate,storagePerformance:storagePerformance,requestPersistentStorage:requestPersistentStorage,cleanupJournal:cleanupJournal,recordTombstone:recordTombstone,deleteWithTombstone:deleteWithTombstone,listTrash:listTrash,restoreTombstone:restoreTombstone,purgeTombstone:purgeTombstone,emptyTrash:emptyTrash,cleanupTrash:cleanupTrash,recoveryReport:recoveryReport,
  migrationSoakTest:migrationSoakTest,multiTabStressTest:multiTabStressTest,adversarialPersistenceTest:adversarialPersistenceTest,updatePreflight:updatePreflight,resilienceDiagnostics:resilienceDiagnostics,
  CrossTabCoordinator:CrossTabCoordinator,SyncAdapter:SyncAdapter,DisabledSyncAdapter:DisabledSyncAdapter,SyncManager:SyncManager
};
})(window);