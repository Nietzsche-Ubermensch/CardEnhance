#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const url = "http://127.0.0.1:8080/";
const out = "/workspace/screenshots";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(20000);

const result = {
  ok: false,
  upload: false,
  settings: {},
  previewVisible: false,
  playersFound: [],
  jobs: "",
  cropped: false,
  identified: false,
  twelve: false,
  error: null,
};

try {
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(800);
  await page.getByRole("heading", { name: "CardEnhance" }).waitFor();
  await page.getByRole("button", { name: /Enhance 12-card lot/ }).waitFor();
  result.upload = true;
  await page.screenshot({ path: `${out}/qa-upload-lot.png`, fullPage: true });

  await page.getByRole("tab", { name: "Settings" }).click();
  await page.getByText("Auto-crop card").waitFor({ timeout: 8000 });
  const bodySettings = await page.innerText("body");
  result.settings = {
    autoCrop: /Auto-crop card/i.test(bodySettings),
    ocr: /OCR identity/i.test(bodySettings),
    descratch: /Descratch/i.test(bodySettings),
    pool: /Worker pool/i.test(bodySettings),
  };
  await page.screenshot({ path: `${out}/qa-settings-enterprise.png`, fullPage: true });

  await page.getByRole("tab", { name: "Upload" }).click();
  await page.getByRole("button", { name: /Enhance 12-card lot/ }).click();

  const previewTab = page.getByRole("tab", { name: "Preview" });
  await previewTab.waitFor({ timeout: 120000 });
  result.previewVisible = true;
  await previewTab.click();
  await page.waitForTimeout(800);
  const previewText = await page.innerText("body");
  const players = [
    "Darby",
    "Mina",
    "Athena",
    "Jamie",
    "Hayter",
    "Toni",
    "Bret",
    "Chelsea",
    "Kofi",
    "Lola",
    "Willow",
    "Harley",
  ];
  result.playersFound = players.filter((p) => previewText.includes(p));
  result.cropped = /Cropped/i.test(previewText);
  await page.screenshot({ path: `${out}/qa-preview-identity.png`, fullPage: true });

  await page.getByRole("tab", { name: "Jobs" }).click();
  await page.waitForTimeout(400);
  const jobsText = await page.innerText("body");
  result.jobs = jobsText.replace(/\s+/g, " ").slice(0, 800);
  result.identified = /identified/i.test(jobsText);
  result.cropped = result.cropped || /cropped/i.test(jobsText);
  result.twelve = /12\/12/.test(jobsText);
  await page.screenshot({ path: `${out}/qa-jobs-lot.png`, fullPage: true });

  result.ok =
    result.upload &&
    result.settings.autoCrop &&
    result.settings.ocr &&
    result.settings.descratch &&
    result.settings.pool &&
    result.previewVisible &&
    result.twelve &&
    result.identified &&
    result.playersFound.includes("Darby");
} catch (err) {
  result.error = err instanceof Error ? err.message : String(err);
  try {
    await page.screenshot({ path: `${out}/qa-enterprise-error.png`, fullPage: true });
    result.jobs = (await page.innerText("body")).replace(/\s+/g, " ").slice(0, 800);
  } catch {
    /* ignore */
  }
} finally {
  writeFileSync(`${out}/qa-enterprise.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}

process.exit(result.ok ? 0 : 1);
