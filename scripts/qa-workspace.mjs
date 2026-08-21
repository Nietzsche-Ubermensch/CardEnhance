#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import JSZip from "jszip";

mkdirSync("/workspace/screenshots", { recursive: true });
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
page.setDefaultTimeout(180000);
const logs = [];
page.on("pageerror", (err) => logs.push(err.message));

await page.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle", timeout: 30000 });
const empty = await page.getByText("Drop card images or scanner sheets").isVisible();
await page.getByRole("button", { name: "Load sample scans" }).click();
await page.getByText("4 sources · 4 cards · 4 ready").waitFor({ timeout: 120000 });
await page.getByText("Darby Allin").first().waitFor();
await page.screenshot({ path: "/workspace/screenshots/qa-workspace-grid.png", fullPage: true });

await page.getByRole("button", { name: "Upscale", exact: true }).click();
await page.getByText(/Real-ESRGAN super-resolution|interpolation/i).waitFor({ timeout: 120000 });
await page.screenshot({ path: "/workspace/screenshots/qa-workspace-upscale.png", fullPage: true });

await page.getByRole("button", { name: "Descratch", exact: true }).first().click();
await page.waitForTimeout(1200);

await page.locator("select").nth(0).selectOption("upscaled");
const [download] = await Promise.all([
  page.waitForEvent("download", { timeout: 60000 }),
  page.getByRole("button", { name: "ZIP" }).click(),
]);
const filePath = await download.path();
const zipBytes = filePath ? readFileSync(filePath) : null;
let zipOk = false;
let manifest = null;
let imageCount = 0;
if (zipBytes) {
  const zip = await JSZip.loadAsync(zipBytes);
  const names = Object.keys(zip.files);
  imageCount = names.filter((n) => n.startsWith("images/") && !zip.files[n].dir).length;
  const man = zip.file("manifest.json");
  if (man) {
    manifest = JSON.parse(await man.async("string"));
    zipOk = imageCount > 0 && Array.isArray(manifest.cards) && manifest.cards.length > 0;
  }
}

const body = (await page.innerText("body")).replace(/\s+/g, " ");
const out = {
  empty,
  sources: /4 sources · 4 cards/.test(body),
  identities: /Darby Allin/.test(body) && /Mina Shirakawa/.test(body) && /Chelsea Green/.test(body),
  upscale: /Real-ESRGAN super-resolution/i.test(body),
  workspace: /Source 1 · Card 1/.test(body),
  zipOk,
  imageCount,
  manifestCount: manifest?.cards?.length ?? 0,
  usedRealSr: manifest?.cards?.[0]?.used_real_sr ?? null,
  artifact: manifest?.cards?.[0]?.artifact_type ?? null,
  logs: logs.slice(0, 8),
};
writeFileSync("/tmp/qa-workspace.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
process.exit(out.empty && out.sources && out.identities && out.upscale && out.zipOk ? 0 : 1);
