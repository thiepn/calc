"use strict";
const {test,expect}=require("@playwright/test");

async function openApp(page,path="/index.html"){
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto(path,{waitUntil:"domcontentloaded"});
  await expect(page.locator("#app")).toBeVisible();
  await expect(page.locator("#exactResult")).not.toHaveText("Calc could not initialize");
  return errors;
}

test("all primary workspaces navigate without runtime errors",async({page})=>{
  const errors=await openApp(page);
  for(const view of ["calculate","graph","matrix","data","tools","worksheet","history","settings"]){
    await page.locator('[data-view="'+view+'"]').first().click();
    await expect(page.locator('[data-view-panel="'+view+'"]')).toHaveClass(/active/);
  }
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
  await page.locator('[data-view="tools"]').first().click();
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
  await page.locator('[data-view="tools"]').first().click();
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
  await page.locator('[data-view="data"]').first().click();
  const header='<svg data-data-xss onload="window.__dataXss=(window.__dataXss||0)+1"></svg>';
  await page.locator("#dataInput").fill(header+",y\n1,2\n2,4\n3,6");
  await page.locator("#analyzeDataBtn").click();
  await expect(page.locator("#dataSummary")).toContainText("3 rows");
  await page.locator("#histogramBtn").click();
  await expect(page.locator("#dataAnalysisResult")).toContainText("<svg");
  await expect(page.locator("#dataAnalysisResult svg")).toHaveCount(0);
  expect(await page.evaluate(()=>window.__dataXss||0)).toBe(0);
});

test("notebook Ref copy does not throw when clipboard APIs are unavailable",async({page})=>{
  await page.addInitScript(()=>{
    Object.defineProperty(navigator,"clipboard",{configurable:true,value:undefined});
    Document.prototype.execCommand=undefined;
  });
  const errors=await openApp(page);
  await page.locator('[data-view="worksheet"]').first().click();
  await page.locator('[data-ws-action="ref"]').first().click();
  await expect(page.locator("#toast")).toContainText("Copy unavailable");
  expect(errors).toEqual([]);
});

test("notebook title input is recovery-safe before blur",async({page})=>{
  await openApp(page);
  await page.locator('[data-view="worksheet"]').first().click();
  const title=page.locator("#worksheetTitle");
  await title.click();
  await title.fill("Unsaved title probe");
  const recovery=await page.evaluate(()=>{
    const raw=sessionStorage.getItem("calc.notebook.recovery");return raw?JSON.parse(raw):null;
  });
  expect(recovery).toBeTruthy();
  expect(recovery.document.title).toBe("Unsaved title probe");
});

test("rapid notebook edits always advance persisted optimistic revision",async({page})=>{
  await openApp(page);
  await page.locator('[data-view="worksheet"]').first().click();
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

test("backup aborts instead of exporting stale notebook data after a save failure",async({page})=>{
  const errors=await openApp(page);
  await page.locator('[data-view="worksheet"]').first().click();
  await page.waitForTimeout(500);
  await page.evaluate(()=>{
    window.CalcPersistence.saveNotebookIncremental=async()=>{const e=new Error("Forced quota failure");e.name="QuotaExceededError";throw e;};
  });
  await page.locator("#worksheetTitle").fill("Must not be silently omitted");
  await page.locator('[data-view="settings"]').first().click();
  let downloads=0;page.on("download",()=>downloads++);
  await page.locator("#fullBackupBtn").click();
  await expect(page.locator("#toast")).toContainText("cancelled");
  await page.waitForTimeout(250);
  expect(downloads).toBe(0);
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
  await page.locator('[data-view="data"]').first().click();
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
