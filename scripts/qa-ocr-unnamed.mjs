#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

mkdirSync("/workspace/screenshots", { recursive: true });
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const logs = [];
page.on("console", (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on("pageerror", (err) => logs.push(`[pageerror] ${err.message}`));

await page.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle", timeout: 30000 });
await page.getByRole("button", { name: "Choose files" }).click();
const input = page.locator('input[type="file"]');
await input.setInputFiles([
  "/workspace/attachments/Year-Manfucturer-Card-0201.jpg",
  "/workspace/attachments/Year-Manfucturer-Card-0198.jpg",
]);
await page.getByRole("button", { name: /Enhance 2 files/ }).click();
const previewTab = page.getByRole("tab", { name: "Preview" });
await previewTab.waitFor({ timeout: 90000 });
await previewTab.click();
await page.waitForTimeout(800);
const preview = await page.innerText("body");
await page.screenshot({ path: "/workspace/screenshots/qa-ocr-unnamed.png", fullPage: true });
await page.getByRole("tab", { name: "Jobs" }).click();
const jobs = (await page.innerText("body")).replace(/\s+/g, " ").slice(0, 600);
const out = {
  preview: preview.replace(/\s+/g, " ").slice(0, 900),
  jobs,
  mina: /Mina/i.test(preview),
  darby: /Darby/i.test(preview),
  year2026: /2026/.test(preview),
  upperDeck: /Upper Deck/i.test(preview),
  logs: logs.filter((l) => !/Download the React DevTools|vite/.test(l)).slice(0, 20),
};
console.log(JSON.stringify(out, null, 2));
await browser.close();
process.exit(out.mina || out.darby || out.year2026 ? 0 : 1);
