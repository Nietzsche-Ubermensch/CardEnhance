#!/usr/bin/env node
import { copyFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";

mkdirSync("/workspace/screenshots", { recursive: true });
copyFileSync(
  "/workspace/attachments/Year-Manfucturer-Card-0201.jpg",
  "/tmp/unknown-any-card.jpg",
);

const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const logs = [];
page.on("console", (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on("pageerror", (err) => logs.push(`[pageerror] ${err.message}`));
page.on("response", (res) => {
  const url = res.url();
  if (/yolov8|ort-wasm|\.onnx/.test(url)) logs.push(`[http ${res.status()}] ${url.split("/").slice(-2).join("/")}`);
});

await page.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle", timeout: 30000 });
const dumpButton = await page.getByRole("button", { name: /70-card dump/i }).count();
const yoloCopy = (await page.innerText("body")).includes("YOLOv8");
await page.getByRole("tab", { name: "Settings" }).click();
const settingsText = await page.innerText("body");
await page.getByRole("tab", { name: "Upload" }).click();

await page.getByRole("button", { name: "Choose files" }).click();
await page.locator('input[type="file"]').setInputFiles([
  "/workspace/public/samples/mesh/chelsea-green-table.jpg",
  "/tmp/unknown-any-card.jpg",
]);
await page.getByRole("button", { name: /Enhance 2 files/ }).click();
const previewTab = page.getByRole("tab", { name: "Preview" });
await previewTab.waitFor({ timeout: 180000 });
await previewTab.click();
await page.waitForTimeout(600);

const labels = [];
const thumbs = page.locator("button.h-16.w-12");
const n = await thumbs.count();
for (let i = 0; i < n; i++) {
  await thumbs.nth(i).click();
  await page.waitForTimeout(200);
  const heading = page.locator("h2.font-display + p");
  labels.push(((await heading.textContent()) ?? "").trim());
}

if (n > 0) {
  await thumbs.nth(0).click();
  await page.waitForTimeout(250);
}
await page.screenshot({ path: "/workspace/screenshots/qa-yolo-ocr.png", fullPage: true });
const previewBody = await page.innerText("body");
await page.getByRole("tab", { name: "Jobs" }).click();
const jobs = (await page.innerText("body")).replace(/\s+/g, " ");

const out = {
  dumpButton,
  yoloCopy,
  settingsYolo: /YOLOv8/i.test(settingsText),
  settingsAnyCard: /OCR any card/i.test(settingsText),
  thumbCount: n,
  labels,
  jobs: jobs.slice(0, 700),
  mina: labels.some((l) => /Mina/i.test(l)),
  year2026: labels.some((l) => /2026/.test(l)),
  upperDeck: labels.some((l) => /Upper Deck/i.test(l)),
  chelsea: labels.some((l) => /Chelsea/i.test(l)),
  cropped: /cropped|YOLOv8 crop|Contour crop/i.test(jobs + labels.join(" ") + previewBody),
  yoloCrop: /YOLOv8 crop/i.test(previewBody),
  contourCrop: /Contour crop/i.test(previewBody),
  identified: /identified/i.test(jobs),
  complete: /2\/2/.test(jobs) && /100%/.test(jobs),
  logs: logs.filter((l) => !/Download the React DevTools|vite|css/.test(l)).slice(0, 30),
};
console.log(JSON.stringify(out, null, 2));
await browser.close();
const ok = out.mina && out.complete && out.settingsYolo;
process.exit(ok ? 0 : 1);
