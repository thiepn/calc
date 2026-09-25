"use strict";
const {test,expect}=require("@playwright/test");

async function openApp(page,path="/index.html"){
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto(path,{waitUntil:"domcontentloaded"});
  await expect(page.locator("#app")).toBeVisible();
  await expect(page.locator("#exactResult")).not.toHaveText("Calc could not initialize");
  await expect.poll(()=>page.evaluate(()=>typeof document.querySelector("#angleBtn")?.onclick==="function"),{timeout:12000}).toBe(true);
  return errors;
}

async function goView(page,view){
  await page.evaluate(v=>{location.hash="#"+v;},view);
  await expect(page.locator('[data-view-panel="'+view+'"]')).toHaveClass(/active/);
}

test("mobile worksheet keeps notebook management controls accessible",async({page},testInfo)=>{
  test.skip(testInfo.project.name!=="mobile-chromium","mobile layout regression");
  const errors=await openApp(page);
  await goView(page,"worksheet");
  await expect(page.locator(".worksheet-side")).toBeVisible();
  await expect(page.locator("#worksheetList")).toBeVisible();
  await expect(page.locator("#worksheetImportBtn")).toBeVisible();
  await expect(page.locator("#worksheetExportBtn")).toBeVisible();
  await expect(page.locator("#deleteWorksheetBtn")).toBeVisible();
  expect(errors).toEqual([]);
});

test("all primary workspaces navigate without runtime errors",async({page})=>{
  const errors=await openApp(page);
  for(const view of ["calculate","graph","matrix","data","tools","worksheet","history","settings"]){
    await goView(page,view);
  }
  expect(errors).toEqual([]);
});

test("U1 advanced CAS executes through the Calculate UI",async({page})=>{
  const errors=await openApp(page);
  expect(await page.evaluate(()=>window.CalcCAS&&window.CalcCAS.VERSION)).toBe("2.0.0-u1");
  const input=page.locator("#expressionInput");

  await input.fill("assume(x>0; simplify(sqrt(x^2)))");
  await input.press("Enter");
  await expect(page.locator("#exactResult")).toHaveText("x");
  await expect(page.locator("#calcStatus")).toHaveText("Symbolic");

  await input.fill("solve(a*x+b=0, x)");
  await input.press("Enter");
  await expect(page.locator("#exactResult")).toContainText("a ≠ 0");
  await expect(page.locator("#exactResult")).toContainText("a = 0 and b = 0");

  await input.fill("inequality((x-1)/(x-1)>0, x)");
  await input.press("Enter");
  await expect(page.locator("#exactResult")).toHaveText("x ∈ (−∞, 1) ∪ (1, ∞)");

  expect(errors).toEqual([]);
});

test("U2 multivariable and vector calculus executes through the Calculate UI",async({page})=>{
  const errors=await openApp(page);
  expect(await page.evaluate(()=>window.CalcMultivariable&&window.CalcMultivariable.VERSION)).toBe("2.1.0-u2");
  const input=page.locator("#expressionInput");

  await input.fill("gradat(x^2+y^2; x,y; 1,2)");
  await input.press("Enter");
  await expect(page.locator("#exactResult")).toHaveText("[2, 4]");

  await input.fill("lineint(-y,x; x,y; cos(t),sin(t); t; 0,2*pi)");
  await input.press("Enter");
  await expect(page.locator("#exactResult")).toContainText("6.283");

  await input.fill("green(-y,x; x,y; 0,1; 0,1)");
  await input.press("Enter");
  await expect(page.locator("#exactResult")).toContainText("residual 0");

  expect(errors).toEqual([]);
});

test("U3 differential equations and dynamical systems execute through the Calculate UI",async({page})=>{
  const errors=await openApp(page);
  expect(await page.evaluate(()=>window.CalcODE&&window.CalcODE.VERSION)).toBe("2.2.0-u3");
  const input=page.locator("#expressionInput");

  await input.fill("linearode(1; 1; x; y)");
  await input.press("Enter");
  await expect(page.locator("#exactResult")).toContainText("y =");

  await input.fill("ivp(y; x; y; 0,1; 1)");
  await input.press("Enter");
  await expect(page.locator("#exactResult")).toContainText("2.718");

  await input.fill("stability(y,-x; x,y; 0,0)");
  await input.press("Enter");
  await expect(page.locator("#exactResult")).toContainText("center (linearized)");

  await input.fill("laplace(t^2; t; s)");
  await input.press("Enter");
  await expect(page.locator("#exactResult")).toContainText("2 / s ^ 3");

  expect(errors).toEqual([]);
});

test("U4 optimization and mathematical programming execute through the Calculate UI",async({page})=>{
  const errors=await openApp(page);
  expect(await page.evaluate(()=>window.CalcOptimization&&window.CalcOptimization.VERSION)).toBe("2.3.0-u4");
  const input=page.locator("#expressionInput");

  await input.fill("convexity(x^2+2*y^2; x,y)");
  await input.press("Enter");
  await expect(page.locator("#exactResult")).toContainText("strictly convex");

  await input.fill("optmin((x-1)^2+(y+2)^2; x,y; 3,3; bfgs)");
  await input.press("Enter");
  await expect(page.locator("#exactResult")).toContainText("global strict optimum");

  await input.fill("lpmax(3,2; 1,1|1,0|0,1; 4,2,3)");
  await input.press("Enter");
  await expect(page.locator("#exactResult")).toContainText("objective = 10");

  await input.fill("quadprog(x^2+y^2; x,y; x+y-1; -x,-y)");
  await input.press("Enter");
  await expect(page.locator("#exactResult")).toContainText("f = 0.5");

  expect(errors).toEqual([]);
});

