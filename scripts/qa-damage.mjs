import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

mkdirSync("/workspace/screenshots", { recursive: true });
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const errors = [];

async function shot(name, viewport) {
  const page = await browser.newPage({ viewport });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForSelector('[data-testid="drive"]:not([disabled])', { timeout: 20000 });
  if (name === "title") {
    await page.screenshot({ path: `/workspace/screenshots/qa-damage-${viewport.width}.png` });
    const text = await page.evaluate(() => document.body.innerText);
    await page.close();
    return { text };
  }
  await page.click('[data-testid="drive"]');
  await page.waitForTimeout(400);
  await page.locator('[data-ready="true"]').click({ position: { x: Math.min(400, viewport.width/2), y: 300 } });
  await page.waitForFunction(() => window.__controlsTest?.getDamage != null, null, { timeout: 8000 });

  await page.evaluate(() => window.__controlsTest.setDamage(0.5));
  await page.waitForTimeout(200);
  const d50 = await page.evaluate(() => window.__controlsTest.getDamage());
  await page.screenshot({ path: "/workspace/screenshots/qa-damage-50.png" });

  await page.evaluate(() => window.__controlsTest.setDamage(0.75));
  await page.waitForTimeout(250);
  const heavy = await page.evaluate(() => document.body.innerText);
  await page.screenshot({ path: "/workspace/screenshots/qa-damage-75.png" });

  await page.evaluate(() => window.__controlsTest.setDamage(0.5));
  await page.waitForTimeout(80);
  const repaired = await page.evaluate(() => window.__controlsTest.getDamage());

  await page.evaluate(() => window.__controlsTest.setDamage(1));
  await page.waitForTimeout(180);
  const wreckingText = await page.evaluate(() => document.body.innerText);
  await page.screenshot({ path: "/workspace/screenshots/qa-damage-wreck.png" });

  await page.waitForTimeout(1400);
  const overText = await page.evaluate(() => document.body.innerText);
  await page.screenshot({ path: "/workspace/screenshots/qa-damage-over.png" });
  await page.close();
  return { d50, repaired, heavy, wreckingText, overText };
}

const title = await shot("title", { width: 1280, height: 800 });
const play = await shot("play", { width: 1280, height: 800 });
const mobile = await shot("title", { width: 390, height: 844 });

const result = {
  ok:
    play.d50 === 0.5 &&
    play.repaired === 0.5 &&
    play.heavy.includes("HEAVY DAMAGE") &&
    play.wreckingText.includes("TOTALED") &&
    play.overText.includes("Totaled") &&
    title.text.includes("Four hits") &&
    title.text.includes("spare tire") &&
    errors.length === 0,
  d50: play.d50,
  repaired: play.repaired,
  heavy: play.heavy.includes("HEAVY DAMAGE"),
  wrecking: play.wreckingText.includes("TOTALED"),
  over: play.overText.includes("Totaled"),
  titleHits: title.text.includes("Four hits"),
  mobileFits: mobile.text.includes("Drive"),
  errors,
};
console.log(JSON.stringify(result, null, 2));
await browser.close();
process.exit(result.ok ? 0 : 1);
