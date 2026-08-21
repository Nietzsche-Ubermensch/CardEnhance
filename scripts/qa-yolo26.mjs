#!/usr/bin/env node
import { copyFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";

mkdirSync("/workspace/screenshots", { recursive: true });
copyFileSync("/workspace/attachments/Year-Manfucturer-Card-0198.jpg", "/tmp/unknown-foil-front.jpg");
copyFileSync("/workspace/attachments/Year-Manfucturer-Card-0201.jpg", "/tmp/unknown-any-card.jpg");

const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const logs = [];
page.on("console", (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on("pageerror", (err) => logs.push(`[pageerror] ${err.message}`));

const yolo26 = await page.request.get("http://127.0.0.1:8080/models/yolo26n.onnx");
const det = await page.request.get("http://127.0.0.1:8080/ocr/ppocrv5_det.onnx");
const modelOk = yolo26.ok() && det.ok();
const yoloBytes = Number(yolo26.headers()["content-length"] ?? 0);
const detBytes = Number(det.headers()["content-length"] ?? 0);

await page.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle", timeout: 30000 });
await page.getByRole("tab", { name: "Settings" }).click();
const settingsText = await page.innerText("body");
await page.getByRole("tab", { name: "Upload" }).click();
const uploadText = await page.innerText("body");
await page.getByRole("button", { name: "Choose files" }).click();
await page.locator('input[type="file"]').setInputFiles([
  "/tmp/unknown-foil-front.jpg",
  "/tmp/unknown-any-card.jpg",
  "/workspace/public/samples/mesh/chelsea-green-table.jpg",
]);
await page.getByRole("button", { name: /Enhance 3 files/ }).click();
const previewTab = page.getByRole("tab", { name: "Preview" });
await previewTab.waitFor({ timeout: 240000 });
await previewTab.click();
await page.waitForTimeout(800);

const labels = [];
const chips = [];
const thumbs = page.locator("button.h-16.w-12");
const n = await thumbs.count();
for (let i = 0; i < n; i++) {
  await thumbs.nth(i).click();
  await page.waitForTimeout(300);
  labels.push(((await page.locator("h2.font-display + p").textContent()) ?? "").trim());
  chips.push(((await page.locator(".flex.flex-wrap.items-center.gap-1\\.5").first().innerText()) ?? "").replace(/\s+/g, " "));
}

if (n > 0) await thumbs.nth(0).click();
await page.screenshot({ path: "/workspace/screenshots/qa-yolo26-ocr.png", fullPage: true });
await page.getByRole("tab", { name: "Jobs" }).click();
const jobs = (await page.innerText("body")).replace(/\s+/g, " ");

const out = {
  modelOk,
  yoloBytes,
  detBytes,
  settingsYolo26: /YOLO26/i.test(settingsText),
  uploadYolo26: /YOLO26/i.test(uploadText),
  thumbCount: n,
  labels,
  chips,
  jobs: jobs.slice(0, 800),
  darby: labels.some((l) => /Darby/i.test(l)),
  notMuska: !labels.some((l) => /Muska/i.test(l)),
  mina: labels.some((l) => /Mina/i.test(l)),
  chelsea: labels.some((l) => /Chelsea/i.test(l)),
  yoloCrop: chips.some((c) => /YOLO26 crop/i.test(c)),
  visionOrOcr: chips.some((c) => /Vision OCR|OCR/i.test(c)),
  complete: /3\/3/.test(jobs) && /100%/.test(jobs),
  logs: logs.filter((l) => !/Download the React DevTools|vite|css|Image too small|Line cannot/.test(l)).slice(0, 30),
};
console.log(JSON.stringify(out, null, 2));
await browser.close();
const pass = out.modelOk && out.darby && out.notMuska && out.mina && out.complete && out.settingsYolo26;
process.exit(pass ? 0 : 1);
