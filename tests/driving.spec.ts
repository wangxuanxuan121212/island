import { test, expect, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";

async function start(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "出发，去逛逛" }).click();
  await expect(page.getByTestId("island-canvas")).toHaveAttribute(
    "data-physics",
    "rapier",
  );
  await page.waitForTimeout(350);
}
async function state(page: Page) {
  return page.getByTestId("island-canvas").evaluate((canvas) => {
    const data = (canvas as HTMLElement).dataset;
    return {
      x: Number(data.x),
      z: Number(data.z),
      heading: Number(data.heading),
      steering: Number(data.steering),
      speed: Number(data.forwardSpeed),
      throttle: Number(data.throttle),
      gear: data.gear,
      inputs: data.inputs,
      routePoints: Number(data.routePoints),
    };
  });
}

test("release decelerates, reversing brakes first, and reverse speed is limited", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(650);
  expect((await state(page)).speed).toBeGreaterThan(0.5);
  await page.keyboard.up("ArrowUp");
  await expect
    .poll(async () => Math.abs((await state(page)).speed))
    .toBeLessThan(0.15);
  await page.keyboard.down("ArrowDown");
  await expect.poll(async () => (await state(page)).speed).toBeLessThan(-0.5);
  await page.waitForTimeout(600);
  expect(Math.abs((await state(page)).speed)).toBeLessThanOrEqual(2.9);
  await page.keyboard.up("ArrowDown");
  await page.keyboard.down("ArrowUp");
  await expect.poll(async () => (await state(page)).speed).toBeGreaterThan(0.5);
  await page.keyboard.up("ArrowUp");
  await expect.poll(async () => (await state(page)).gear).toBe("P");
});

test("left and right turn symmetrically and steering returns to center", async ({
  page,
}) => {
  const angles: number[] = [];
  for (const turn of ["ArrowLeft", "ArrowRight"]) {
    await start(page);
    const before = await state(page);
    await page.keyboard.down(turn);
    await page.keyboard.down("ArrowUp");
    await page.waitForTimeout(900);
    const after = await state(page);
    angles.push(after.heading - before.heading);
    await page.keyboard.up(turn);
    await page.keyboard.up("ArrowUp");
    await expect
      .poll(async () => Math.abs((await state(page)).steering))
      .toBeLessThan(0.01);
    await expect
      .poll(async () => Math.abs((await state(page)).speed))
      .toBeLessThan(0.15);
  }
  expect(angles[0]).toBeGreaterThan(0.12);
  expect(angles[1]).toBeLessThan(-0.12);
});

test("keyboard aliases and pointer input cannot release one another", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.down("w");
  await page.keyboard.down("ArrowUp");
  await page.keyboard.up("w");
  await expect
    .poll(async () => (await state(page)).inputs)
    .toContain("forward");
  const forward = page.getByRole("button", {
    name: "前进 (W / ↑)",
    exact: true,
  });
  const box = (await forward.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.keyboard.up("ArrowUp");
  await expect
    .poll(async () => (await state(page)).inputs)
    .toContain("forward");
  await page.mouse.up();
  await expect.poll(async () => (await state(page)).inputs).toBe("");
});

test("navigation follows roads to every destination without teleporting", async ({
  page,
}) => {
  await start(page);
  const evidence = [];
  for (const name of [
    "职业街区",
    "AI 实验室",
    "复旦校园",
    "网球公园",
    "来信码头",
  ]) {
    const before = await state(page);
    await page.getByRole("button", { name: "小岛地图", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: `导航至${name}`, exact: true })
      .click();
    await expect(
      page.getByRole("complementary", { name: "路线引导" }),
    ).toContainText(name);
    await expect
      .poll(async () => (await state(page)).routePoints)
      .toBeGreaterThan(1);
    const after = await state(page);
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(
      0.2,
    );
    evidence.push({ name, ...after });
  }
  await page.getByRole("button", { name: "全岛鸟瞰", exact: true }).click();
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: "artifacts/driving/desktop-route-overview.png",
  });
  await page.getByRole("button", { name: "取消导航", exact: true }).click();
  await expect(page.getByRole("button", { name: "选择目的地" })).toBeVisible();
  writeFileSync(
    "artifacts/driving/routes.json",
    JSON.stringify(evidence, null, 2),
  );
});

