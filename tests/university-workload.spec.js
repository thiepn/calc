"use strict";
const {test,expect}=require("@playwright/test");

async function openApp(page){
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/index.html",{waitUntil:"domcontentloaded"});
  await expect(page.locator("#app")).toBeVisible();
  await expect(page.locator("#exactResult")).not.toHaveText("Calc could not initialize");
  await expect.poll(()=>page.evaluate(()=>typeof document.querySelector("#angleBtn")?.onclick==="function"),{timeout:12000}).toBe(true);
  return errors;
}
async function runCalc(page,source,expected){
  const input=page.locator("#expressionInput");
  await input.fill(source);
  await input.press("Enter");
  await expect(page.locator("#exactResult")).toContainText(expected);
}

test("U8 university workload composes U1 through U7 in one browser session",async({page},testInfo)=>{
  const errors=await openApp(page);
  const versions=await page.evaluate(()=>({
    app:window.CalcAppVersion,
    u1:window.CalcCAS?.VERSION,u2:window.CalcMultivariable?.VERSION,u3:window.CalcODE?.VERSION,
    u4:window.CalcOptimization?.VERSION,u5:window.CalcAdvancedLinearAlgebra?.VERSION,
    u6:window.CalcNumerical?.VERSION,u7:window.CalcDiscrete?.VERSION
  }));
  expect(versions).toEqual({app:"2.7.0",u1:"2.0.0-u1",u2:"2.1.0-u2",u3:"2.2.0-u3",u4:"2.3.0-u4",u5:"2.4.0-u5",u6:"2.5.0-u6",u7:"2.6.0-u7"});

  await runCalc(page,"0.1+0.2","3/10");
  await expect(page.locator("#calcStatus")).toHaveText("Exact");

  await runCalc(page,"assume(x>0; simplify(sqrt(x^2)))","x");
  await expect(page.locator("#calcStatus")).toHaveText("Symbolic");

  await runCalc(page,"gradat(x^2+y^2; x,y; 1,2)","[2, 4]");
  await runCalc(page,"stability(y,-x; x,y; 0,0)","center (linearized)");
  await runCalc(page,"lpmax(3,2; 1,1|1,0|0,1; 4,2,3)","objective = 10");
  await runCalc(page,"matrixfunc(4,0|0,9; sqrt)","[[2, 0], [0, 3]]");
  await runCalc(page,"quad(x^4; x; 0; 1; 10; simpson)","I ≈ 0.2");
  await expect(page.locator("#calcStatus")).toHaveText("Approximate");
  await runCalc(page,"choose(52; 5)","2598960");
  await expect(page.locator("#calcStatus")).toHaveText("Exact");

  // Command discovery must expose university tools without obscuring normal navigation.
  await page.locator("#commandBtn").click();
  await page.locator("#commandInput").fill("U7 graph shortest path");
  await expect(page.locator("#commandResults")).toContainText("U7: Graph shortest path");
  await page.keyboard.press("Escape");

  // Cross-module Worksheet execution/serialization in the browser runtime.
  const worksheet=await page.evaluate(()=>{
    const N=window.CalcNotebook;
    function b(id,source){return {id,type:"math",title:"",source,config:{},status:"dirty",dependencies:[],producedSymbols:[],result:{status:"idle",kind:"none",display:"",approx:"",error:null,value:null,serialized:null,metadata:{}},updatedAt:1};}
    const doc={schema:N.SCHEMA,id:"u8-browser",title:"U8",createdAt:1,updatedAt:1,revision:1,blocks:[
      b("a","choose(10; 3)"),b("b","{{block:a}} / 10"),b("c","interp(0,1,2; 0,1,4; 1.5)"),b("d","{{block:c}} + 1/4")
    ],versions:[],settings:{autoRun:true}};
    const run=N.evaluateNotebook(doc,{precision:12,angle:"RAD"});
    const serialized=JSON.stringify(run.document);
    const normalized=N.normalizeNotebook(JSON.parse(serialized));
    const rerun=N.evaluateNotebook(normalized,{precision:12,angle:"RAD"});
    return {
      statuses:run.document.blocks.map(x=>x.status),
      displays:run.document.blocks.map(x=>x.result.display),
      cached:rerun.evaluations.map(x=>!!x.cached),
      jsonSafe:serialized.length>0
    };
  });
  expect(worksheet.statuses).toEqual(["clean","clean","clean","clean"]);
  expect(worksheet.displays[1]).toBe("12");
  expect(worksheet.displays[3]).toBe("5/2");
  expect(worksheet.cached).toEqual([true,true,true,true]);
  expect(worksheet.jsonSafe).toBeTruthy();

  if(testInfo.project.name==="mobile-chromium"){
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+3)).toBeTruthy();
  }
  expect(errors).toEqual([]);
});

test("U8 accessibility and local-first presentation contracts remain present",async({page})=>{
  const errors=await openApp(page);
  const state=await page.evaluate(async()=>{
    const [styles,sw,release]=await Promise.all([
      fetch("./styles.css",{cache:"no-store"}).then(r=>r.text()),
      fetch("./sw.js",{cache:"no-store"}).then(r=>r.text()),
      fetch("./release.json",{cache:"no-store"}).then(r=>r.json())
    ]);
    return {
      focusVisible:styles.includes(":focus-visible"),
      reducedMotion:styles.includes("prefers-reduced-motion:reduce"),
      u7Offline:sw.includes("./discrete-mathematics.js"),
      version:release.version,
      appVersion:window.CalcAppVersion,
      expressionLabel:document.querySelector("#expressionInput")?.getAttribute("aria-label"),
      graphLabel:document.querySelector("#graphCanvas")?.getAttribute("aria-label"),
      liveResult:document.querySelector(".result-block")?.getAttribute("aria-live"),
      zoomLocked:document.querySelector('meta[name="viewport"]')?.content.includes("user-scalable=no")
    };
  });
  expect(state.focusVisible).toBeTruthy();
  expect(state.reducedMotion).toBeTruthy();
  expect(state.u7Offline).toBeTruthy();
  expect(state.version).toBe("2.7.0");
  expect(state.appVersion).toBe("2.7.0");
  expect(state.expressionLabel).toBe("Expression");
  expect(state.graphLabel).toBe("Interactive mathematical graph");
  expect(state.liveResult).toBe("polite");
  expect(state.zoomLocked).toBeTruthy();
  expect(errors).toEqual([]);
});
