"use strict";
const fs=require("fs");
const path=require("path");

function assert(condition,message){if(!condition)throw new Error(message);}
const root=path.join(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const exists=p=>fs.existsSync(path.join(root,p));

const required=[
  "index.html","styles.css","app.js","persistence.js","notebook.js","sw.js","manifest.webmanifest",
  "package.json","playwright.config.js","tests/release-soak.spec.js",
  ".github/workflows/release-soak.yml",".github/workflows/pages.yml","docs/release/IMPLEMENTATION_PHASE_13.md"
];
required.forEach(p=>assert(exists(p),"Missing RC artifact: "+p));

const index=read("index.html"),sw=read("sw.js"),persistence=read("persistence.js"),app=read("app.js");
const pkg=JSON.parse(read("package.json")),manifest=JSON.parse(read("manifest.webmanifest"));
const releaseWorkflow=read(".github/workflows/release-soak.yml"),pagesWorkflow=read(".github/workflows/pages.yml");
const soak=read("tests/release-soak.spec.js"),phase=read("docs/release/IMPLEMENTATION_PHASE_13.md");

assert(pkg.private===true,"Release tooling package must remain private");
assert(pkg.devDependencies&&pkg.devDependencies["@playwright/test"]==="1.63.0","Playwright must be pinned for deterministic RC runs");
assert(persistence.includes("const DB_VERSION=5;"),"RC requires database schema v5");
assert(persistence.includes("saveNotebookIncremental")&&persistence.includes("chunkNamespace"),"Chunk-aware incremental notebook persistence missing");
assert(persistence.includes("buildBackupBlobFromDb"),"Chunked backup builder missing");
assert(persistence.includes("restoreTombstone")&&persistence.includes("trashChunkRefs"),"Trash recovery engine missing");
assert(app.includes("P.updatePreflight")&&app.includes("P.resilienceDiagnostics"),"Persistence preflight/diagnostics not wired");
assert(sw.includes('const CACHE="calc-shell-v22-rc1";'),"RC service-worker shell version mismatch");

const assetMatch=sw.match(/const ASSETS=\[(.*?)\];/s);
assert(assetMatch,"Service worker asset manifest missing");
const assets=Array.from(assetMatch[1].matchAll(/"\.\/([^"]+)"/g),m=>m[1]).filter(Boolean);
assets.forEach(asset=>assert(exists(asset),"Service worker references missing asset: "+asset));

assert(!/<script[^>]+src=["']https?:\/\//i.test(index),"External runtime scripts are forbidden in RC shell");
assert(!/<link[^>]+href=["']https?:\/\//i.test(index),"External runtime styles/resources are forbidden in RC shell");
assert(manifest.start_url==="./"&&manifest.scope==="./","PWA start_url/scope must remain repository-relative");
assert(manifest.display==="standalone","PWA must remain standalone");
assert(index.includes("maximum-scale=1")&&index.includes("user-scalable=no"),"Installed PWA zoom lock regressed");

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
  "persistence.js":110*1024,
  "styles.css":110*1024,
  "index.html":90*1024
};
for(const [file,max] of Object.entries(budgets)){
  const size=fs.statSync(path.join(root,file)).size;
  assert(size<=max,file+" exceeds RC size budget: "+size+" > "+max);
}

console.log("Release candidate static gate passed");
