"use strict";
global.window=global;
require("../persistence.js");

const P=global.CalcPersistence;

function assert(c,m){if(!c)throw new Error(m||"Assertion failed");}
function eq(a,b,m){if(a!==b)throw new Error((m||"Mismatch")+": expected "+b+", got "+a);}
async function throwsCode(fn,code,m){let ok=false;try{await fn();}catch(e){ok=true;if(e.code!==code)throw new Error((m||"Wrong error")+": expected "+code+", got "+e.code+" / "+e.message);}if(!ok)throw new Error((m||"Expected error")+": "+code);}

class MemoryRepo{
  constructor(db,store){this.db=db;this.store=store;}
  async all(){return Array.from(this.db.data[this.store].values()).map(x=>JSON.parse(JSON.stringify(x)));}
  async get(key){const v=this.db.data[this.store].get(key);return v===undefined?undefined:JSON.parse(JSON.stringify(v));}
  async put(value){const key=this.store===P.STORES.settings||this.store===P.STORES.meta?value.key:value.id;this.db.data[this.store].set(key,JSON.parse(JSON.stringify(value)));return key;}
  async delete(key){this.db.data[this.store].delete(key);}
  async clear(){this.db.data[this.store].clear();}
}
class MemoryDb{
  constructor(seed){
    this.data={};Object.values(P.STORES).forEach(s=>this.data[s]=new Map());
    for(const [store,items] of Object.entries(seed||{}))for(const item of items){const key=store===P.STORES.settings||store===P.STORES.meta?item.key:item.id;this.data[store].set(key,JSON.parse(JSON.stringify(item)));}
    this.failTransactions=false;
  }
  repository(store){return new MemoryRepo(this,store);}
  async allData(){const out={};for(const s of P.DATA_STORES)out[s]=await this.repository(s).all();return out;}
  async transaction(stores,mode,fn){
    const snapshot={};stores.forEach(s=>snapshot[s]=new Map(this.data[s]));
    const wrappers={};
    stores.forEach(s=>{
      wrappers[s]={
        clear:()=>({onsuccess:null,onerror:null,_op:"clear",store:s}),
        put:(value)=>({onsuccess:null,onerror:null,_op:"put",store:s,value:value})
      };
    });
    // Persistence.applyRestore expects IDB request callbacks. Simulate async requests.
    Object.values(wrappers).forEach(os=>{
      const oldClear=os.clear,oldPut=os.put;
      os.clear=function(){const req=oldClear();queueMicrotask(()=>{if(req.onsuccess)req.onsuccess({target:{result:undefined}});});this._pending=(this._pending||[]).concat([req]);return req;};
      os.put=function(value){const req=oldPut(value);queueMicrotask(()=>{if(req.onsuccess)req.onsuccess({target:{result:true}});});this._pending=(this._pending||[]).concat([req]);return req;};
    });
    if(this.failTransactions)throw Object.assign(new Error("simulated atomic failure"),{code:"SIMULATED"});
    // Run fn once to preserve orchestration, then apply from request descriptors after resolution.
    const result=await fn(wrappers,{});
    for(const s of stores){
      const ops=wrappers[s]._pending||[];
      for(const op of ops){
        if(op._op==="clear")this.data[s].clear();
        if(op._op==="put"){const key=s===P.STORES.settings||s===P.STORES.meta?op.value.key:op.value.id;this.data[s].set(key,JSON.parse(JSON.stringify(op.value)));}
      }
    }
    return result;
  }
}

