"use strict";
const fs=require("fs");
const path=require("path");

function assert(condition,message){if(!condition)throw new Error(message);}
const root=path.join(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const exists=p=>fs.existsSync(path.join(root,p));

const required=[
  "index.html","styles.css","app.js","cas.js","multivariable.js","ode.js","optimization.js","advanced-linear-algebra.js","numerical-mathematics.js","discrete-mathematics.js","persistence.js","notebook.js","sw.js","manifest.webmanifest",
  "package.json","release.json","playwright.config.js","tests/cas.js","tests/multivariable.js","tests/ode.js","tests/optimization.js","tests/advanced-linear-algebra.js","tests/numerical-mathematics.js","tests/discrete-mathematics.js","tests/university-workload.js","tests/university-workload.spec.js","tests/release-soak.spec.js","docs/math/ADVANCED_CAS_SEMANTICS.md","docs/math/MULTIVARIABLE_VECTOR_SEMANTICS.md","docs/math/ODE_DYNAMICAL_SYSTEMS_SEMANTICS.md","docs/math/OPTIMIZATION_SEMANTICS.md","docs/math/ADVANCED_LINEAR_ALGEBRA_SEMANTICS.md","docs/math/NUMERICAL_MATHEMATICS_SEMANTICS.md","docs/math/DISCRETE_MATHEMATICS_SEMANTICS.md",
  ".github/workflows/ci.yml",".github/workflows/release-soak.yml",".github/workflows/pages.yml","docs/release/IMPLEMENTATION_PHASE_13.md","docs/release/UNIVERSITY_WORKLOAD_CERTIFICATION.md"
];
required.forEach(p=>assert(exists(p),"Missing RC artifact: "+p));

const index=read("index.html"),styles=read("styles.css"),sw=read("sw.js"),persistence=read("persistence.js"),app=read("app.js"),notebook=read("notebook.js"),cas=read("cas.js"),multivariable=read("multivariable.js"),ode=read("ode.js"),optimization=read("optimization.js"),advancedLinear=read("advanced-linear-algebra.js"),numerical=read("numerical-mathematics.js"),discrete=read("discrete-mathematics.js");
const pkg=JSON.parse(read("package.json")),manifest=JSON.parse(read("manifest.webmanifest")),release=JSON.parse(read("release.json"));
const ciWorkflow=read(".github/workflows/ci.yml"),releaseWorkflow=read(".github/workflows/release-soak.yml"),pagesWorkflow=read(".github/workflows/pages.yml");
const soak=read("tests/release-soak.spec.js"),phase=read("docs/release/IMPLEMENTATION_PHASE_13.md"),university=read("tests/university-workload.js"),universityBrowser=read("tests/university-workload.spec.js"),universityDocs=read("docs/release/UNIVERSITY_WORKLOAD_CERTIFICATION.md");

assert(pkg.private===true,"Release tooling package must remain private");
assert(pkg.devDependencies&&pkg.devDependencies["@playwright/test"]==="1.63.0","Playwright must be pinned for deterministic RC runs");
assert(persistence.includes("const DB_VERSION=5;"),"RC requires database schema v5");
assert(persistence.includes("saveNotebookIncremental")&&persistence.includes("chunkNamespace"),"Chunk-aware incremental notebook persistence missing");
assert(persistence.includes("buildBackupBlobFromDb"),"Chunked backup builder missing");
assert(persistence.includes("restoreTombstone")&&persistence.includes("trashChunkRefs"),"Trash recovery engine missing");
assert(app.includes("P.updatePreflight")&&app.includes("P.resilienceDiagnostics"),"Persistence preflight/diagnostics not wired");
assert(index.indexOf('<script src="./cas.js"></script>')>index.indexOf('<script src="./calculus.js"></script>')&&index.indexOf('<script src="./cas.js"></script>')<index.indexOf('<script src="./app.js"></script>'),"CAS runtime load order is invalid");
assert(cas.includes('VERSION:"2.0.0-u1"')&&cas.includes("solveAdvancedEquation")&&cas.includes("integrateAdvanced"),"U1 CAS runtime incomplete");
assert(index.indexOf('<script src="./multivariable.js"></script>')>index.indexOf('<script src="./cas.js"></script>')&&index.indexOf('<script src="./multivariable.js"></script>')<index.indexOf('<script src="./app.js"></script>'),"U2 runtime load order is invalid");
assert(multivariable.includes('VERSION:"2.1.0-u2"')&&multivariable.includes("multivariableLimit")&&multivariable.includes("greenTheorem")&&multivariable.includes("divergenceTheorem"),"U2 multivariable runtime incomplete");
assert(index.indexOf('<script src="./ode.js"></script>')>index.indexOf('<script src="./multivariable.js"></script>')&&index.indexOf('<script src="./ode.js"></script>')<index.indexOf('<script src="./app.js"></script>'),"U3 runtime load order is invalid");
assert(ode.includes('VERSION:"2.2.0-u3"')&&ode.includes("rk45System")&&ode.includes("classifyLinearization2")&&ode.includes("matrixExponential2")&&ode.includes("laplaceTransform"),"U3 ODE runtime incomplete");
assert(index.indexOf('<script src="./optimization.js"></script>')>index.indexOf('<script src="./linear-algebra.js"></script>')&&index.indexOf('<script src="./optimization.js"></script>')<index.indexOf('<script src="./app.js"></script>'),"U4 runtime load order is invalid");
assert(optimization.includes('VERSION:"2.3.0-u4"')&&optimization.includes("optimizeLocal")&&optimization.includes("simplexMax")&&optimization.includes("quadProg")&&optimization.includes("kktCheck"),"U4 optimization runtime incomplete");
assert(index.indexOf('<script src="./advanced-linear-algebra.js"></script>')>index.indexOf('<script src="./linear-algebra.js"></script>')&&index.indexOf('<script src="./advanced-linear-algebra.js"></script>')<index.indexOf('<script src="./app.js"></script>'),"U5 runtime load order is invalid");
assert(advancedLinear.includes('VERSION:"2.4.0-u5"')&&advancedLinear.includes("jordanFormV2")&&advancedLinear.includes("realSchur")&&advancedLinear.includes("matrixFunctionSymmetric")&&advancedLinear.includes("lowRankApproximation"),"U5 advanced linear algebra runtime incomplete");
assert(index.indexOf('<script src="./numerical-mathematics.js"></script>')>index.indexOf('<script src="./optimization.js"></script>')&&index.indexOf('<script src="./numerical-mathematics.js"></script>')<index.indexOf('<script src="./app.js"></script>'),"U6 runtime load order is invalid");
assert(numerical.includes('VERSION:"2.5.0-u6"')&&numerical.includes("barycentricInterpolation")&&numerical.includes("quadratureDiagnostic")&&numerical.includes("conjugateGradient")&&numerical.includes("rayleighQuotientIteration")&&numerical.includes("stabilityAmplification"),"U6 numerical mathematics runtime incomplete");
assert(app.includes("NUM&&NUM.runCommand")&&notebook.includes("NUM&&NUM.runCommand"),"U6 router not wired into Calculate and Worksheet");
assert(sw.includes('"./numerical-mathematics.js"'),"U6 runtime missing from service-worker asset shell");
assert(app.includes("absstability(rk4; -2; 0)")&&notebook.includes('"absstability"'),"U6 absolute-stability command is not collision-safe");
const u6Docs=read("docs/math/NUMERICAL_MATHEMATICS_SEMANTICS.md");
assert(u6Docs.includes("Richardson extrapolation")&&u6Docs.includes("Conjugate gradient")&&u6Docs.includes("does **not** implement"),"U6 certification boundary is undocumented");
assert(index.indexOf('<script src="./discrete-mathematics.js"></script>')>index.indexOf('<script src="./numerical-mathematics.js"></script>')&&index.indexOf('<script src="./discrete-mathematics.js"></script>')<index.indexOf('<script src="./app.js"></script>'),"U7 runtime load order is invalid");
assert(discrete.includes('VERSION:"2.6.0-u7"')&&discrete.includes("chooseBig")&&discrete.includes("truthTable")&&discrete.includes("analyzeRelation")&&discrete.includes("shortestPath")&&discrete.includes("chromaticNumber"),"U7 discrete mathematics runtime incomplete");
assert(app.includes("DISC&&DISC.runCommand")&&notebook.includes("DISC&&DISC.runCommand"),"U7 router not wired into Calculate and Worksheet");
assert(sw.includes('"./discrete-mathematics.js"'),"U7 runtime missing from service-worker asset shell");
assert(app.includes("shortest(a,b,c,d; a-b:1,b-c:2,a-c:5,c-d:1; a; d)")&&notebook.includes('"discretehelp"'),"U7 command surface is not wired");
const u7Docs=read("docs/math/DISCRETE_MATHEMATICS_SEMANTICS.md");
assert(u7Docs.includes("generalized Chinese remainder theorem")&&u7Docs.includes("Dijkstra")&&u7Docs.includes("does **not** implement"),"U7 certification boundary is undocumented");
assert(university.includes("U8 final university-workload deterministic certification passed"),"U8 deterministic certification suite missing completion contract");
assert(university.includes('eq(CAS.VERSION,"2.0.0-u1"')&&university.includes('eq(DISC.VERSION,"2.6.0-u7"'),"U8 does not cover the complete U1-U7 versioned stack");
assert(university.includes("JSON.stringify(doc)")&&university.includes("cached===true"),"U8 Worksheet persistence/cache certification missing");
assert(universityBrowser.includes("U8 university workload composes U1 through U7")&&universityBrowser.includes("mobile-chromium"),"U8 browser certification coverage missing");
assert(universityDocs.includes("Exact vs approximate semantics")&&universityDocs.includes("Deliberate boundaries")&&universityDocs.includes("Chromium")&&universityDocs.includes("Firefox")&&universityDocs.includes("WebKit"),"U8 final certification report incomplete");
assert(pkg.scripts&&pkg.scripts["test:university"]==="node tests/university-workload.js","U8 package certification script missing");
assert(app.includes("ALA&&ALA.runCommand")&&notebook.includes("ALA&&ALA.runCommand"),"U5 router not wired into Calculate and Worksheet");
assert(app.includes("ALA.supportsOperation(op)")&&notebook.includes("ALA.supportsOperation(op)"),"U5 Matrix operation routing is incomplete");
assert(index.includes('data-matrix-op="schur"')&&index.includes('data-matrix-op="spectral"')&&index.includes('data-matrix-op="jordanv2"'),"U5 Matrix workspace controls are missing");
assert(sw.includes('"./advanced-linear-algebra.js"'),"U5 runtime missing from service-worker asset shell");
const u5Docs=read("docs/math/ADVANCED_LINEAR_ALGEBRA_SEMANTICS.md");
assert(u5Docs.toLowerCase().includes("jordan chains")&&u5Docs.toLowerCase().includes("real schur decomposition")&&u5Docs.includes("does **not** implement"),"U5 certification boundary is undocumented");
assert(app.includes("OPT&&OPT.runCommand")&&notebook.includes("OPT&&OPT.runCommand"),"U4 router not wired into Calculate and Worksheet");
const u4Docs=read("docs/math/OPTIMIZATION_SEMANTICS.md");
assert(u4Docs.toLowerCase().includes("primal–dual certificate")&&u4Docs.includes("does **not** implement"),"U4 certification boundary is undocumented");
assert(app.includes("ODE&&ODE.runCommand")&&notebook.includes("ODE&&ODE.runCommand"),"U3 router not wired into Calculate and Worksheet");
const u3Docs=read("docs/math/ODE_DYNAMICAL_SYSTEMS_SEMANTICS.md");
assert(u3Docs.includes("ODE_CONVERGENCE")&&u3Docs.includes("does **not** implement"),"U3 certification boundary is undocumented");
assert(app.includes("MV&&MV.runCommand")&&notebook.includes("MV&&MV.runCommand"),"U2 router not wired into Calculate and Worksheet");
const u2Docs=read("docs/math/MULTIVARIABLE_VECTOR_SEMANTICS.md");
assert(u2Docs.includes("fail explicitly on recursion-budget exhaustion")&&u2Docs.includes("does **not** implement"),"U2 certification boundary is undocumented");
assert(app.includes("CAS&&CAS.runCommand")&&notebook.includes("CAS&&CAS.runCommand"),"CAS router not wired into Calculate and Worksheet");
const casDocs=read("docs/math/ADVANCED_CAS_SEMANTICS.md");
assert(casDocs.includes("verified before exposure")&&casDocs.includes("does **not** implement"),"U1 CAS certification boundary is undocumented");
assert(app.includes("state.persistedRevisions.worksheets.set(rec.id,rec.revision||0)"),"Recovered notebook writes must register persisted revision");
const badSelectorCollections=app.split("\n").filter(line=>(/(^|[^$])\$\([^;]*\)\.(?:forEach|map|filter|some|every|reduce|find|findIndex)\b/).test(line));
assert(badSelectorCollections.length===0,"Single-element $() selector used with collection operation: "+badSelectorCollections.join(" | "));
assert(sw.includes('const APP_VERSION="'+release.version+'";'),"service-worker app version mismatch");
assert(sw.includes('const CACHE="calc-shell-v"+APP_VERSION;'),"service-worker cache is not version-derived");
assert(release.pwa&&release.pwa.cache==="calc-shell-v"+release.version,"release manifest PWA cache mismatch");

const assetMatch=sw.match(/const ASSETS=\[(.*?)\];/s);
assert(assetMatch,"Service worker asset manifest missing");
const assets=Array.from(assetMatch[1].matchAll(/"\.\/([^"]+)"/g),m=>m[1]).filter(Boolean);
assets.forEach(asset=>assert(exists(asset),"Service worker references missing asset: "+asset));

assert(!/<script[^>]+src=["']https?:\/\//i.test(index),"External runtime scripts are forbidden in RC shell");
assert(!/<link[^>]+href=["']https?:\/\//i.test(index),"External runtime styles/resources are forbidden in RC shell");
assert(!styles.includes("\\n"),"Literal escaped newline found in production stylesheet");
assert(app.includes("file.size>NB.MAX_IMPORT_BYTES"),"Notebook file-size guard must run before file.text()");
assert(app.includes("file.size>CT.MAX_JSON_BYTES"),"Custom Tool file-size guard must run before file.text()");
assert(manifest.start_url==="./"&&manifest.scope==="./","PWA start_url/scope must remain repository-relative");
assert(manifest.display==="standalone","PWA must remain standalone");
assert(index.includes("maximum-scale=1")&&index.includes("user-scalable=no"),"Installed PWA zoom lock regressed");

assert(ciWorkflow.includes("node --check cas.js")&&ciWorkflow.includes("node --check tests/cas.js")&&ciWorkflow.includes("node tests/cas.js"),"Primary CI does not certify U1 CAS");
assert(ciWorkflow.includes("node --check multivariable.js")&&ciWorkflow.includes("node --check tests/multivariable.js")&&ciWorkflow.includes("node tests/multivariable.js"),"Primary CI does not certify U2 multivariable mathematics");
assert(ciWorkflow.includes("node --check ode.js")&&ciWorkflow.includes("node --check tests/ode.js")&&ciWorkflow.includes("node tests/ode.js"),"Primary CI does not certify U3 differential equations");
assert(ciWorkflow.includes("node --check optimization.js")&&ciWorkflow.includes("node --check tests/optimization.js")&&ciWorkflow.includes("node tests/optimization.js"),"Primary CI does not certify U4 optimization");
assert(ciWorkflow.includes("node --check advanced-linear-algebra.js")&&ciWorkflow.includes("node --check tests/advanced-linear-algebra.js")&&ciWorkflow.includes("node tests/advanced-linear-algebra.js"),"Primary CI does not certify U5 advanced linear algebra");
assert(ciWorkflow.includes("node --check numerical-mathematics.js")&&ciWorkflow.includes("node --check tests/numerical-mathematics.js")&&ciWorkflow.includes("node tests/numerical-mathematics.js"),"Primary CI does not certify U6 numerical mathematics");
assert(ciWorkflow.includes("node --check discrete-mathematics.js")&&ciWorkflow.includes("node --check tests/discrete-mathematics.js")&&ciWorkflow.includes("node tests/discrete-mathematics.js"),"Primary CI does not certify U7 discrete mathematics");
assert(ciWorkflow.includes("node --check tests/university-workload.js")&&ciWorkflow.includes("node tests/university-workload.js"),"Primary CI does not certify U8 university workload");
assert(releaseWorkflow.includes("node --check multivariable.js")&&releaseWorkflow.includes("node tests/multivariable.js"),"Release soak does not certify U2 multivariable mathematics");
assert(releaseWorkflow.includes("node --check ode.js")&&releaseWorkflow.includes("node tests/ode.js"),"Release soak does not certify U3 differential equations");
assert(releaseWorkflow.includes("node --check optimization.js")&&releaseWorkflow.includes("node tests/optimization.js"),"Release soak does not certify U4 optimization");
assert(releaseWorkflow.includes("node --check advanced-linear-algebra.js")&&releaseWorkflow.includes("node tests/advanced-linear-algebra.js"),"Release soak does not certify U5 advanced linear algebra");
assert(releaseWorkflow.includes("node --check numerical-mathematics.js")&&releaseWorkflow.includes("node tests/numerical-mathematics.js"),"Release soak does not certify U6 numerical mathematics");
assert(releaseWorkflow.includes("node --check discrete-mathematics.js")&&releaseWorkflow.includes("node tests/discrete-mathematics.js"),"Release soak does not certify U7 discrete mathematics");
assert(releaseWorkflow.includes("node --check tests/university-workload.js")&&releaseWorkflow.includes("node tests/university-workload.js")&&releaseWorkflow.includes("tests/university-workload.spec.js"),"Release soak does not certify U8 university workload");
assert(releaseWorkflow.includes("Calc Release Soak"),"Release soak workflow name missing");
["chromium","firefox","webkit","mobile-chromium"].forEach(name=>assert(releaseWorkflow.includes(name),"Browser/device matrix missing "+name));
assert(releaseWorkflow.includes("tests/release-gate.js")&&releaseWorkflow.includes("release-soak.spec.js"),"RC gate stages missing");
assert(pagesWorkflow.includes('workflows: ["Calc Release Soak"]'),"Pages must deploy only after release-soak completion");
assert(!/push:\s*\n\s*branches:/m.test(pagesWorkflow),"Pages workflow must not bypass RC gate on direct push");
assert(pagesWorkflow.includes("workflow_run.conclusion == 'success'"),"Pages deployment lacks successful-soak condition");

[
  "v4 → v5","large notebook","Trash isolation","offline","interrupted","performance"
].forEach(term=>assert(phase.includes(term),"Phase 13 release document missing criterion: "+term));
[
  "v4 → v5 migration","large notebook persistence","Trash survives notebook-only restore",
  "interrupted transaction","offline PWA reload","performance envelope"
].forEach(term=>assert(soak.includes(term),"Browser soak missing scenario: "+term));

const budgets={
  "app.js":200*1024,
  "cas.js":80*1024,
  "multivariable.js":120*1024,
  "ode.js":120*1024,
  "optimization.js":120*1024,
  "advanced-linear-algebra.js":140*1024,
  "numerical-mathematics.js":170*1024,
  "discrete-mathematics.js":170*1024,
  "persistence.js":110*1024,
  "styles.css":110*1024,
  "index.html":90*1024
};
for(const [file,max] of Object.entries(budgets)){
  const size=fs.statSync(path.join(root,file)).size;
  assert(size<=max,file+" exceeds RC size budget: "+size+" > "+max);
}

console.log("Release candidate static gate passed");
