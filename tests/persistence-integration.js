"use strict";
const fs=require("fs");
const path=require("path");

function assert(c,m){if(!c)throw new Error(m||"Assertion failed");}
function indexOfOrFail(haystack,needle,label){const i=haystack.indexOf(needle);if(i<0)throw new Error((label||needle)+" missing");return i;}

const root=path.join(__dirname,"..");
const app=fs.readFileSync(path.join(root,"app.js"),"utf8");
const index=fs.readFileSync(path.join(root,"index.html"),"utf8");
const sw=fs.readFileSync(path.join(root,"sw.js"),"utf8");
const persistence=fs.readFileSync(path.join(root,"persistence.js"),"utf8");

const pIndex=indexOfOrFail(index,'<script src="./persistence.js"></script>',"persistence script");
const appIndex=indexOfOrFail(index,'<script src="./app.js"></script>',"app script");
assert(pIndex<appIndex,"persistence runtime loads before app.js");
assert(index.includes('id="view-settings"'),"Data & Backup workspace exists");
assert(index.includes('id="fullBackupBtn"')&&index.includes('id="applyRestoreBtn"'),"backup/restore UI exists");
assert(index.includes('id="backupPassword"')&&index.includes('id="restorePassword"')&&index.includes('id="shareBackupBtn"'),"encrypted/share backup UI exists");
assert(index.includes('id="updateBtn"')&&index.includes('id="applyUpdateBtn"'),"controlled update UI exists");

assert(app.includes("const P=window.CalcPersistence;"),"app binds persistence runtime");
assert(app.includes("new P.CalcDatabase()"),"app uses CalcDatabase");
assert(!app.includes('indexedDB.open("calc-db"'),"app no longer owns IndexedDB schema/version");
assert(app.includes('$$("[data-view-panel]").forEach'),"workspace panels use multi selector");
assert(app.includes('$$("[data-quick]").forEach'),"quick tools use multi selector");
assert(app.includes("P.buildBackup"),"full backup wired");
assert(app.includes("P.planRestore"),"restore planning wired");
assert(app.includes("P.applyRestore"),"atomic restore wired");
assert(app.includes("dbPutVersioned")&&app.includes("putVersioned"),"optimistic versioned writes wired");
assert(app.includes("P.encryptBackup")&&app.includes("P.openBackup"),"encrypted backup workflow wired");
assert(app.includes("P.integrityReport"),"integrity UI wired");
assert(app.includes("P.CrossTabCoordinator")||app.includes("new P.CrossTabCoordinator"),"cross-tab coordinator wired");
assert(app.includes("registerServiceWorker"),"controlled service worker registration exists");
assert(!app.includes('navigator.serviceWorker.register("./sw.js").catch'),"legacy unconditional registration removed");

assert(sw.includes('"./persistence.js"'),"persistence runtime cached offline");
assert(sw.includes('message.type==="SKIP_WAITING"'),"service worker skip-waiting handshake");
assert(sw.includes('message.type==="GET_VERSION"'),"service worker version handshake");
assert(sw.includes('type:"SW_ACTIVATED"'),"service worker activation notification");

assert(persistence.includes("const DB_VERSION=3;"),"database schema v3");
assert(persistence.includes('const BACKUP_SCHEMA="calc.backup/v1";'),"backup schema present");
assert(persistence.includes('const ENCRYPTED_BACKUP_SCHEMA="calc.backup.encrypted/v1";'),"encrypted backup schema present");
assert(persistence.includes('const SYNC_SCHEMA="calc.sync/v1";'),"sync schema present");
assert(persistence.includes("class CrossTabCoordinator"),"cross-tab architecture present");
assert(persistence.includes("class SyncManager"),"sync manager boundary present");

console.log("Persistence browser integration certification tests passed");
