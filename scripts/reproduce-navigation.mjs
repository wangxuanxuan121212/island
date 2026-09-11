import { chromium } from "@playwright/test";

const run = process.argv[2] || "pre-fix";
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  // #region debug-point C:page-errors
  page.on("pageerror", (error) => {
    void fetch("http://127.0.0.1:7777/event", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "map-navigation-state",
        runId: run,
        hypothesisId: "C",
        location: "browser:uncaught",
        msg: "[DEBUG] page error",
        data: { message: error.message, stack: error.stack },
        ts: Date.now(),
      }),
    });
  });
  // #endregion
  await page.goto(`http://127.0.0.1:5186/?debug=1&run=${run}`);
  await page.getByRole("button", { name: "出发，去逛逛" }).click();
  const forward = await page
    .getByRole("button", { name: "前进 (W / ↑)", exact: true })
    .boundingBox();
  const left = await page
    .getByRole("button", { name: "左转 (A / ←)", exact: true })
    .boundingBox();
  const touch = await context.newCDPSession(page);
  const point = (box, id) => ({
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
    id,
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [point(forward, 1), point(left, 2)],
  });
  await page.waitForTimeout(500);
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "重新回到路面" }).click();
  await page.getByRole("button", { name: "小岛地图", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "导航至网球公园", exact: true })
    .click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `artifacts/driving/${run}-navigation.png` });
  await page.close();
} finally {
  await browser.close();
}
