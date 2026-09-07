import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/e2e',fullyParallel:false,workers:1,timeout:30000,
  use:{baseURL:'http://127.0.0.1:3101',browserName:'chromium',viewport:{width:1440,height:1100},screenshot:'only-on-failure'},
  webServer:{command:'node scripts/e2e-server.mjs',url:'http://127.0.0.1:3101/api/health',reuseExistingServer:false,timeout:30000},
});
