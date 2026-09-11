import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

mkdirSync("artifacts/relaxed-driving", { recursive: true });

async function start(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "出发，去逛逛" }).click();
  await expect(page.getByTestId("island-canvas")).toHaveAttribute(
    "data-physics",
    "rapier",
  );
  await page.waitForTimeout(400);
}

async function state(page: Page) {
  return page.getByTestId("island-canvas").evaluate((canvas) => {
    const data = (canvas as HTMLElement).dataset;
    return {
      x: Number(data.x),
      y: Number(data.y),
      z: Number(data.z),
      speed: Number(data.forwardSpeed),
      heading: Number(data.heading),
      faded: Number(data.fadedScenery),
    };
  });
}

test("steering alone turns the parked car without requiring a three-point turn", async ({
  page,
}) => {
  await start(page);
  const before = await state(page);
  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(1200);
  await page.keyboard.up("ArrowLeft");
  const after = await state(page);
  expect(after.heading - before.heading).toBeGreaterThan(0.6);
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(0.4);
  await page.waitForTimeout(400);
  const settled = await state(page);
  await page.waitForTimeout(400);
  expect(Math.abs((await state(page)).heading - settled.heading)).toBeLessThan(
    0.06,
  );
});

test("car crosses a full building footprint, fading the scenery without slowing or lifting", async ({
  page,
}) => {
  await start(page);
  await page.getByRole("button", { name: "小岛地图", exact: true }).click();
  await page.getByRole("button", { name: "直接前往", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "前往来信码头", exact: true })
    .click();
  await page.waitForTimeout(400);
  const before = await state(page);
  await page.keyboard.down("ArrowDown");
  await expect.poll(async () => (await state(page)).z).toBeLessThan(-20);
  const inside = await state(page);
  expect(inside.faded).toBeGreaterThan(0);
  expect(inside.speed).toBeLessThan(-1.8);
  expect(Math.abs(inside.y - before.y)).toBeLessThan(0.18);
  await page.screenshot({
    path: "artifacts/relaxed-driving/through-building.png",
  });
  await expect.poll(async () => (await state(page)).z).toBeLessThan(-24);
  await page.keyboard.up("ArrowDown");
  expect((await state(page)).z).toBeLessThan(before.z - 8);
  await expect(page.getByTestId("island-canvas")).toHaveAttribute(
    "data-collision-mode",
    "scenery-pass-through",
  );
});

test("coast protection keeps the car on land and allows reversing away", async ({
  page,
}) => {
  await start(page);
  const before = await state(page);
  await page.keyboard.down("ArrowUp");
  await expect.poll(async () => (await state(page)).z).toBeGreaterThan(17);
  await page.waitForTimeout(2000);
  await page.keyboard.up("ArrowUp");
  const shore = await state(page);
  expect(
    Math.hypot((shore.x + 1) / 24.8, (shore.z + 3) / 23.8),
  ).toBeLessThanOrEqual(1.002);
  expect(shore.y).toBeGreaterThan(-0.2);
  expect(Math.hypot(shore.x - before.x, shore.z - before.z)).toBeGreaterThan(
    15,
  );
  await page.keyboard.down("ArrowDown");
  await expect
    .poll(async () => (await state(page)).z, { timeout: 4000 })
    .toBeLessThan(shore.z - 0.8);
  await page.keyboard.up("ArrowDown");
  const after = await state(page);
  expect(after.z).toBeLessThan(shore.z - 0.8);
  await page.screenshot({
    path: "artifacts/relaxed-driving/coast-protection.png",
  });
});

test("mobile scene labels stay clear of navigation and driving controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  await page.waitForTimeout(700);
  const overlap = await page.evaluate(() => {
    const markers = [...document.querySelectorAll(".world-marker")].map((el) =>
      el.getBoundingClientRect(),
    );
    const controls = [
      ...document.querySelectorAll(
        ".world-header, .navigation-hud, .drive-controls, .nearby-button",
      ),
    ].map((el) => el.getBoundingClientRect());
    const intersects = (a: DOMRect, b: DOMRect) =>
      a.left < b.right &&
      a.right > b.left &&
      a.top < b.bottom &&
      a.bottom > b.top;
    return {
      count: markers.length,
      controls: markers.some((marker) =>
        controls.some((control) => intersects(marker, control)),
      ),
      labels: markers.some((marker, i) =>
        markers.slice(i + 1).some((other) => intersects(marker, other)),
      ),
    };
  });
  expect(overlap.count).toBeGreaterThan(0);
  expect(overlap.controls).toBe(false);
  expect(overlap.labels).toBe(false);
  await page.screenshot({ path: "artifacts/relaxed-driving/mobile.png" });
});
