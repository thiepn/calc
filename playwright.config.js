"use strict";
const {defineConfig,devices}=require("@playwright/test");

module.exports=defineConfig({
  testDir:"./tests",
  testMatch:["release-soak.spec.js","bug-sweep.spec.js"],
  timeout:90000,
  expect:{timeout:12000},
  fullyParallel:false,
  workers:1,
  retries:1,
  reporter:[["line"]],
  use:{
    baseURL:"http://127.0.0.1:4173",
    serviceWorkers:"allow",
    trace:"retain-on-failure",
    screenshot:"only-on-failure"
  },
  webServer:{
    command:"python3 -m http.server 4173 --bind 127.0.0.1",
    url:"http://127.0.0.1:4173/index.html",
    reuseExistingServer:false,
    timeout:20000
  },
  projects:[
    {name:"chromium",use:{...devices["Desktop Chrome"]}},
    {name:"firefox",use:{...devices["Desktop Firefox"]}},
    {name:"webkit",use:{...devices["Desktop Safari"]}},
    {name:"mobile-chromium",use:{...devices["Pixel 7"],browserName:"chromium"}}
  ]
});
