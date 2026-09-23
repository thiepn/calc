"use strict";
const fs=require("fs");
const path=require("path");

function assert(condition,message){if(!condition)throw new Error(message);}
const root=path.join(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const exists=p=>fs.existsSync(path.join(root,p));
const VERSION="1.0.0",TAG="v1.0.0",CACHE="calc-shell-v1.0.0";

[
  "VERSION","release.json","CHANGELOG.md","RELEASE_NOTES.md",
  "docs/release/IMPLEMENTATION_PHASE_14.md",
  ".github/workflows/production-release.yml"
].forEach(p=>assert(exists(p),"Missing production-release artifact: "+p));

const version=read("VERSION").trim();
const pkg=JSON.parse(read("package.json"));
const release=JSON.parse(read("release.json"));
const manifest=JSON.parse(read("manifest.webmanifest"));
const app=read("app.js"),persistence=read("persistence.js"),sw=read("sw.js");
const changelog=read("CHANGELOG.md"),notes=read("RELEASE_NOTES.md"),phase=read("docs/release/IMPLEMENTATION_PHASE_14.md");
const soakWorkflow=read(".github/workflows/release-soak.yml");
const soakTests=read("tests/release-soak.spec.js");
const pagesWorkflow=read(".github/workflows/pages.yml");
const productionWorkflow=read(".github/workflows/production-release.yml");

assert(version===VERSION,"VERSION file drifted");
assert(pkg.version===VERSION,"package.json version drifted");
assert(release.version===VERSION&&release.tag===TAG,"release.json version/tag drifted");
assert(release.channel==="stable"&&release.status==="production","release.json is not stable production");
assert(release.releaseDate==="2026-09-23","release date drifted");
assert(release.database&&release.database.version===5,"release DB schema must be v5");
assert(release.pwa&&release.pwa.cache===CACHE,"release PWA cache drifted");
assert(manifest.version===VERSION,"web manifest version drifted");

assert(app.includes('const APP_VERSION="'+VERSION+'";'),"app runtime version missing");
assert(app.includes("window.CalcAppVersion=APP_VERSION"),"app version is not externally certifiable");
assert((app.match(/appVersion:APP_VERSION/g)||[]).length>=2,"backup paths do not consistently use production app version");
assert(!app.includes('appVersion:"phase-'),"legacy phase backup metadata remains");
assert(!/phase-12|phase-13|rc1/i.test(app),"RC/phase placeholder remains in app runtime");

assert(persistence.includes('VERSION:"1.2.0-persistence"'),"persistence runtime version is not stable");
assert(!/VERSION:"[^"]*(?:phase|rc)/i.test(persistence),"persistence runtime still has RC/phase suffix");
assert(persistence.includes("const DB_VERSION=5;"),"production DB schema is not v5");

assert(sw.includes('const APP_VERSION="'+VERSION+'";'),"service worker app version drifted");
assert(sw.includes('const CACHE="calc-shell-v"+APP_VERSION;'),"service-worker cache is not version-derived");
assert(!/rc1|v22/i.test(sw),"service worker still contains RC cache naming");

assert(changelog.includes("## [1.0.0] — 2026-09-23"),"changelog lacks v1.0.0 entry");
assert(notes.includes("# Calc v1.0.0"),"release notes lack v1.0.0 heading");
assert(phase.includes("immutable Calc v1.0.0 production baseline"),"Phase 14 freeze document missing production baseline");
assert(phase.includes("pre-upgrade v4 backup"),"Phase 14 backup-before-upgrade requirement missing");

assert(soakWorkflow.includes("tests/production-release-gate.js"),"production release gate is not part of release soak");
assert(soakWorkflow.includes('calc-release-soak-v14-${{ github.sha }}'),"Phase 14 soak must be SHA-scoped");
assert(soakWorkflow.includes("Reject stale push candidate")&&soakWorkflow.includes("git rev-parse origin/main"),"release soak stale-candidate guard missing");
assert(soakTests.includes("clean-device v1.0.0 install"),"clean-device production test missing");
assert(soakTests.includes("pre-upgrade v4 backup restores into production v1.0.0"),"backup-before-upgrade compatibility test missing");
assert(soakTests.includes('expect(version.version).toBe("calc-shell-v1.0.0")'),"production service-worker handshake test missing");
assert(pagesWorkflow.includes('workflows: ["Calc Release Soak"]'),"Pages is not gated by release soak");
assert(pagesWorkflow.includes("github.event.workflow_run.head_sha"),"Pages does not deploy exact certified SHA");
assert(pagesWorkflow.includes("Reject stale certified SHA")&&pagesWorkflow.includes("git rev-parse origin/main"),"Pages lacks explicit current-main stale-candidate check");

assert(productionWorkflow.includes('workflows: ["Deploy Calc to GitHub Pages"]'),"production release is not gated by Pages");
assert(productionWorkflow.includes("permissions:")&&productionWorkflow.includes("contents: write"),"production release lacks tag/release permission");
assert(productionWorkflow.includes("calc-certified-sha")&&productionWorkflow.includes("certified-sha.txt"),"production release lacks explicit deployed-SHA handoff");
assert(productionWorkflow.includes("github.event.workflow_run.id"),"production release does not bind SHA handoff to the Pages run");
assert(productionWorkflow.includes("git checkout --detach \"$CERTIFIED_SHA\""),"production release does not checkout the handed-off deployed SHA");
assert(productionWorkflow.includes("tests/production-release-gate.js"),"production release does not rerun final gate");
assert(productionWorkflow.includes('LIVE_BASE="https://thiepn.github.io/calc"')&&productionWorkflow.includes('$LIVE_BASE/release.json'),"production release lacks live deployment verification");
assert(productionWorkflow.includes('$LIVE_BASE/VERSION')&&productionWorkflow.includes('$LIVE_BASE/manifest.webmanifest'),"production release does not verify all live version metadata");
assert(productionWorkflow.includes("Reject mismatched pre-existing release tag"),"release tag collision preflight missing");
assert(productionWorkflow.includes('gh release create "$RELEASE_TAG"'),"GitHub release creation is not wired");
assert(productionWorkflow.includes("--target \"$CERTIFIED_SHA\""),"release tag is not pinned to deployed SHA");
assert(productionWorkflow.includes("release-artifacts/calc-v1.0.0-checksums.txt"),"release checksum attachment missing");

console.log("Calc v1.0.0 production release gate passed");
