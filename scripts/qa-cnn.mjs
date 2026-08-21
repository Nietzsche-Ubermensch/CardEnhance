#!/usr/bin/env node
import { copyFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";

mkdirSync("/workspace/screenshots", { recursive: true });
copyFileSync("/workspace/attachments/Year-Manfucturer-Card-0198.jpg", "/tmp/unknown-foil-front.jpg");

const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const logs = [];
page.on("console", (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on("pageerror", (err) => logs.push(`[pageerror] ${err.message}`));

const model = await page.request.get("http://127.0.0.1:8080/models/realesr-general-x4v3.onnx");
await page.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle", timeout: 30000 });
await page.getByRole("tab", { name: "Settings" }).click();
const settingsText = await page.innerText("body");
await page.getByRole("tab", { name: "Upload" }).click();
await page.getByRole("button", { name: "Choose files" }).click();
await page.locator('input[type="file"]').setInputFiles(["/tmp/unknown-foil-front.jpg"]);
await page.getByRole("button", { name: /Enhance 1 file/ }).click();
const previewTab = page.getByRole("tab", { name: "Preview" });
await previewTab.waitFor({ timeout: 180000 });
await previewTab.click();
await page.waitForTimeout(600);
const chips = ((await page.locator(".flex.flex-wrap.items-center.gap-1\\.5").first().innerText()) ?? "").replace(/\s+/g, " ");
const label = ((await page.locator("h2.font-display + p").textContent()) ?? "").trim();
await page.screenshot({ path: "/workspace/screenshots/qa-cnn.png", fullPage: true });
await page.getByRole("tab", { name: "Jobs" }).click();
const jobs = (await page.innerText("body")).replace(/\s+/g, " ");
const out = {
  modelOk: model.ok(),
  modelBytes: Number(model.headers()["content-length"] ?? 0),
  settingsCnn: /CNN restore/i.test(settingsText),
  label,
  chips,
  darby: /Darby/i.test(label),
  realesrgan: /Real-ESRGAN/i.test(chips),
  complete: /1\/1/.test(jobs) && /100%/.test(jobs),
  jobs: jobs.slice(0, 500),
  logs: logs.filter((l) => !/Download the React DevTools|vite|css/.test(l)).slice(0, 20),
};
console.log(JSON.stringify(out, null, 2));
await browser.close();
process.exit(out.modelOk && out.settingsCnn && out.darby && out.realesrgan && out.complete ? 0 : 1);
