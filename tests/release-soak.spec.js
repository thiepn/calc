"use strict";
const {test,expect}=require("@playwright/test");

async function openApp(page){
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/index.html",{waitUntil:"domcontentloaded"});
  await expect(page.locator("#app")).toBeVisible();
  await expect(page.locator("#exactResult")).not.toHaveText("Calc could not initialize");
  return errors;
}
async function deleteDb(page,name){
  await page.evaluate(async dbName=>{
    await new Promise((resolve,reject)=>{
      const req=indexedDB.deleteDatabase(dbName);
      req.onsuccess=()=>resolve();req.onerror=()=>reject(req.error);req.onblocked=()=>reject(new Error("delete blocked: "+dbName));
    });
  },name);
}

test("baseline shell and calculation remain stable",async({page},testInfo)=>{
  const errors=await openApp(page);
  await page.locator("#expressionInput").fill("2+2");
  await page.locator("#expressionInput").press("Enter");
  await expect(page.locator("#exactResult")).toHaveText("4");
  await expect(page.locator('[data-view="settings"]').first()).toBeVisible();
  const state=await page.evaluate(()=>({
    dbVersion:window.CalcPersistence.DB_VERSION,
    widthOk:document.documentElement.scrollWidth<=window.innerWidth+3
  }));
  expect(state.dbVersion).toBe(5);
  if(testInfo.project.name==="mobile-chromium")expect(state.widthOk).toBeTruthy();
  expect(errors).toEqual([]);
});

