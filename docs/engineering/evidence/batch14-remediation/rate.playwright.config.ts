import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'rate.spec.ts',workers:1,timeout:120000,globalSetup:'./rate-setup.ts',outputDir:'./rate-artifacts',use:{baseURL:'http://127.0.0.1:3100',launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE??'/usr/bin/chromium'}},reporter:[['list'],['json',{outputFile:'rate-browser.json'}]]});
