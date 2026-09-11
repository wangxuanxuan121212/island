import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const run = process.argv[2] || "before";
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl"],
});
const reports = {};
mkdirSync("artifacts/driving", { recursive: true });
try {
  for (const maneuver of ["straight", "left", "right", "reverse"]) {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
    });
    await page.goto("http://127.0.0.1:5186/");
    await page.getByRole("button", { name: "出发，去逛逛" }).click();
    await page.waitForTimeout(400);
    const samples = [];
    const sample = async (stage) => {
      samples.push({
        stage,
        time: Date.now(),
        ...(await page
          .locator("canvas")
          .evaluate((element) => ({ ...element.dataset }))),
      });
    };
    await sample("idle");
    await page.keyboard.down(maneuver === "reverse" ? "ArrowDown" : "ArrowUp");
    if (maneuver === "left") await page.keyboard.down("ArrowLeft");
    if (maneuver === "right") await page.keyboard.down("ArrowRight");
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(180);
      await sample("powered");
    }
    for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"])
      await page.keyboard.up(key);
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(180);
      await sample("released");
    }
    await page.screenshot({ path: `artifacts/driving/${run}-${maneuver}.png` });
    reports[maneuver] = samples;
    await page.close();
  }
  writeFileSync(
    `artifacts/driving/${run}.json`,
    JSON.stringify(reports, null, 2),
  );
  console.log(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(reports).map(([name, samples]) => [
          name,
          {
            start: samples[0],
            powered: samples[6],
            released: samples.at(-1),
          },
        ]),
      ),
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