test("phone direction hold, navigation and map heading fit without overlaps", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  const forward = (await page
    .getByRole("button", { name: "前进 (W / ↑)", exact: true })
    .boundingBox())!;
  const left = (await page
    .getByRole("button", { name: "左转 (A / ←)", exact: true })
    .boundingBox())!;
  const touch = await context.newCDPSession(page);
  const point = (box: typeof forward, id: number) => ({
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
    id,
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [point(forward, 1), point(left, 2)],
  });
  await expect.poll(async () => (await state(page)).inputs).toContain("left");
  await page.waitForTimeout(500);
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect.poll(async () => (await state(page)).inputs).toBe("");
  await page.getByRole("button", { name: "重新回到路面" }).click();
  await page.getByRole("button", { name: "小岛地图", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "导航至网球公园", exact: true })
    .click();
  await expect(page.getByTestId("island-canvas")).toHaveAttribute(
    "data-destination",
    "park",
  );
  await page.waitForTimeout(400);
  await page.screenshot({ path: "artifacts/driving/mobile-guidance.png" });
  const layout = await page.evaluate(() => {
    const rect = (selector: string) =>
      document.querySelector(selector)!.getBoundingClientRect().toJSON();
    return {
      navigation: rect(".navigation-hud"),
      header: rect(".world-header"),
      drive: rect(".drive-controls"),
      nearby: rect(".nearby-button"),
      width: document.documentElement.scrollWidth,
    };
  });
  expect(layout.width).toBe(390);
  expect(layout.navigation.top).toBeGreaterThan(layout.header.bottom);
  expect(layout.drive.right).toBeLessThan(layout.nearby.left);
  await page.getByRole("button", { name: "小岛地图", exact: true }).click();
  await page.screenshot({ path: "artifacts/driving/mobile-route-map.png" });
  await expect(
    page.getByRole("dialog").locator(".map-route-active"),
  ).toBeVisible();
});

test("overview, dialogs, reset and focus loss clear driving inputs", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: "小岛地图", exact: true }).click();
  await page.keyboard.up("ArrowUp");
  await expect.poll(async () => (await state(page)).inputs).toBe("");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "全岛鸟瞰" }).click();
  await expect(
    page.getByRole("button", { name: "前进 (W / ↑)", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "重新回到路面" }).click();
  await expect(page.getByRole("button", { name: "全岛鸟瞰" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(200);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.keyboard.up("ArrowUp");
  await expect.poll(async () => (await state(page)).inputs).toBe("");
});

test("car physically follows the park route and reaches the destination", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await start(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.getByRole("button", { name: "小岛地图", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "导航至网球公园", exact: true })
    .click();
  const pressed = new Set<string>();
  const trajectory = [];
  for (let i = 0; i < 100; i++) {
    const data = await page
      .locator("canvas")
      .evaluate((canvas) => ({ ...canvas.dataset }));
    trajectory.push(data);
    if (data.arrived === "true") break;
    const turn = Number(data.routeTurn);
    const desiredSpeed = Math.abs(turn) > 0.45 ? 1.6 : 3.3;
    const keys = new Set<string>();
    if (Number(data.forwardSpeed) < desiredSpeed) keys.add("ArrowUp");
    if (turn > 0.12) keys.add("ArrowLeft");
    if (turn < -0.12) keys.add("ArrowRight");
    for (const key of pressed) if (!keys.has(key)) await page.keyboard.up(key);
    for (const key of keys)
      if (!pressed.has(key)) await page.keyboard.down(key);
    pressed.clear();
    keys.forEach((key) => pressed.add(key));
    await page.waitForTimeout(160);
  }
  for (const key of pressed) await page.keyboard.up(key);
  await expect(page.getByTestId("island-canvas")).toHaveAttribute(
    "data-arrived",
    "true",
  );
  await expect(page.getByTestId("island-canvas")).toHaveAttribute(
    "data-station",
    "park",
  );
  await expect(
    page.getByRole("complementary", { name: "路线引导" }),
  ).toContainText("已到达");
  expect(errors).toEqual([]);
  await page.screenshot({ path: "artifacts/driving/arrival.png" });
  writeFileSync(
    "artifacts/driving/verified-journey.json",
    JSON.stringify(trajectory, null, 2),
  );
});

test("all island spawns can route to every other island", async ({ page }) => {
  test.setTimeout(90_000);
  await start(page);
  const names = [
    "好奇心广场",
    "职业街区",
    "AI 实验室",
    "复旦校园",
    "网球公园",
    "来信码头",
  ];
  for (const origin of names) {
    await page.getByRole("button", { name: "小岛地图", exact: true }).click();
    await page.getByRole("button", { name: "直接前往", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: `前往${origin}`, exact: true })
      .click();
    for (const destination of names.filter((name) => name !== origin)) {
      await page.getByRole("button", { name: "小岛地图", exact: true }).click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: `导航至${destination}`, exact: true })
        .click();
      await expect(page.getByRole("dialog")).not.toBeVisible();
      await expect
        .poll(async () => (await state(page)).routePoints, {
          message: `${origin} -> ${destination}`,
        })
        .toBeGreaterThan(1);
    }
  }
});
