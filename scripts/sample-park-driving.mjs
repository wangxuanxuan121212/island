import { chromium } from "@playwright/test";

const run = process.argv[2] ?? "pre-fix";
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl"],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`http://127.0.0.1:5186/?driveDebug=1&run=${run}`);
  await page.getByRole("button", { name: "出发，去逛逛" }).click();
  await page.waitForTimeout(1800);
  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(1600);
  await page.keyboard.up("ArrowLeft");
  await page.waitForTimeout(600);
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(1600);
  await page.keyboard.up("ArrowUp");
  await page.waitForTimeout(1000);
} finally {
  await browser.close();
}
