#!/usr/bin/env node
import { copyFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";

mkdirSync("/workspace/screenshots", { recursive: true });
copyFileSync("/workspace/attachments/Year-Manfucturer-Card-0198.jpg", "/tmp/unknown-foil-front.jpg");
copyFileSync("/workspace/attachments/Year-Manfucturer-Card-0201.jpg", "/tmp/unknown-back-scan.jpg");

const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const logs = [];
page.on("console", (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on("pageerror", (err) => logs.push(`[pageerror] ${err.message}`));

await page.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle", timeout: 30000 });
await page.getByRole("tab", { name: "Settings" }).click();
const settingsText = await page.innerText("body");
await page.getByRole("tab", { name: "Upload" }).click();
await page.getByRole("button", { name: "Choose files" }).click();
await page.locator('input[type="file"]').setInputFiles([
  "/tmp/unknown-foil-front.jpg",
  "/tmp/unknown-back-scan.jpg",
]);
await page.getByRole("button", { name: /Enhance 2 files/ }).click();
const previewTab = page.getByRole("tab", { name: "Preview" });
await previewTab.waitFor({ timeout: 180000 });
await previewTab.click();
await page.waitForTimeout(800);

const labels = [];
const chips = [];
const thumbs = page.locator("button.h-16.w-12");
const n = await thumbs.count();
for (let i = 0; i < n; i++) {
  await thumbs.nth(i).click();
  await page.waitForTimeout(250);
  labels.push(((await page.locator("h2.font-display + p").textContent()) ?? "").trim());
  chips.push(((await page.locator(".flex.flex-wrap.items-center.gap-1\\.5").first().innerText()) ?? "").replace(/\s+/g, " "));
}

if (n > 0) await thumbs.nth(0).click();
await page.screenshot({ path: "/workspace/screenshots/qa-vision-ocr.png", fullPage: true });
await page.getByRole("tab", { name: "Jobs" }).click();
const jobs = (await page.innerText("body")).replace(/\s+/g, " ");

const out = {
  settingsVision: /Vision OCR/i.test(settingsText),
  thumbCount: n,
  labels,
  chips,
  jobs: jobs.slice(0, 700),
  darby: labels.some((l) => /Darby/i.test(l)),
  notMuska: !labels.some((l) => /Muska/i.test(l)),
  mina: labels.some((l) => /Mina/i.test(l)),
  visionBadge: chips.some((c) => /Vision OCR/i.test(c)),
  complete: /2\/2/.test(jobs) && /100%/.test(jobs),
  identified: /identified/i.test(jobs),
  logs: logs.filter((l) => !/Download the React DevTools|vite|css|Image too small|Line cannot/.test(l)).slice(0, 25),
};
console.log(JSON.stringify(out, null, 2));
await browser.close();
process.exit(out.darby && out.notMuska && out.complete ? 0 : 1);