test("U5 advanced linear algebra executes through Calculate and Matrix workspace",async({page})=>{
  const errors=await openApp(page);
  expect(await page.evaluate(()=>window.CalcAdvancedLinearAlgebra&&window.CalcAdvancedLinearAlgebra.VERSION)).toBe("2.4.0-u5");
  const input=page.locator("#expressionInput");

  await input.fill("jordanv2(2,1,0|0,2,1|0,0,2)");
  await input.press("Enter");
  await expect(page.locator("#exactResult")).toContainText("block sizes = [3]");

  await input.fill("matrixfunc(4,0|0,9; sqrt)");
  await input.press("Enter");
  await expect(page.locator("#exactResult")).toHaveText("[[2, 0], [0, 3]]");

  await input.fill("inertia(2,0|0,-3)");
  await input.press("Enter");
  await expect(page.locator("#exactResult")).toContainText("inertia = (1, 1, 0)");

  await input.fill("condreport(1,0|0,0.001)");
  await input.press("Enter");
  await expect(page.locator("#exactResult")).toContainText("cond2 = 1000");

  await goView(page,"matrix");
  await expect(page.locator('[data-matrix-op="spectral"]')).toBeVisible();
  await page.locator('[data-matrix-op="spectral"]').click();
  await expect(page.locator("#matrixResult")).toContainText("Q");
  await expect(page.locator("#matrixResult")).toContainText("D");

  expect(errors).toEqual([]);
});

test("U6 numerical mathematics executes through the Calculate UI",async({page})=>{
  const errors=await openApp(page);
  expect(await page.evaluate(()=>window.CalcNumerical&&window.CalcNumerical.VERSION)).toBe("2.5.0-u6");
  const input=page.locator("#expressionInput");

  await input.fill("floatinfo(1)");
  await input.press("Enter");
  await expect(page.locator("#exactResult")).toContainText("2.22044604925031308e-16");

  await input.fill("interp(0,1,2; 0,1,4; 1.5)");
  await input.press("Enter");
  await expect(page.locator("#exactResult")).toContainText("2.25");

  await input.fill("quad(x^4; x; 0; 1; 10; simpson)");
  await input.press("Enter");
  await expect(page.locator("#exactResult")).toContainText("I ≈ 0.2");

  await input.fill("cg(4,1|1,3; 1,2; 0,0; 20)");
  await input.press("Enter");
  await expect(page.locator("#exactResult")).toContainText("iterations = 2");

  await input.fill("rayleighiter(2,1|1,2; 1,0.2; 50)");
  await input.press("Enter");
  await expect(page.locator("#exactResult")).toContainText("λ ≈ 3");

  await input.fill("odeorder(y; x; y; 0; 1; 1; 10; rk4)");
  await input.press("Enter");
  await expect(page.locator("#exactResult")).toContainText("observed p");

  await input.fill("absstability(rk4; -2; 0)");
  await input.press("Enter");
  await expect(page.locator("#exactResult")).toContainText("stable");

  // U3 command ownership remains intact after U6 adds absolute-stability tools.
  await input.fill("stability(y,-x; x,y; 0,0)");
  await input.press("Enter");
  await expect(page.locator("#exactResult")).toContainText("center (linearized)");

  expect(errors).toEqual([]);
});

