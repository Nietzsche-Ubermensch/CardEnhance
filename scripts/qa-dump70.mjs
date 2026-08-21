#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

mkdirSync("/workspace/screenshots", { recursive: true });
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.setDefaultTimeout(240000);
await page.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle", timeout: 30000 });
await page.getByRole("button", { name: /Enhance 70-card dump/i }).click();
const previewTab = page.getByRole("tab", { name: "Preview" });
await previewTab.waitFor({ timeout: 240000 });
await previewTab.click();
await page.waitForTimeout(400);
await page.getByRole("tab", { name: "Jobs" }).click();
const jobs = (await page.innerText("body")).replace(/\s+/g, " ");
await page.screenshot({ path: "/workspace/screenshots/qa-dump-70.png", fullPage: true });
const out = {
  jobs: jobs.slice(0, 700),
  complete70: /70\/70/.test(jobs),
  identified: /70 identified/.test(jobs),
  cropped: /cropped/.test(jobs),
};
console.log(JSON.stringify(out, null, 2));
await browser.close();
process.exit(out.complete70 && out.identified ? 0 : 1);