test("v4 → v5 migration preserves realistic existing data",async({page})=>{
  const errors=await openApp(page);
  const seeded=await page.evaluate(async()=>{
    const P=window.CalcPersistence,name=P.DB_NAME;
    await new Promise((resolve,reject)=>{
      const req=indexedDB.deleteDatabase(name);req.onsuccess=()=>resolve();req.onerror=()=>reject(req.error);req.onblocked=()=>reject(new Error("v4 seed delete blocked"));
    });
    const db=await new Promise((resolve,reject)=>{
      const req=indexedDB.open(name,4);
      req.onupgradeneeded=()=>{
        const d=req.result;
        const ensure=(n,k)=>{if(!d.objectStoreNames.contains(n))d.createObjectStore(n,{keyPath:k});};
        ensure("history","id");ensure("worksheets","id");ensure("settings","key");ensure("customTools","id");ensure("meta","key");ensure("journal","id");ensure("tombstones","id");
      };
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    const tx=db.transaction(["history","worksheets","settings","customTools","meta","tombstones"],"readwrite");
    const history=tx.objectStore("history"),worksheets=tx.objectStore("worksheets"),settings=tx.objectStore("settings"),tools=tx.objectStore("customTools"),meta=tx.objectStore("meta"),tombs=tx.objectStore("tombstones");
    for(let i=0;i<1200;i++)history.put({id:"h"+i,time:1700000000000+i,expression:i+"+1",result:String(i+1),revision:i+1});
    const source=("x = 123456789\n").repeat(5000);
    for(let n=0;n<3;n++)worksheets.put({schema:"calc.notebook/v2",id:"legacy-n"+n,title:"Legacy "+n,createdAt:1,updatedAt:10+n,revision:2,blocks:[{id:"b"+n,type:"text",title:"",source:source,config:{},collapsed:false,status:"clean",dependencies:[],producedSymbols:[],result:{status:"clean",kind:"text",display:"",approx:"",error:null,value:null,serialized:null,metadata:{}},updatedAt:10+n}],versions:[],settings:{autoRun:false},recovery:null});
    settings.put({key:"theme",value:"graphite",updatedAt:1});settings.put({key:"precision",value:14,updatedAt:1});
    tools.put({id:"custom.legacy",revision:1,name:"Legacy tool",status:"archived",updatedAt:1});
    meta.put({key:"schema",dbVersion:4,migratedFrom:3,steps:["create-tombstones"],updatedAt:1});
    tombs.put({id:"worksheets:gone",entityType:"worksheets",entityId:"gone",revision:2,deletedAt:1,deviceId:"old",recoverable:false,payload:null});
    await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
    db.close();return {history:1200,notebooks:3};
  });
  expect(seeded.history).toBe(1200);
  await page.reload({waitUntil:"domcontentloaded"});
  await expect(page.locator("#app")).toBeVisible();
  const migrated=await page.evaluate(async()=>{
    const P=window.CalcPersistence,db=new P.CalcDatabase();const native=await db.open(),stores=Array.from(native.objectStoreNames);
    const history=await db.repository(P.STORES.history).count(),notebooks=await P.loadNotebooks(db),settings=await db.repository(P.STORES.settings).all(),tools=await db.repository(P.STORES.customTools).all(),tombs=await db.repository(P.STORES.tombstones).all();
    return {version:native.version,stores,history,notebooks:notebooks.length,sourceLength:notebooks[0].blocks[0].source.length,theme:settings.find(x=>x.key==="theme")?.value,tools:tools.length,tombs:tombs.length};
  });
  expect(migrated.version).toBe(5);
  expect(migrated.stores).toContain("chunks");
  expect(migrated.history).toBe(1200);
  expect(migrated.notebooks).toBe(3);
  expect(migrated.sourceLength).toBeGreaterThan(50000);
  expect(migrated.theme).toBe("graphite");
  expect(migrated.tools).toBe(1);
  expect(migrated.tombs).toBe(1);
  expect(errors).toEqual([]);
});

test("large notebook persistence, streamed backup, restore matrix, and Trash survives notebook-only restore",async({page})=>{
  await openApp(page);
  const result=await page.evaluate(async()=>{
    const P=window.CalcPersistence,name="calc-rc-large-"+Date.now(),db=new P.CalcDatabase({name,version:P.DB_VERSION});
    try{
      await db.open();
      const sourceBase=("0123456789abcdef\n").repeat(5600);
      const blocks=Array.from({length:48},(_,i)=>({id:"b"+i,type:"text",title:"Block "+i,source:sourceBase+i,config:{},status:"clean",dependencies:[],producedSymbols:[],result:{status:"clean",kind:"text",display:"",approx:"",error:null,value:null,serialized:i===0?{blob:"r".repeat(280000)}:null,metadata:{}},updatedAt:1}));
      const notebook={schema:"calc.notebook/v2",id:"large",title:"Large fixture",createdAt:1,updatedAt:2,revision:1,blocks,versions:[{reason:"fixture",snapshot:{revision:1,title:"Large fixture",updatedAt:1,blocks:[{...blocks[0],source:"v".repeat(180000)}],settings:{autoRun:false}}}],settings:{autoRun:false},recovery:null};
      const t0=performance.now(),first=await P.saveNotebookIncremental(db,notebook,null,{externalizeBytes:4096,chunkBytes:32768}),saveMs=performance.now()-t0;
      const hydrated=await P.loadNotebook(db,"large");
      const second=await P.saveNotebookIncremental(db,hydrated,1,{externalizeBytes:4096,chunkBytes:32768});
      const backupArtifact=await P.buildBackupBlobFromDb({db,appVersion:"rc-soak"}),backupText=await backupArtifact.blob.text(),checked=await P.openBackup(backupText);
      await P.deleteNotebookWithTombstone(db,"large",{revision:2,deviceId:"rc"});
      const trashBefore=await P.listTrash(db),plan=await P.planRestore(db,checked.backup,{mode:"replace",stores:[P.STORES.notebooks]});
      await P.applyRestore(db,plan);
      const restored=await P.loadNotebook(db,"large"),trashAfter=await P.listTrash(db);
      const recoveredTrash=await P.restoreTombstone(db,trashAfter[0].id),all=await P.loadNotebooks(db),integrity=await P.integrityReport(db);
      return {chunkRecords:first.chunkRecords,chunkWrites2:second.chunkWrites,saveMs,backupBytes:backupArtifact.blob.size,sourceLength:restored.blocks[0].source.length,trashBefore:trashBefore.length,trashAfter:trashAfter.length,recoveredKey:recoveredTrash.key,notebooks:all.length,integrityOk:integrity.ok,orphans:integrity.chunkStats.orphaned};
    }finally{await db.close().catch(()=>{});await new Promise(resolve=>{const r=indexedDB.deleteDatabase(name);r.onsuccess=r.onerror=r.onblocked=()=>resolve();});}
  });
  expect(result.chunkRecords).toBeGreaterThan(100);
  expect(result.chunkWrites2).toBe(0);
  expect(result.backupBytes).toBeGreaterThan(3*1024*1024);
  expect(result.sourceLength).toBeGreaterThan(50000);
  expect(result.trashBefore).toBe(1);
  expect(result.trashAfter).toBe(1);
  expect(result.recoveredKey).not.toBe("large");
  expect(result.notebooks).toBe(2);
  expect(result.integrityOk).toBeTruthy();
  expect(result.orphans).toBe(0);
  expect(result.saveMs).toBeLessThan(20000);
});

test("interrupted transaction and corrupt chunk are detected without silent overwrite",async({page})=>{
  await openApp(page);
  const result=await page.evaluate(async()=>{
    const P=window.CalcPersistence,name="calc-rc-fault-"+Date.now(),db=new P.CalcDatabase({name,version:P.DB_VERSION});
    try{
      const native=await db.open(),source="z".repeat(180000),notebook={id:"fault",title:"Fault fixture",revision:1,updatedAt:1,blocks:[{id:"b",source,result:{serialized:null}}],versions:[]};
      await P.saveNotebookIncremental(db,notebook,null,{externalizeBytes:4096,chunkBytes:32768});
      const tx=native.transaction(P.STORES.chunks,"readwrite");tx.objectStore(P.STORES.chunks).put({id:"partial",data:"partial"});tx.abort();
      await new Promise(resolve=>{tx.onabort=tx.onerror=tx.oncomplete=()=>resolve();});
      const partial=await db.repository(P.STORES.chunks).get("partial"),raw=await db.repository(P.STORES.notebooks).get("fault"),chunkId=raw.persistence.externalized[0].chunks[0].id;
      await db.repository(P.STORES.chunks).delete(chunkId);
      let rejected=false;try{await P.loadNotebook(db,"fault");}catch(e){rejected=e.code==="INTEGRITY_ERROR";}
      const tolerant=await P.loadNotebooks(db,{tolerant:true}),integrity=await P.integrityReport(db);
      return {partial:!!partial,rejected,recovery:!!(tolerant[0].recovery&&tolerant[0].recovery.persistenceCorruption),integrityOk:integrity.ok,issues:integrity.issues.length};
    }finally{await db.close().catch(()=>{});await new Promise(resolve=>{const r=indexedDB.deleteDatabase(name);r.onsuccess=r.onerror=r.onblocked=()=>resolve();});}
  });
  expect(result.partial).toBeFalsy();
  expect(result.rejected).toBeTruthy();
  expect(result.recovery).toBeTruthy();
  expect(result.integrityOk).toBeFalsy();
  expect(result.issues).toBeGreaterThan(0);
});

test("offline PWA reload remains functional",async({page,context},testInfo)=>{
  test.skip(!["chromium","mobile-chromium"].includes(testInfo.project.name),"PWA offline certification is gated on Chromium install semantics");
  await openApp(page);
  const sw=await page.evaluate(async()=>{
    await navigator.serviceWorker.ready;
    if(!navigator.serviceWorker.controller){location.reload();return {reload:true};}
    return {reload:false};
  });
  if(sw.reload){await page.waitForLoadState("domcontentloaded");await page.evaluate(()=>navigator.serviceWorker.ready);}
  const version=await page.evaluate(async()=>{
    const controller=navigator.serviceWorker.controller;if(!controller)throw new Error("No controlling service worker");
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error("SW version timeout")),5000);
      navigator.serviceWorker.addEventListener("message",function handler(e){if(e.data&&e.data.type==="SW_VERSION"){clearTimeout(timer);navigator.serviceWorker.removeEventListener("message",handler);resolve(e.data.version);}});
      controller.postMessage({type:"GET_VERSION"});
    });
  });
  expect(version).toBe("calc-shell-v22-rc1");
  await context.setOffline(true);
  try{
    await page.reload({waitUntil:"domcontentloaded"});
    await expect(page.locator("#app")).toBeVisible();
    await page.locator("#expressionInput").fill("6*7");await page.locator("#expressionInput").press("Enter");
    await expect(page.locator("#exactResult")).toHaveText("42");
  }finally{await context.setOffline(false);}
});

