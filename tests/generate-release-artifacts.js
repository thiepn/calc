"use strict";
const fs=require("fs");
const path=require("path");
const crypto=require("crypto");

const root=path.join(__dirname,"..");
const release=JSON.parse(fs.readFileSync(path.join(root,"release.json"),"utf8"));
const sw=fs.readFileSync(path.join(root,"sw.js"),"utf8");
const match=sw.match(/const ASSETS=\[(.*?)\];/s);
if(!match)throw new Error("Service-worker asset manifest missing");
const runtimeAssets=Array.from(match[1].matchAll(/"\.\/([^"]+)"/g),m=>m[1]).filter(Boolean);
const files=Array.from(new Set(runtimeAssets.concat([
  "release.json","VERSION","CHANGELOG.md","RELEASE_NOTES.md"
]))).sort();

const outputDir=path.join(root,"release-artifacts");
fs.mkdirSync(outputDir,{recursive:true});
const lines=[];
const entries={};
for(const rel of files){
  const full=path.join(root,rel);
  if(!fs.existsSync(full))throw new Error("Release file missing: "+rel);
  const bytes=fs.readFileSync(full),hash=crypto.createHash("sha256").update(bytes).digest("hex");
  entries[rel]={sha256:hash,bytes:bytes.length};
  lines.push(hash+"  "+rel);
}
const certifiedSha=process.env.CERTIFIED_SHA||process.env.GITHUB_SHA||"unknown";
const generated={
  schema:"calc.release.artifact/v1",
  name:release.name,
  version:release.version,
  tag:release.tag,
  channel:release.channel,
  certifiedSha,
  generatedAt:new Date().toISOString(),
  files:entries
};
fs.writeFileSync(path.join(outputDir,"calc-v1.0.0-checksums.txt"),lines.join("\n")+"\n");
fs.writeFileSync(path.join(outputDir,"calc-v1.0.0-manifest.json"),JSON.stringify(generated,null,2)+"\n");
console.log("Generated release artifacts for "+files.length+" files at "+certifiedSha);
