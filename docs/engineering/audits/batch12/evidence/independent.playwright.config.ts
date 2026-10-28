import {defineConfig} from '@playwright/test';
import {fileURLToPath} from 'node:url';
export default defineConfig({testDir:'.',testMatch:'independent-browser.spec.ts',workers:1,timeout:120000,globalSetup:fileURLToPath(new URL('../../../../../tests/e2e/setup.ts',import.meta.url)),use:{baseURL:'http://127.0.0.1:3100',trace:'retain-on-failure',launchOptions:{executablePath:'/usr/bin/chromium'}},outputDir:fileURLToPath(new URL('./browser-artifacts',import.meta.url)),reporter:[['list'],['json',{outputFile:fileURLToPath(new URL('./independent-browser.json',import.meta.url))}]]});