test("performance envelope remains bounded for repeated large persistence",async({page})=>{
  await openApp(page);
  const result=await page.evaluate(async()=>{
    const P=window.CalcPersistence,name="calc-rc-perf-"+Date.now(),db=new P.CalcDatabase({name,version:P.DB_VERSION});
    try{
      await db.open();const source="p".repeat(85000),blocks=Array.from({length:24},(_,i)=>({id:"p"+i,source:source+i,result:{serialized:null}})),doc={id:"perf",title:"Perf",revision:1,updatedAt:1,blocks,versions:[]};
      const heapBefore=performance.memory&&performance.memory.usedJSHeapSize||null,t0=performance.now();const first=await P.saveNotebookIncremental(db,doc,null,{externalizeBytes:4096,chunkBytes:32768}),saveMs=performance.now()-t0;
      const t1=performance.now();for(let i=0;i<5;i++)await P.loadNotebook(db,"perf");const loadMs=performance.now()-t1;
      const t2=performance.now();const artifact=await P.buildBackupBlobFromDb({db,appVersion:"rc-perf"});const backupMs=performance.now()-t2;
      const heapAfter=performance.memory&&performance.memory.usedJSHeapSize||null;
      return {saveMs,loadMs,backupMs,bytes:artifact.blob.size,chunks:first.chunkRecords,heapGrowth:heapBefore!==null&&heapAfter!==null?heapAfter-heapBefore:null};
    }finally{await db.close().catch(()=>{});await new Promise(resolve=>{const r=indexedDB.deleteDatabase(name);r.onsuccess=r.onerror=r.onblocked=()=>resolve();});}
  });
  expect(result.bytes).toBeGreaterThan(1024*1024);
  expect(result.chunks).toBeGreaterThan(24);
  expect(result.saveMs).toBeLessThan(15000);
  expect(result.loadMs).toBeLessThan(12000);
  expect(result.backupMs).toBeLessThan(15000);
  if(result.heapGrowth!==null)expect(result.heapGrowth).toBeLessThan(160*1024*1024);
});