// Stable hashing is key-order independent.
(async()=>{
  const h1=await P.hashValue({b:2,a:1,nested:{z:3,y:4}});
  const h2=await P.hashValue({nested:{y:4,z:3},a:1,b:2});
  eq(h1,h2,"stable hash ignores object key order");
  assert(typeof h1==="string"&&h1.length>8,"hash produced");

  assert(P.assertVersionedWrite({id:"n",revision:2},{id:"n",revision:3},2,"worksheets","n"),"matching expected revision accepted");
  await throwsCode(()=>Promise.resolve().then(()=>P.assertVersionedWrite({id:"n",revision:3},{id:"n",revision:4},2,"worksheets","n")),"REVISION_CONFLICT","stale expected revision rejected");
  await throwsCode(()=>Promise.resolve().then(()=>P.assertVersionedWrite({id:"n",revision:5},{id:"n",revision:4},null,"worksheets","n")),"REVISION_CONFLICT","newer stored revision protected");

  eq(JSON.stringify(P.migrationPlan(0,3)),JSON.stringify(["create-core-stores","create-custom-tools","create-meta-journal"]),"full migration plan");
  eq(JSON.stringify(P.migrationPlan(2,3)),JSON.stringify(["create-meta-journal"]),"v2 to v3 migration plan");
  eq(JSON.stringify(P.migrationPlan(3,3)),JSON.stringify([]),"no-op migration");

  const db=new MemoryDb({
    [P.STORES.history]:[{id:"h1",time:10,expression:"1+1",result:"2"}],
    [P.STORES.notebooks]:[{id:"n1",revision:2,title:"Notebook",updatedAt:20}],
    [P.STORES.settings]:[{key:"precision",value:12}],
    [P.STORES.customTools]:[{id:"c1",revision:1,name:"Tool",updatedAt:5}],
    [P.STORES.meta]:[{key:"schema",dbVersion:3}]
  });

  const backup=await P.buildBackup({db:db,appVersion:"test",clientSettings:{theme:"oled",angle:"RAD"}});
  eq(backup.schema,P.BACKUP_SCHEMA,"backup schema");
  eq(backup.manifest.counts[P.STORES.notebooks],1,"backup notebook count");
  assert(backup.manifest.storeHashes[P.STORES.history],"history hash present");
  assert(backup.manifest.payloadHash,"payload hash present");
  assert(backup.data[P.STORES.settings].some(x=>x.key==="theme"&&x.value==="oled"),"client setting included");

  const checked=await P.validateBackup(JSON.stringify(backup));
  eq(checked.payloadHash,backup.manifest.payloadHash,"backup verifies");
  const future=JSON.parse(JSON.stringify(backup));future.app.dbVersion=P.DB_VERSION+1;
  await throwsCode(()=>P.validateBackup(future),"BACKUP_ERROR","future database backup rejected");

  if(!global.crypto&&require("crypto").webcrypto)global.crypto=require("crypto").webcrypto;
  const encrypted=await P.encryptBackup(backup,"correct horse battery staple",{iterations:1000});
  eq(encrypted.schema,P.ENCRYPTED_BACKUP_SCHEMA,"encrypted backup schema");
  assert(encrypted.ciphertext&&encrypted.ciphertext.length>20,"encrypted ciphertext present");
  const openedEncrypted=await P.openBackup(JSON.stringify(encrypted),"correct horse battery staple");
  eq(openedEncrypted.backup.manifest.payloadHash,backup.manifest.payloadHash,"encrypted backup round trip");
  await throwsCode(()=>P.openBackup(JSON.stringify(encrypted),"wrong password"),"BACKUP_ERROR","wrong backup password rejected");

  const tampered=JSON.parse(JSON.stringify(backup));
  tampered.data[P.STORES.notebooks][0].title="Tampered";
  await throwsCode(()=>P.validateBackup(tampered),"INTEGRITY_ERROR","tamper detection");

  // Merge chooses newer revisions.
  const incoming=JSON.parse(JSON.stringify(backup));
  incoming.data[P.STORES.notebooks][0]={id:"n1",revision:3,title:"Newer",updatedAt:30};
  incoming.data[P.STORES.notebooks].push({id:"n2",revision:1,title:"Imported",updatedAt:25});
  // Rehash modified bundle.
  incoming.manifest.storeHashes={};
  for(const s of P.DATA_STORES)incoming.manifest.storeHashes[s]=await P.hashValue(incoming.data[s]);
  incoming.manifest.payloadHash=await P.hashValue({stores:incoming.data,storeHashes:incoming.manifest.storeHashes});
  const mergePlan=await P.planRestore(db,incoming,{mode:"merge",conflictPolicy:"newer"});
  eq(mergePlan.data[P.STORES.notebooks].length,2,"merge result count");
  eq(mergePlan.data[P.STORES.notebooks].find(x=>x.id==="n1").title,"Newer","newer revision wins");

  const replacePlan=await P.planRestore(db,incoming,{mode:"replace"});
  eq(replacePlan.summary.result[P.STORES.notebooks],2,"replace result count");

  const staleDb=new MemoryDb({
    [P.STORES.history]:[{id:"h",time:1}],
    [P.STORES.notebooks]:[{id:"n",revision:1,title:"Local"}],
    [P.STORES.settings]:[],
    [P.STORES.customTools]:[]
  });
  const stalePlan=await P.planRestore(staleDb,backup,{mode:"merge"});
  await staleDb.repository(P.STORES.notebooks).put({id:"n",revision:2,title:"Changed after preview"});
  await throwsCode(()=>P.applyRestore(staleDb,stalePlan),"RESTORE_STALE_PLAN","stale restore plan rejected");

  // Equal revisions with different content can be conflict-copied.
  const conflictIncoming=JSON.parse(JSON.stringify(backup));
  conflictIncoming.data[P.STORES.notebooks][0]={id:"n1",revision:2,title:"Different",updatedAt:20};
  conflictIncoming.manifest.storeHashes={};
  for(const s of P.DATA_STORES)conflictIncoming.manifest.storeHashes[s]=await P.hashValue(conflictIncoming.data[s]);
  conflictIncoming.manifest.payloadHash=await P.hashValue({stores:conflictIncoming.data,storeHashes:conflictIncoming.manifest.storeHashes});
  const conflictPlan=await P.planRestore(db,conflictIncoming,{mode:"merge",conflictPolicy:"conflict-copy"});
  assert(conflictPlan.data[P.STORES.notebooks].length===2,"conflict copy retained");
  assert(conflictPlan.conflicts.length===1,"conflict recorded");
  assert(conflictPlan.data[P.STORES.notebooks].some(x=>x.title&&x.title.includes("conflict copy")),"conflict title marked");

  // Atomic restore applies all stores and writes committed journal.
  const restoreDb=new MemoryDb({
    [P.STORES.history]:[{id:"old",time:1}],
    [P.STORES.notebooks]:[{id:"oldn",revision:1}],
    [P.STORES.settings]:[],
    [P.STORES.customTools]:[]
  });
  const applied=await P.applyRestore(restoreDb,replacePlan);
  eq(applied.status,"committed","restore journal committed");
  const restoredData=await restoreDb.allData();
  assert(restoredData[P.STORES.notebooks].some(x=>x.id==="n2"),"restore imported notebook");
  const recoveryClean=await P.recoveryReport(restoreDb);
  eq(recoveryClean.needsAttention,false,"committed restore not recovery issue");

  // Failure leaves data unchanged and records failed journal.
  const failingDb=new MemoryDb({
    [P.STORES.history]:[{id:"keep",time:1}],
    [P.STORES.notebooks]:[{id:"keepn",revision:1}],
    [P.STORES.settings]:[],
    [P.STORES.customTools]:[]
  });
  failingDb.failTransactions=true;
  await throwsCode(()=>P.applyRestore(failingDb,replacePlan),"RESTORE_ERROR","restore failure surfaced");
  const afterFail=await failingDb.allData();
  eq(afterFail[P.STORES.history][0].id,"keep","failed atomic restore preserves original history");
  const recoveryBad=await P.recoveryReport(failingDb);
  assert(recoveryBad.needsAttention&&recoveryBad.failed.length===1,"failed restore journal reported");

  const integrity=await P.integrityReport(db);
  assert(integrity.ok,"integrity report clean");
  eq(integrity.counts[P.STORES.history],1,"integrity count");

  // Settings merge uses stable key identity.
  const sm=P.mergeStore([{key:"theme",value:"light"}],[{key:"theme",value:"oled"}],P.STORES.settings,"incoming");
  eq(sm.items.length,1,"settings merged by key");
  eq(sm.items[0].value,"oled","incoming settings selected");

  // Sync remains disabled unless explicitly enabled.
  const sync=new P.SyncManager();
  eq(sync.status().enabled,false,"sync disabled by default");
  eq((await sync.push(backup)).status,"disabled","disabled sync push");
  eq((await sync.pull()).status,"disabled","disabled sync pull");

  class TestAdapter extends P.SyncAdapter{
    constructor(){super("test");this.pushed=null;}
    async push(bundle){this.pushed=bundle;return {status:"ok"};}
    async pull(){return {status:"ok",bundle:{hello:"world"}};}
  }
  const adapter=new TestAdapter(),sync2=new P.SyncManager({adapter:adapter,enabled:true,deviceId:"dev1"});
  eq((await sync2.push(backup)).status,"ok","enabled sync delegates");
  eq(adapter.pushed.schema,P.SYNC_SCHEMA,"sync envelope schema");
  eq((await sync2.pull()).bundle.hello,"world","sync pull delegates");

  // Cross-tab coordinator can be used without BroadcastChannel support.
  const coord=new P.CrossTabCoordinator({sender:"tab1"});
  const message=coord.publish({entityType:"notebook",entityId:"n1",revision:3,action:"updated"});
  eq(message.sender,"tab1","broadcast sender");
  eq(message.entityId,"n1","broadcast entity");

  console.log("Persistence Backup PWA architecture certification tests passed");
})().catch(e=>{console.error(e);process.exit(1);});
