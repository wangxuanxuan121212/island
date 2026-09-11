import { preview } from "vite";
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";

const server = await preview({
  preview: { host: "127.0.0.1", port: 5188, strictPort: false },
});
const address = server.httpServer.address();
const base = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl"],
});
mkdirSync("artifacts", { recursive: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  const errors = [];
  const failedRequests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("requestfailed", (request) => failedRequests.push(request.url()));
  await page.goto(base);
  await page.getByRole("button", { name: "出发，去逛逛" }).waitFor();
  await page.waitForFunction(
    () => document.querySelector("canvas")?.dataset.physics === "rapier",
  );
  await page.waitForTimeout(600);
  await page.screenshot({ path: "artifacts/production-desktop.png" });
  const canvas = await page.locator("canvas").evaluate((element) => ({
    width: element.width,
    height: element.height,
    frames: Number(element.dataset.frames),
    triangles: Number(element.dataset.triangles),
    physics: element.dataset.physics,
  }));
  assert(canvas.triangles > 1000 && canvas.frames > 0);
  await page.getByRole("button", { name: "出发，去逛逛" }).click();
  await page.getByRole("button", { name: "小岛地图", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "导航至复旦校园", exact: true }).click();
  await page.waitForFunction(() => Number(document.querySelector("canvas")?.dataset.routePoints) > 1);
  const navigation = await page.locator("canvas").evaluate(element => ({
    destination: element.dataset.destination,
    routePoints: Number(element.dataset.routePoints),
    distance: Number(element.dataset.routeDistance),
  }));
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(navigation.destination, "campus");
  await page.screenshot({ path: "artifacts/driving/production-navigation.png" });
  assert.deepEqual(errors, []);
  assert.deepEqual(failedRequests, []);
  const editor = await browser.newPage();
  const editorAssets = [];
  editor.on("request", (request) => editorAssets.push(request.url()));
  await editor.goto(`${base}/editor.html`);
  await editor.getByLabel("中文姓名", { exact: true }).waitFor();
  assert.equal(
    await editor.getByLabel("中文姓名", { exact: true }).inputValue(),
    "王轩钰",
  );
  assert.equal(
    editorAssets.some((url) => /physics-|three-/.test(url)),
    false,
  );
  const report = {
    base,
    canvas,
    navigation,
    errors,
    failedRequests,
    editorDoesNotLoad3D: true,
  };
  writeFileSync(
    "artifacts/production-verification.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