test("notebook read failure does not create replacement or recovery duplicates",async({page})=>{
  const errors=await openApp(page);
  const seeded=await page.evaluate(async()=>{
    const P=window.CalcPersistence,NB=window.CalcNotebook,db=new P.CalcDatabase();await db.open();
    const doc=NB.normalizeNotebook({schema:NB.SCHEMA,id:"read-failure-seed",title:"Keep me",revision:7,updatedAt:Date.now(),blocks:[NB.newBlock("text",{source:"persisted"})],versions:[],settings:{autoRun:false}});
    await P.saveNotebookIncremental(db,doc,null);
    return {id:doc.id,count:await db.repository(P.STORES.notebooks).count()};
  });
  await page.addInitScript(()=>{
    const original=IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.getAll=function(...args){if(this.name==="worksheets")throw new Error("forced notebook read failure");return original.apply(this,args);};
  });
  await page.reload({waitUntil:"domcontentloaded"});
  await expect(page.locator("#app")).toBeVisible();
  await page.waitForTimeout(700);
  const raw=await page.evaluate(async id=>{
    const P=window.CalcPersistence,db=await new Promise((resolve,reject)=>{const r=indexedDB.open(P.DB_NAME,P.DB_VERSION);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    const tx=db.transaction(P.STORES.notebooks,"readonly"),store=tx.objectStore(P.STORES.notebooks);
    const count=await new Promise((resolve,reject)=>{const r=store.count();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    const item=await new Promise((resolve,reject)=>{const r=store.get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});db.close();
    return {count,exists:!!item};
  },seeded.id);
  expect(raw).toEqual({count:seeded.count,exists:true});
  await expect(page.locator("#exactResult")).not.toHaveText("Calc could not initialize");
  expect(errors).toEqual([]);
});

test("settings read failure is non-destructive and blocks unsafe backup",async({page})=>{
  const errors=await openApp(page);
  await page.evaluate(async()=>{
    const P=window.CalcPersistence,db=new P.CalcDatabase();await db.open(),repo=db.repository(P.STORES.settings);
    await repo.put({key:"theme",value:"oled",updatedAt:1});
    await repo.put({key:"precision",value:17,updatedAt:1});
    await repo.put({key:"angle",value:"GRAD",updatedAt:1});
    await repo.put({key:"deviceId",value:"stable-device",updatedAt:1});
  });
  await page.addInitScript(()=>{
    const original=IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.getAll=function(...args){if(this.name==="settings")throw new Error("forced settings read failure");return original.apply(this,args);};
  });
  await page.reload({waitUntil:"domcontentloaded"});
  await expect(page.locator("#app")).toBeVisible();
  const stored=await page.evaluate(async()=>{
    const P=window.CalcPersistence,db=await new Promise((resolve,reject)=>{const r=indexedDB.open(P.DB_NAME,P.DB_VERSION);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    const tx=db.transaction(P.STORES.settings,"readonly"),store=tx.objectStore(P.STORES.settings);
    const get=key=>new Promise((resolve,reject)=>{const r=store.get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    const values=await Promise.all(["theme","precision","deviceId"].map(get));db.close();return Object.fromEntries(values.map(x=>[x.key,x.value]));
  });
  expect(stored).toEqual({theme:"oled",precision:17,deviceId:"stable-device"});
  let downloads=0;page.on("download",()=>downloads++);
  await goView(page,"settings");
  await page.locator("#fullBackupBtn").click();
  await expect(page.locator("#toast")).toContainText("settings could not be loaded safely");
  expect(downloads).toBe(0);
  expect(errors).toEqual([]);
});

test("blocked localStorage does not prevent startup",async({page})=>{
  await page.addInitScript(()=>{
    Object.defineProperty(window,"localStorage",{configurable:true,get(){throw new DOMException("Blocked","SecurityError");}});
  });
  const errors=await openApp(page);
  await page.locator("#expressionInput").fill("21*2");
  await page.locator("#expressionInput").press("Enter");
  await expect(page.locator("#exactResult")).toHaveText("42");
  expect(errors).toEqual([]);
});

test("malformed tool hash cannot crash startup or hash navigation",async({page})=>{
  const errors=await openApp(page,"/index.html#tools/%E0%A4%A");
  await expect(page.locator('[data-view-panel="tools"]')).toHaveClass(/active/);
  await expect(page.locator("#toolRunner")).toBeVisible();
  await page.evaluate(()=>{location.hash="#tools/%ZZ";});
  await expect(page.locator("#toolRunner")).toBeVisible();
  await expect(page.locator("#exactResult")).not.toHaveText("Calc could not initialize");
  expect(errors).toEqual([]);
});

test("tool search keeps focus and accepts continuous typing",async({page})=>{
  await openApp(page);
  await goView(page,"tools");
  const search=page.locator("#toolList .tool-search");
  await search.click();
  await page.keyboard.type("loan");
  await expect(page.locator("#toolList .tool-search")).toHaveValue("loan");
  await expect(page.locator("#toolList .tool-search")).toBeFocused();
  await expect(page.locator("#toolList button",{hasText:"Loan & amortization"})).toBeVisible();
});

test("active custom-tool metadata is rendered as text, never executable markup",async({page})=>{
  await openApp(page);
  const malicious='<svg data-xss-probe onload="window.__calcXss=(window.__calcXss||0)+1"></svg>Injected';
  await page.evaluate(async malicious=>{
    const CT=window.CalcCustomTools,P=window.CalcPersistence;
    let draft=CT.newFormulaDraft();
    draft.name=malicious;draft.description=malicious;draft.variables[0].label=malicious;
    const active=CT.activate(draft).manifest,db=new P.CalcDatabase();await db.open();
    await db.repository(P.STORES.customTools).put(active);await db.close();
  },malicious);
  await page.reload({waitUntil:"domcontentloaded"});
  await goView(page,"tools");
  const customButton=page.locator("#toolList button").filter({hasText:"Injected"}).first();
  await expect(customButton).toBeVisible();
  await customButton.click();
  await expect(page.locator("#toolRunner .tool-title")).toContainText("<svg");
  await expect(page.locator("#toolRunner svg")).toHaveCount(0);
  expect(await page.evaluate(()=>window.__calcXss||0)).toBe(0);
  await page.locator("#toolRun").click();
  await expect(page.locator("#toolResult strong")).toContainText("<svg");
  await expect(page.locator("#toolResult svg")).toHaveCount(0);
  expect(await page.evaluate(()=>window.__calcXss||0)).toBe(0);
});

test("dataset column names cannot inject markup through histogram rendering",async({page})=>{
  await openApp(page);
  await goView(page,"data");
  const header='<svg data-data-xss onload="window.__dataXss=(window.__dataXss||0)+1"></svg>';
  await page.locator("#dataInput").fill(header+",y\n1,2\n2,4\n3,6");
  await page.locator("#analyzeDataBtn").click();
  await expect(page.locator("#dataSummary")).toContainText("3 rows");
  await page.locator("#histogramBtn").click();
  await expect(page.locator("#dataAnalysisResult")).toContainText("<svg");
  await expect(page.locator("#dataAnalysisResult svg")).toHaveCount(0);
  expect(await page.evaluate(()=>window.__dataXss||0)).toBe(0);
});

test("failed history write is reported without breaking calculation",async({page})=>{
  const errors=await openApp(page);
  await page.evaluate(()=>{
    const P=window.CalcPersistence,original=P.Repository.prototype.put;
    P.Repository.prototype.put=function(value){if(this.store===P.STORES.history)return Promise.reject(new Error("forced history write failure"));return original.call(this,value);};
  });
  await page.locator("#expressionInput").fill("3+4");
  await page.locator("#expressionInput").press("Enter");
  await expect(page.locator("#exactResult")).toHaveText("7");
  await expect(page.locator("#toast")).toContainText("history could not be saved");
  expect(errors).toEqual([]);
});

test("failed Clear History keeps visible and persisted history intact",async({page})=>{
  const errors=await openApp(page);
  await page.locator("#expressionInput").fill("8+9");
  await page.locator("#expressionInput").press("Enter");
  await goView(page,"history");
  await expect(page.locator("#historyList")).toContainText("8+9");
  await page.evaluate(()=>{
    const P=window.CalcPersistence,original=P.Repository.prototype.clear;
    P.Repository.prototype.clear=function(){if(this.store===P.STORES.history)return Promise.reject(new Error("forced history clear failure"));return original.call(this);};
  });
  page.once("dialog",dialog=>dialog.accept());
  await page.locator("#clearHistoryBtn").click();
  await expect(page.locator("#toast")).toContainText("Could not clear history");
  await expect(page.locator("#historyList")).toContainText("8+9");
  const count=await page.evaluate(async()=>{const P=window.CalcPersistence,db=new P.CalcDatabase();await db.open();return db.repository(P.STORES.history).count();});
  expect(count).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("notebook Ref copy does not throw when clipboard APIs are unavailable",async({page})=>{
  await page.addInitScript(()=>{
    Object.defineProperty(navigator,"clipboard",{configurable:true,value:undefined});
    Document.prototype.execCommand=undefined;
  });
  const errors=await openApp(page);
  await goView(page,"worksheet");
  await page.locator('[data-ws-action="ref"]').first().click();
  await expect(page.locator("#toast")).toContainText("Copy unavailable");
  expect(errors).toEqual([]);
});

test("notebook delete flushes current unsaved edits into Trash",async({page})=>{
  const errors=await openApp(page);
  await goView(page,"worksheet");
  const title=page.locator("#worksheetTitle");
  await title.fill("Delete Flush Probe");
  page.once("dialog",dialog=>dialog.accept());
  await page.locator("#deleteWorksheetBtn").click();
  await expect(page.locator("#toast")).toContainText("Notebook deleted");
  const trashTitle=await page.evaluate(async()=>{
    const P=window.CalcPersistence,db=new P.CalcDatabase();await db.open();
    const items=await P.listTrash(db),item=items.find(x=>x.entityType===P.STORES.notebooks);
    return item&&item.payload&&item.payload.title;
  });
  expect(trashTitle).toBe("Delete Flush Probe");
  expect(errors).toEqual([]);
});

test("notebook delete aborts when current edits cannot be flushed",async({page})=>{
  const errors=await openApp(page);
  await goView(page,"worksheet");
  const title=page.locator("#worksheetTitle");await title.fill("Do Not Delete");
  const before=await page.locator("#worksheetList button").count();
  await page.evaluate(()=>{window.CalcPersistence.saveNotebookIncremental=async()=>{throw new Error("forced delete preflight save failure");};});
  page.once("dialog",dialog=>dialog.accept());
  await page.locator("#deleteWorksheetBtn").click();
  await expect(page.locator("#toast")).toContainText("Delete cancelled");
  await expect(page.locator("#worksheetList button")).toHaveCount(before);
  const trash=await page.evaluate(async()=>{const P=window.CalcPersistence,db=new P.CalcDatabase();await db.open();return (await P.listTrash(db)).filter(x=>x.entityType===P.STORES.notebooks).length;});
  expect(trash).toBe(0);
  expect(errors).toEqual([]);
});

test("delete-last-notebook reports unsaved replacement when replacement persistence fails",async({page})=>{
  const errors=await openApp(page);
  await goView(page,"worksheet");
  await expect(page.locator("#worksheetList button")).toHaveCount(1);
  await page.evaluate(()=>{
    const P=window.CalcPersistence,original=P.saveNotebookIncremental;let calls=0;
    P.saveNotebookIncremental=async function(...args){calls++;if(calls>=2)throw new Error("forced replacement save failure");return original.apply(this,args);};
  });
  page.once("dialog",dialog=>dialog.accept());
  await page.locator("#deleteWorksheetBtn").click();
  await expect(page.locator("#toast")).toContainText("new blank notebook could not be saved");
  await expect(page.locator("#worksheetList button")).toHaveCount(1);
  const trash=await page.evaluate(async()=>{const P=window.CalcPersistence,db=new P.CalcDatabase();await db.open();return (await P.listTrash(db)).filter(x=>x.entityType===P.STORES.notebooks).length;});
  expect(trash).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});

test("failed notebook version restore rolls back UI and never reports success",async({page})=>{
  const errors=await openApp(page);
  await goView(page,"worksheet");
  const title=page.locator("#worksheetTitle");
  await title.click();await title.fill("Current Version");
  await expect(page.locator("#worksheetVersionList button").first()).toBeVisible();
  await page.evaluate(()=>{window.CalcPersistence.saveNotebookIncremental=async()=>{throw new Error("forced version restore failure");};});
  await page.locator("#worksheetVersionList button").first().click();
  await expect(page.locator("#toast")).toContainText("forced version restore failure");
  await expect(title).toHaveValue("Current Version");
  await expect(page.locator("#toast")).not.toContainText("Notebook version restored");
  expect(errors).toEqual([]);
});

test("failed notebook import write rolls back UI and never reports success",async({page})=>{
  const errors=await openApp(page);
  await goView(page,"worksheet");
  const before=await page.locator("#worksheetList button").count();
  const fixture=await page.evaluate(()=>{
    const NB=window.CalcNotebook,doc=NB.normalizeNotebook({schema:NB.SCHEMA,id:"import-source",title:"Import Failure Probe",revision:1,blocks:[NB.newBlock("text",{source:"fixture"})],versions:[],settings:{autoRun:false}});
    return JSON.stringify({schema:NB.SCHEMA,exportedAt:new Date().toISOString(),notebook:doc});
  });
  await page.evaluate(()=>{
    const P=window.CalcPersistence;
    P.saveNotebookIncremental=async()=>{const e=new Error("forced import write failure");e.name="QuotaExceededError";throw e;};
  });
  await page.locator("#worksheetImportFile").setInputFiles({name:"failure.calcnb.json",mimeType:"application/json",buffer:Buffer.from(fixture)});
  await expect(page.locator("#toast")).not.toContainText("Notebook imported");
  await expect(page.locator("#worksheetList button")).toHaveCount(before);
  await expect(page.locator("#worksheetTitle")).not.toHaveValue("Import Failure Probe");
  expect(errors).toEqual([]);
});

test("notebook title input is recovery-safe before blur",async({page})=>{
  await openApp(page);
  await goView(page,"worksheet");
  const title=page.locator("#worksheetTitle");
  await title.click();
  await title.fill("Unsaved title probe");
  const recovery=await page.evaluate(()=>{
    const raw=sessionStorage.getItem("calc.notebook.recovery");if(!raw)return null;const parsed=JSON.parse(raw);return parsed.entries?Object.values(parsed.entries)[0]:parsed;
  });
  expect(recovery).toBeTruthy();
  expect(recovery.document.title).toBe("Unsaved title probe");
});

test("overlapping slow notebook saves serialize without false conflict or recovery loss",async({page})=>{
  const errors=await openApp(page);await goView(page,"worksheet");
  const auto=page.locator("#worksheetAutoRun");if(await auto.isChecked())await auto.uncheck();
  await page.evaluate(()=>{
    const P=window.CalcPersistence,original=P.saveNotebookIncremental;let first=true;
    P.saveNotebookIncremental=async function(db,doc,expected,options){
      if(first){first=false;await new Promise(r=>setTimeout(r,700));}
      return original(db,doc,expected,options);
    };
  });
  const editor=page.locator(".ws-editor").first();
  await editor.fill("1+1");
  await page.waitForTimeout(360);
  await editor.fill("2+2");
  await expect.poll(async()=>page.evaluate(async()=>{
    const P=window.CalcPersistence,db=new P.CalcDatabase();await db.open();const docs=await P.loadNotebooks(db);
    const active=docs.find(x=>!/conflict copy/.test(x.title||""));return {source:active&&active.blocks[0]&&active.blocks[0].source,conflicts:docs.filter(x=>/conflict copy/.test(x.title||"")).length};
  }),{timeout:5000,intervals:[100,200,300,500]}).toEqual({source:"2+2",conflicts:0});
  const recovery=await page.evaluate(()=>sessionStorage.getItem("calc.notebook.recovery"));
  expect(recovery).toBeNull();
  expect(errors).toEqual([]);
});

test("rapid edits in two notebooks persist independently after switching",async({page})=>{
  const errors=await openApp(page);await goView(page,"worksheet");
  await page.locator("#worksheetTitle").fill("Notebook A");
  await expect.poll(async()=>page.evaluate(async()=>{const P=window.CalcPersistence,db=new P.CalcDatabase();await db.open();return (await P.loadNotebooks(db)).some(x=>x.title==="Notebook A");}),{timeout:3000}).toBeTruthy();
  await page.locator("#newWorksheetBtn").click();
  await expect(page.locator("#worksheetList button")).toHaveCount(2);
  await page.locator("#worksheetTitle").fill("Notebook B");
  await expect.poll(async()=>page.evaluate(async()=>{const P=window.CalcPersistence,db=new P.CalcDatabase();await db.open();return (await P.loadNotebooks(db)).some(x=>x.title==="Notebook B");}),{timeout:3000}).toBeTruthy();
  await page.locator("#worksheetList button").filter({hasText:"Notebook A"}).click();
  await page.locator(".ws-editor").first().fill("101+1");
  await page.locator("#worksheetList button").filter({hasText:"Notebook B"}).click();
  await page.locator(".ws-editor").first().fill("202+2");
  const sourceFor=title=>page.evaluate(async title=>{const P=window.CalcPersistence,db=new P.CalcDatabase();await db.open();const doc=(await P.loadNotebooks(db)).find(x=>x.title===title);return doc&&doc.blocks[0]&&doc.blocks[0].source;},title);
  await expect.poll(()=>sourceFor("Notebook A"),{timeout:4000}).toBe("101+1");
  await expect.poll(()=>sourceFor("Notebook B"),{timeout:4000}).toBe("202+2");
  expect(errors).toEqual([]);
});

test("session recovery retains unsaved snapshots for multiple notebooks",async({page})=>{
  const errors=await openApp(page);await goView(page,"worksheet");
  await page.locator("#worksheetTitle").fill("Recovery A");
  await expect.poll(async()=>page.evaluate(async()=>{const P=window.CalcPersistence,db=new P.CalcDatabase();await db.open();return (await P.loadNotebooks(db)).some(x=>x.title==="Recovery A");}),{timeout:3000}).toBeTruthy();
  await page.locator("#newWorksheetBtn").click();await expect(page.locator("#worksheetList button")).toHaveCount(2);
  await page.locator("#worksheetTitle").fill("Recovery B");
  await expect.poll(async()=>page.evaluate(async()=>{const P=window.CalcPersistence,db=new P.CalcDatabase();await db.open();return (await P.loadNotebooks(db)).some(x=>x.title==="Recovery B");}),{timeout:3000}).toBeTruthy();
  await page.evaluate(()=>{window.CalcPersistence.saveNotebookIncremental=async()=>{throw new Error("forced recovery persistence failure");};});
  await page.locator("#worksheetList button").filter({hasText:"Recovery A"}).click();await page.locator(".ws-editor").first().fill("A unsaved");
  await page.locator("#worksheetList button").filter({hasText:"Recovery B"}).click();await page.locator(".ws-editor").first().fill("B unsaved");
  await page.waitForTimeout(450);
  const entries=await page.evaluate(()=>{const raw=sessionStorage.getItem("calc.notebook.recovery");if(!raw)return [];const parsed=JSON.parse(raw);return Object.values(parsed.entries||{}).map(x=>({title:x.document.title,source:x.document.blocks[0]&&x.document.blocks[0].source}));});
  expect(entries.some(x=>x.title==="Recovery A"&&x.source==="A unsaved")).toBeTruthy();
  expect(entries.some(x=>x.title==="Recovery B"&&x.source==="B unsaved")).toBeTruthy();
  expect(errors).toEqual([]);
});

test("rapid notebook edits always advance persisted optimistic revision",async({page})=>{
  await openApp(page);
  await goView(page,"worksheet");
  const readMaxRevision=()=>page.evaluate(async()=>{
    const P=window.CalcPersistence,db=new P.CalcDatabase();await db.open();const docs=await P.loadNotebooks(db);return Math.max(...docs.map(d=>d.revision||0));
  });
  const before=await readMaxRevision();
  const editor=page.locator(".ws-editor").first();
  await editor.fill("1+1");
  await expect.poll(readMaxRevision,{timeout:3000,intervals:[100,150,250,400]}).toBeGreaterThan(before);
  const afterBlock=await readMaxRevision();
  await page.locator("#worksheetTitle").fill("Rapid revision probe");
  await expect.poll(readMaxRevision,{timeout:3000,intervals:[100,150,250,400]}).toBeGreaterThan(afterBlock);
});

test("backup retries failed non-active notebook recovery entries before export",async({page})=>{
  const errors=await openApp(page);await goView(page,"worksheet");
  await page.locator("#worksheetTitle").fill("Retry A");
  await expect.poll(async()=>page.evaluate(async()=>{const P=window.CalcPersistence,db=new P.CalcDatabase();await db.open();return (await P.loadNotebooks(db)).some(x=>x.title==="Retry A");}),{timeout:3000}).toBeTruthy();
  await page.locator("#newWorksheetBtn").click();await page.locator("#worksheetTitle").fill("Retry B");
  await expect.poll(async()=>page.evaluate(async()=>{const P=window.CalcPersistence,db=new P.CalcDatabase();await db.open();return (await P.loadNotebooks(db)).some(x=>x.title==="Retry B");}),{timeout:3000}).toBeTruthy();
  await page.locator("#worksheetList button").filter({hasText:"Retry A"}).click();
  await page.evaluate(()=>{
    const P=window.CalcPersistence,original=P.saveNotebookIncremental;let failed=false;
    P.saveNotebookIncremental=async function(db,doc,expected,options){
      if(doc.title==="Retry A"&&!failed){failed=true;throw new Error("forced scheduled A failure");}
      return original(db,doc,expected,options);
    };
  });
  await page.locator(".ws-editor").first().fill("444+1");
  await page.waitForTimeout(700);
  await page.locator("#worksheetList button").filter({hasText:"Retry B"}).click();
  const before=await page.evaluate(async()=>{const P=window.CalcPersistence,db=new P.CalcDatabase();await db.open();const d=(await P.loadNotebooks(db)).find(x=>x.title==="Retry A");return d&&d.blocks[0].source;});
  expect(before).not.toBe("444+1");
  await goView(page,"settings");
  const downloadPromise=page.waitForEvent("download");
  await page.locator("#fullBackupBtn").click();
  const download=await downloadPromise;
  const path=await download.path();expect(path).toBeTruthy();
  const persisted=await page.evaluate(async()=>{const P=window.CalcPersistence,db=new P.CalcDatabase();await db.open();const d=(await P.loadNotebooks(db)).find(x=>x.title==="Retry A");return d&&d.blocks[0].source;});
  expect(persisted).toBe("444+1");
  expect(errors).toEqual([]);
});

test("backup aborts instead of exporting stale notebook data after a save failure",async({page})=>{
  const errors=await openApp(page);
  await goView(page,"worksheet");
  await page.waitForTimeout(500);
  await page.evaluate(()=>{
    window.CalcPersistence.saveNotebookIncremental=async()=>{const e=new Error("Forced quota failure");e.name="QuotaExceededError";throw e;};
  });
  await page.locator("#worksheetTitle").fill("Must not be silently omitted");
  await goView(page,"settings");
  let downloads=0;page.on("download",()=>downloads++);
  await page.locator("#fullBackupBtn").click();
  await expect(page.locator("#toast")).toContainText("cancelled");
  await page.waitForTimeout(250);
  expect(downloads).toBe(0);
  expect(errors).toEqual([]);
});

test("remote notebook update preserves local dirty edits as a visible conflict copy",async({page})=>{
  const errors=await openApp(page);
  await goView(page,"worksheet");
  const auto=page.locator("#worksheetAutoRun");if(await auto.isChecked())await auto.uncheck();
  await page.waitForTimeout(450);
  const editor=page.locator(".ws-editor").first();
  await editor.fill("123+456");
  const local=await page.evaluate(()=>{
    const raw=sessionStorage.getItem("calc.notebook.recovery");if(!raw)return null;const parsed=JSON.parse(raw);return parsed.entries?Object.values(parsed.entries)[0]:parsed;
  });
  expect(local).toBeTruthy();
  await page.evaluate(async id=>{
    const P=window.CalcPersistence,NB=window.CalcNotebook,db=new P.CalcDatabase();await db.open();
    const current=await P.loadNotebook(db,id);if(!current)throw new Error("active notebook missing");
    const remote=NB.commitRevision(current,"remote update");remote.title="Remote notebook";remote.updatedAt=Date.now();
    await P.saveNotebookIncremental(db,remote,current.revision);
    const channel=new BroadcastChannel("calc-persistence-v1");
    channel.postMessage({schema:"calc.broadcast/v1",sender:"bug-sweep-notebook-remote",entityType:P.STORES.notebooks,entityId:id,revision:remote.revision,action:"put"});
    setTimeout(()=>channel.close(),100);
  },local.id);
  await expect(page.locator("#toast")).toContainText("local edits were preserved as a conflict copy");
  await expect(page.locator("#worksheetList")).toContainText("(local conflict copy)");
  await expect(page.locator("#worksheetTitle")).toHaveValue("Remote notebook");
  const result=await page.evaluate(async originalId=>{
    const P=window.CalcPersistence,db=new P.CalcDatabase();await db.open(),docs=await P.loadNotebooks(db);
    return {
      originals:docs.filter(x=>x.id===originalId).map(x=>({title:x.title,source:x.blocks[0]&&x.blocks[0].source})),
      conflicts:docs.filter(x=>x.id!==originalId&&/local conflict copy/.test(x.title||"")).map(x=>({id:x.id,title:x.title,source:x.blocks[0]&&x.blocks[0].source,revision:x.revision}))
    };
  },local.id);
  expect(result.originals).toHaveLength(1);
  expect(result.originals[0].title).toBe("Remote notebook");
  expect(result.conflicts.length).toBeGreaterThanOrEqual(1);
  expect(result.conflicts.some(x=>x.source==="123+456")).toBeTruthy();
  expect(errors).toEqual([]);
});

test("custom-tool archive preserves unsaved visible editor changes",async({page})=>{
  const errors=await openApp(page);
  const id=await page.evaluate(async()=>{
    const CT=window.CalcCustomTools,P=window.CalcPersistence;
    let draft=CT.newFormulaDraft();draft.name="Archive Visible";const active=CT.activate(draft).manifest;
    const db=new P.CalcDatabase();await db.open();await db.repository(P.STORES.customTools).put(active);return active.id;
  });
  await page.reload({waitUntil:"domcontentloaded"});
  await expect.poll(()=>page.evaluate(id=>!!window.CalcTools.REGISTRY.get("custom."+id),id),{timeout:5000}).toBeTruthy();
  await goView(page,"tools");await page.locator("#customToolBuilderBtn").click();
  await page.locator("#customToolLibrary button").filter({hasText:"Archive Visible"}).click();
  await page.locator("#customName").fill("Archive Edited");
  await page.locator("#customDescription").fill("visible unsaved description");
  await page.locator("#customExpression").fill("x*3");
  await page.locator("#customArchiveBtn").click();
  await expect(page.locator("#toast")).toContainText("Custom tool archived");
  const stored=await page.evaluate(async id=>{const P=window.CalcPersistence,db=new P.CalcDatabase();await db.open();return db.repository(P.STORES.customTools).get(id);},id);
  expect(stored.status).toBe("archived");
  expect(stored.name).toBe("Archive Edited");
  expect(stored.description).toBe("visible unsaved description");
  expect(stored.expression).toBe("x*3");
  expect(errors).toEqual([]);
});

test("custom-tool export serializes current unsaved editor state",async({page})=>{
  const errors=await openApp(page);
  await goView(page,"tools");await page.locator("#customToolBuilderBtn").click();
  await page.locator("#customName").fill("Export Unsaved");
  await page.locator("#customDescription").fill("current editor state");
  await page.locator("#customExpression").fill("x*7");
  await page.evaluate(()=>{
    window.__exportedCustom=null;
    URL.createObjectURL=function(blob){blob.text().then(t=>window.__exportedCustom=t);return "blob:calc-test";};
    URL.revokeObjectURL=function(){};
    HTMLAnchorElement.prototype.click=function(){};
  });
  await page.locator("#customExportBtn").click();
  await expect.poll(()=>page.evaluate(()=>window.__exportedCustom),{timeout:3000}).not.toBeNull();
  const exported=JSON.parse(await page.evaluate(()=>window.__exportedCustom));
  expect(exported.tool.name).toBe("Export Unsaved");
  expect(exported.tool.description).toBe("current editor state");
  expect(exported.tool.expression).toBe("x*7");
  expect(exported.tool.status).toBe("draft");
  expect(errors).toEqual([]);
});

test("failed custom-tool draft save leaves active runtime tool intact",async({page})=>{
  const errors=await openApp(page);
  const seeded=await page.evaluate(async()=>{
    const CT=window.CalcCustomTools,P=window.CalcPersistence;
    let draft=CT.newFormulaDraft();draft.name="Persistence Guard";draft.description="active tool";const active=CT.activate(draft).manifest;
    const db=new P.CalcDatabase();await db.open();await db.repository(P.STORES.customTools).put(active);return active.id;
  });
  await page.reload({waitUntil:"domcontentloaded"});
  await goView(page,"tools");
  await expect(page.locator("#toolList button").filter({hasText:"Persistence Guard"})).toBeVisible();
  await page.locator("#customToolBuilderBtn").click();
  await page.locator("#customToolLibrary button").filter({hasText:"Persistence Guard"}).click();
  await page.evaluate(()=>{
    const P=window.CalcPersistence,original=P.Repository.prototype.putVersioned;
    P.Repository.prototype.putVersioned=function(value,expected){if(this.store===P.STORES.customTools)return Promise.reject(new Error("forced custom write failure"));return original.call(this,value,expected);};
  });
  await page.locator("#customName").fill("Persistence Guard Edited");
  await page.locator("#customSaveDraftBtn").click();
  await expect(page.locator("#toast")).toContainText("forced custom write failure");
  expect(await page.evaluate(id=>!!window.CalcTools.REGISTRY.get("custom."+id),seeded)).toBeTruthy();
  expect(errors).toEqual([]);
});

test("custom-tool revision conflict installs newer remote original and preserves local copy",async({page})=>{
  const errors=await openApp(page);
  const seed=await page.evaluate(async()=>{
    const CT=window.CalcCustomTools,P=window.CalcPersistence;
    let draft=CT.newFormulaDraft();draft.name="Conflict Guard";const active=CT.activate(draft).manifest;
    const db=new P.CalcDatabase();await db.open();await db.repository(P.STORES.customTools).put(active);
    return {id:active.id,revision:active.revision};
  });
  await page.reload({waitUntil:"domcontentloaded"});
  await expect.poll(()=>page.evaluate(id=>!!window.CalcTools.REGISTRY.get("custom."+id),seed.id),{timeout:5000}).toBeTruthy();
  await goView(page,"tools");
  await page.locator("#customToolBuilderBtn").click();
  await page.locator("#customToolLibrary button").filter({hasText:"Conflict Guard"}).click();
  await page.evaluate(async id=>{
    const CT=window.CalcCustomTools,P=window.CalcPersistence,db=new P.CalcDatabase();await db.open();
    const current=await db.repository(P.STORES.customTools).get(id);
    let remote=CT.revise(current,{name:"Remote Guard"});remote=CT.activate(remote).manifest;
    await db.repository(P.STORES.customTools).put(remote);
  },seed.id);
  await page.locator("#customName").fill("Local Guard");
  await page.locator("#customSaveDraftBtn").click();
  await expect(page.locator("#toast")).toContainText("conflict copy");
  const result=await page.evaluate(async id=>{
    const P=window.CalcPersistence,db=new P.CalcDatabase();await db.open(),items=await db.repository(P.STORES.customTools).all();
    const runtime=window.CalcTools.REGISTRY.get("custom."+id);
    return {runtimeName:runtime&&runtime.name,remote:items.find(x=>x.id===id),copies:items.filter(x=>x.id!==id&&/conflict copy/.test(x.name||""))};
  },seed.id);
  expect(result.runtimeName).toBe("Remote Guard");
  expect(result.remote.name).toBe("Remote Guard");
  expect(result.copies.length).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});

test("failed custom-tool delete leaves persisted and runtime tool intact",async({page})=>{
  const errors=await openApp(page);
  const seeded=await page.evaluate(async()=>{
    const CT=window.CalcCustomTools,P=window.CalcPersistence;
    let draft=CT.newFormulaDraft();draft.name="Delete Guard";const active=CT.activate(draft).manifest;
    const db=new P.CalcDatabase();await db.open();await db.repository(P.STORES.customTools).put(active);return active.id;
  });
  await page.reload({waitUntil:"domcontentloaded"});
  await goView(page,"tools");
  await page.locator("#customToolBuilderBtn").click();
  await page.locator("#customToolLibrary button").filter({hasText:"Delete Guard"}).click();
  await page.evaluate(()=>{window.CalcPersistence.deleteWithTombstone=async()=>{throw new Error("forced custom delete failure");};});
  page.once("dialog",dialog=>dialog.accept());
  await page.locator("#customDeleteBtn").click();
  await expect(page.locator("#toast")).toContainText("Could not delete custom tool");
  const state=await page.evaluate(async id=>{
    const P=window.CalcPersistence,db=new P.CalcDatabase();await db.open();
    return {runtime:!!window.CalcTools.REGISTRY.get("custom."+id),stored:!!await db.repository(P.STORES.customTools).get(id)};
  },seeded);
  expect(state.runtime).toBeTruthy();expect(state.stored).toBeTruthy();
  expect(errors).toEqual([]);
});

test("failed custom-tool refresh keeps last known-good runtime",async({page})=>{
  const errors=await openApp(page);
  const id=await page.evaluate(async()=>{
    const CT=window.CalcCustomTools,P=window.CalcPersistence;
    let draft=CT.newFormulaDraft();draft.name="Refresh Failure Guard";const active=CT.activate(draft).manifest;
    const db=new P.CalcDatabase();await db.open();await db.repository(P.STORES.customTools).put(active);return active.id;
  });
  await page.reload({waitUntil:"domcontentloaded"});
  await expect.poll(()=>page.evaluate(id=>!!window.CalcTools.REGISTRY.get("custom."+id),id),{timeout:5000}).toBeTruthy();
  await page.evaluate(id=>{
    const P=window.CalcPersistence,original=P.Repository.prototype.all;
    P.Repository.prototype.all=function(){if(this.store===P.STORES.customTools)return Promise.reject(new Error("forced custom read failure"));return original.call(this);};
    const channel=new BroadcastChannel("calc-persistence-v1");
    channel.postMessage({schema:"calc.broadcast/v1",sender:"bug-sweep-read-failure",entityType:P.STORES.customTools,entityId:id,revision:999,action:"put"});
    setTimeout(()=>channel.close(),100);
  },id);
  await expect(page.locator("#toast")).toContainText("Could not refresh custom tools");
  expect(await page.evaluate(id=>!!window.CalcTools.REGISTRY.get("custom."+id),id)).toBeTruthy();
  expect(errors).toEqual([]);
});

test("custom builder close applies deferred cross-tab refresh",async({page})=>{
  const errors=await openApp(page);
  const id=await page.evaluate(async()=>{
    const CT=window.CalcCustomTools,P=window.CalcPersistence;
    let draft=CT.newFormulaDraft();draft.name="Deferred Refresh Guard";const active=CT.activate(draft).manifest;
    const db=new P.CalcDatabase();await db.open();await db.repository(P.STORES.customTools).put(active);return active.id;
  });
  await page.reload({waitUntil:"domcontentloaded"});
  await expect.poll(()=>page.evaluate(id=>!!window.CalcTools.REGISTRY.get("custom."+id),id),{timeout:5000}).toBeTruthy();
  await goView(page,"tools");
  await page.locator("#customToolBuilderBtn").click();
  await expect(page.locator("#customToolDialog")).toHaveJSProperty("open",true);
  await page.locator("#customToolLibrary button").filter({hasText:"Deferred Refresh Guard"}).click();
  await expect(page.locator("#customStatusBadge")).toContainText("active");
  await page.evaluate(async id=>{
    const CT=window.CalcCustomTools,P=window.CalcPersistence,db=new P.CalcDatabase();await db.open();
    const current=await db.repository(P.STORES.customTools).get(id),archived=CT.archive(current);
    await db.repository(P.STORES.customTools).put(archived);
    const channel=new BroadcastChannel("calc-persistence-v1");
    channel.postMessage({schema:"calc.broadcast/v1",sender:"bug-sweep-deferred",entityType:P.STORES.customTools,entityId:id,revision:archived.revision,action:"put"});
    setTimeout(()=>channel.close(),100);
  },id);
  await expect(page.locator("#toast")).toContainText("close the builder");
  expect(await page.evaluate(id=>!!window.CalcTools.REGISTRY.get("custom."+id),id)).toBeTruthy();
  await page.locator("#customCloseBtn").click();
  await expect.poll(()=>page.evaluate(id=>!!window.CalcTools.REGISTRY.get("custom."+id),id),{timeout:3000}).toBeFalsy();
  await page.locator("#customToolBuilderBtn").click();
  await expect(page.locator("#customStatusBadge")).toContainText(/archived/i);
  await expect(page.locator("#customName")).toHaveValue("Deferred Refresh Guard");
  expect(errors).toEqual([]);
});

test("cross-tab custom-tool archive removes stale active runtime",async({page})=>{
  const errors=await openApp(page);
  const id=await page.evaluate(async()=>{
    const CT=window.CalcCustomTools,P=window.CalcPersistence;
    let draft=CT.newFormulaDraft();draft.name="Cross Tab Archive Guard";const active=CT.activate(draft).manifest;
    const db=new P.CalcDatabase();await db.open();await db.repository(P.STORES.customTools).put(active);return active.id;
  });
  await page.reload({waitUntil:"domcontentloaded"});
  await expect.poll(()=>page.evaluate(id=>!!window.CalcTools.REGISTRY.get("custom."+id),id),{timeout:5000}).toBeTruthy();
  await page.evaluate(async id=>{
    const CT=window.CalcCustomTools,P=window.CalcPersistence,db=new P.CalcDatabase();await db.open();
    const current=await db.repository(P.STORES.customTools).get(id),archived=CT.archive(current);
    await db.repository(P.STORES.customTools).put(archived);
    const channel=new BroadcastChannel("calc-persistence-v1");
    channel.postMessage({schema:"calc.broadcast/v1",sender:"bug-sweep-remote",entityType:P.STORES.customTools,entityId:id,revision:archived.revision,action:"put"});
    setTimeout(()=>channel.close(),100);
  },id);
  await expect.poll(()=>page.evaluate(id=>!!window.CalcTools.REGISTRY.get("custom."+id),id),{timeout:3000}).toBeFalsy();
  expect(errors).toEqual([]);
});

test("all registered tools render and execute their default UI without JS failure",async({page})=>{
  const errors=await openApp(page);
  const ids=await page.evaluate(()=>window.CalcTools.REGISTRY.list().map(t=>t.id));
  for(const id of ids){
    await page.evaluate(id=>{location.hash="#tools/"+encodeURIComponent(id);},id);
    await expect(page.locator("#toolRun")).toBeVisible();
    await page.locator("#toolRun").click();
    await expect(page.locator("#toolResult")).toBeVisible();
    await expect(page.locator("#toolResult strong")).not.toHaveText("Error");
  }
  expect(errors).toEqual([]);
});

test("data workspace sample analytics and distributions remain operable",async({page})=>{
  const errors=await openApp(page);
  await goView(page,"data");
  await page.locator("#sampleDataBtn").click();
  await expect(page.locator("#dataSummary")).toContainText("5 rows");
  for(const id of ["pearsonBtn","spearmanBtn","regressionBtn","histogramBtn","boxplotBtn","meanCiBtn","oneSampleTBtn","distributionEvalBtn","distributionQuantileBtn"]){
    await page.locator("#"+id).click();
  }
  await expect(page.locator("#dataAnalysisResult")).not.toHaveClass(/ws-error/);
  await expect(page.locator("#inferenceResult")).not.toHaveClass(/ws-error/);
  await expect(page.locator("#distributionResult")).not.toHaveClass(/ws-error/);
  expect(errors).toEqual([]);
});
