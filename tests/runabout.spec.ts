import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { PNG } from "pngjs";

mkdirSync("artifacts/runabout", { recursive: true });

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`${viewport.name}: runabout renders, turns and animates its wheels`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    const canvas = page.getByTestId("island-canvas");
    await expect(canvas).toHaveAttribute(
      "data-vehicle-model",
      "island-runabout",
    );
    await expect(canvas).toHaveAttribute("data-car-color", "#6aada1");
    await page.waitForTimeout(800);
    await page.screenshot({
      path: `artifacts/runabout/${viewport.name}-welcome.png`,
    });
    await page.getByRole("button", { name: "出发，去逛逛" }).click();
    if (viewport.name === "desktop") {
      for (let i = 0; i < 3; i++)
        await page
          .getByRole("button", { name: "放大视野", exact: true })
          .click();
    }
    await page.waitForTimeout(800);
    await page.screenshot({
      path: `artifacts/runabout/${viewport.name}-front.png`,
    });
    const imageData = await canvas.evaluate((el) =>
      (el as HTMLCanvasElement).toDataURL("image/png"),
    );
    const png = PNG.sync.read(Buffer.from(imageData.split(",")[1], "base64"));
    const colors = new Set();
    for (let i = 0; i < png.data.length; i += 32)
      colors.add(
        `${png.data[i] >> 3},${png.data[i + 1] >> 3},${png.data[i + 2] >> 3}`,
      );
    expect(colors.size).toBeGreaterThan(100);
    const before = Number(await canvas.getAttribute("data-heading"));
    await page.keyboard.down("ArrowRight");
    await expect
      .poll(async () => Number(await canvas.getAttribute("data-heading")))
      .toBeLessThan(before - 0.8);
    await page.keyboard.up("ArrowRight");
    await page.waitForTimeout(400);
    await page.screenshot({
      path: `artifacts/runabout/${viewport.name}-side.png`,
    });
    const wheel = Number(await canvas.getAttribute("data-wheel-rotation"));
    await page.keyboard.down("ArrowUp");
    await expect
      .poll(async () =>
        Math.abs(
          Number(await canvas.getAttribute("data-wheel-rotation")) - wheel,
        ),
      )
      .toBeGreaterThan(0.5);
    await page.keyboard.up("ArrowUp");
    await expect(canvas).toHaveAttribute("data-gear", "P");
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(viewport.width);
  });
}

test("published custom paint still applies to the new vehicle", async ({
  page,
  context,
}) => {
  await page.goto("/editor.html");
  await page.getByRole("button", { name: "小岛外观", exact: true }).click();
  await page
    .getByRole("button", { name: "小车颜色 #7aabd0", exact: true })
    .click();
  await page.getByRole("button", { name: "发布", exact: true }).click();
  const viewer = await context.newPage();
  await viewer.goto("/");
  await expect(viewer.getByTestId("island-canvas")).toHaveAttribute(
    "data-car-color",
    "#7aabd0",
  );
  await expect(viewer.getByTestId("island-canvas")).toHaveAttribute(
    "data-vehicle-model",
    "island-runabout",
  );
  await viewer.screenshot({ path: "artifacts/runabout/custom-paint.png" });
});
