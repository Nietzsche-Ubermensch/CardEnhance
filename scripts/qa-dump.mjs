#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

mkdirSync("/workspace/screenshots", { recursive: true });
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const logs = [];
page.on("console", (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on("pageerror", (err) => logs.push(`[pageerror] ${err.message}`));

await page.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle", timeout: 30000 });
const dumpButton = await page.getByRole("button", { name: /70-card dump/i }).count();
await page.getByRole("button", { name: "Choose files" }).click();
await page.locator('input[type="file"]').setInputFiles([
  "/workspace/attachments/Year-Manfucturer-Card-0198.jpg",
  "/workspace/attachments/Year-Manfucturer-Card-0201.jpg",
  "/workspace/attachments/Year-Manfucturer-Card-0213.jpg",
  "/workspace/attachments/Year-Manfucturer-Card-0233.jpg",
]);
await page.getByRole("button", { name: /Enhance 4 files/ }).click();
const previewTab = page.getByRole("tab", { name: "Preview" });
await previewTab.waitFor({ timeout: 180000 });
await previewTab.click();
await page.waitForTimeout(500);

const thumbs = page.locator("button.h-16.w-12");
const n = await thumbs.count();
const labels = [];
for (let i = 0; i < n; i++) {
  await thumbs.nth(i).click();
  await page.waitForTimeout(200);
  const heading = page.locator("h2:text-is('Preview')").locator("xpath=following-sibling::p");
  const label = ((await heading.textContent()) ?? "").trim();
  labels.push(label);
}
await page.screenshot({ path: "/workspace/screenshots/qa-dump-preview.png", fullPage: true });
await page.getByRole("tab", { name: "Jobs" }).click();
const jobs = (await page.innerText("body")).replace(/\s+/g, " ").slice(0, 800);
const blob = labels.join(" | ");
const out = {
  dumpButton,
  thumbCount: n,
  labels,
  jobs,
  darby: /Darby Allin/i.test(blob),
  mina: /Mina Shirakawa/i.test(blob),
  chelsea: /Chelsea Green/i.test(blob),
  cope: /\bCope\b/i.test(blob),
  dazzlers: /Dazzlers/i.test(blob),
  festival: /Festival Fury/i.test(blob),
  deluxe: /Deluxe/i.test(blob),
  identified: /4 identified/i.test(jobs),
  complete: /4\/4/.test(jobs),
  cropped: /1 cropped/i.test(jobs),
  logs: logs.filter((l) => !/Download the React DevTools|vite|too small to scale/i.test(l)).slice(0, 15),
};
console.log(JSON.stringify(out, null, 2));
await browser.close();
const ok = out.darby && out.mina && out.chelsea && out.cope && out.complete && out.dumpButton > 0;
process.exit(ok ? 0 : 1);
