"use strict";
const fs=require("fs");
const path=require("path");

function assert(condition,message){if(!condition)throw new Error(message);}
const root=path.join(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const exists=p=>fs.existsSync(path.join(root,p));

const required=[
  "index.html","styles.css","app.js","cas.js","multivariable.js","persistence.js","notebook.js","sw.js","manifest.webmanifest",
  "package.json","release.json","playwright.config.js","tests/cas.js","tests/multivariable.js","tests/release-soak.spec.js","docs/math/ADVANCED_CAS_SEMANTICS.md","docs/math/MULTIVARIABLE_VECTOR_SEMANTICS.md",
  ".github/workflows/ci.yml",".github/workflows/release-soak.yml",".github/workflows/pages.yml","docs/release/IMPLEMENTATION_PHASE_13.md"
];
required.forEach(p=>assert(exists(p),"Missing RC artifact: "+p));

const index=read("index.html"),styles=read("styles.css"),sw=read("sw.js"),persistence=read("persistence.js"),app=read("app.js"),notebook=read("notebook.js"),cas=read("cas.js"),multivariable=read("multivariable.js");
const pkg=JSON.parse(read("package.json")),manifest=JSON.parse(read("manifest.webmanifest")),release=JSON.parse(read("release.json"));
const ciWorkflow=read(".github/workflows/ci.yml"),releaseWorkflow=read(".github/workflows/release-soak.yml"),pagesWorkflow=read(".github/workflows/pages.yml");
const soak=read("tests/release-soak.spec.js"),phase=read("docs/release/IMPLEMENTATION_PHASE_13.md");

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
assert(releaseWorkflow.includes("node --check multivariable.js")&&releaseWorkflow.includes("node tests/multivariable.js"),"Release soak does not certify U2 multivariable mathematics");
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
  "persistence.js":110*1024,
  "styles.css":110*1024,
  "index.html":90*1024
};
for(const [file,max] of Object.entries(budgets)){
  const size=fs.statSync(path.join(root,file)).size;
  assert(size<=max,file+" exceeds RC size budget: "+size+" > "+max);
}

console.log("Release candidate static gate passed");
