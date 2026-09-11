import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const samples = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  await page.goto("http://127.0.0.1:5186/");
  await page.getByRole("button", { name: "出发，去逛逛" }).click();
  await page.getByRole("button", { name: "小岛地图", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "导航至网球公园", exact: true })
    .click();
  const pressed = new Set();
  for (let i = 0; i < 130; i++) {
    const data = await page
      .locator("canvas")
      .evaluate((canvas) => ({ ...canvas.dataset }));
    samples.push(data);
    if (data.arrived === "true") break;
    const angle = Number(data.routeTurn);
    const speed = Number(data.forwardSpeed);
    const desiredSpeed = Math.abs(angle) > 0.45 ? 1.6 : 3.3;
    const keys = new Set();
    if (speed < desiredSpeed) keys.add("ArrowUp");
    if (angle > 0.12) keys.add("ArrowLeft");
    if (angle < -0.12) keys.add("ArrowRight");
    for (const key of pressed) if (!keys.has(key)) await page.keyboard.up(key);
    for (const key of keys)
      if (!pressed.has(key)) await page.keyboard.down(key);
    pressed.clear();
    keys.forEach((key) => pressed.add(key));
    await page.waitForTimeout(160);
  }
  for (const key of pressed) await page.keyboard.up(key);
  await page.screenshot({ path: "artifacts/driving/road-trial.png" });
  writeFileSync(
    "artifacts/driving/road-trial.json",
    JSON.stringify(samples, null, 2),
  );
  console.log(
    JSON.stringify({ steps: samples.length, last: samples.at(-1) }, null, 2),
  );
} finally {
  await browser.close();
}
