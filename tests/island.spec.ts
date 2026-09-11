import { test, expect, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const artifact = "artifacts";
mkdirSync(artifact, { recursive: true });

async function ready(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "出发，去逛逛" }),
  ).toBeEnabled();
  await expect(page.getByTestId("island-canvas")).toHaveAttribute(
    "data-physics",
    "rapier",
  );
}

async function position(page: Page) {
  return page.getByTestId("island-canvas").evaluate((canvas) => ({
    x: Number((canvas as HTMLElement).dataset.x),
    z: Number((canvas as HTMLElement).dataset.z),
  }));
}

async function pixels(page: Page) {
  const data = await page
    .getByTestId("island-canvas")
    .evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL("image/png"));
  const image = PNG.sync.read(Buffer.from(data.split(",")[1], "base64"));
  let coral = 0,
    green = 0;
  const colors = new Set<string>();
  for (let i = 0; i < image.data.length; i += 16) {
    const r = image.data[i],
      g = image.data[i + 1],
      b = image.data[i + 2];
    if (r > g * 1.12 && r > b * 1.06) coral++;
    if (g > r * 1.08 && g > b * 1.04) green++;
    colors.add(`${r >> 3},${g >> 3},${b >> 3}`);
  }
  return {
    coral,
    green,
    colors: colors.size,
    width: image.width,
    height: image.height,
  };
}

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 748, height: 691 },
]) {
  test(`${viewport.name}: nonblank scene, animation, driving, map and content`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await ready(page);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${artifact}/${viewport.name}-welcome.png` });
    const initialPixels = await pixels(page);
    expect(initialPixels.coral).toBeGreaterThan(100);
    expect(initialPixels.green).toBeGreaterThan(100);
    expect(initialPixels.colors).toBeGreaterThan(100);
    const firstFrame = Number(
      await page.getByTestId("island-canvas").getAttribute("data-frames"),
    );
    const beforeAnimation = await page
      .getByTestId("island-canvas")
      .screenshot();
    await page.waitForTimeout(450);
    expect(
      Number(
        await page.getByTestId("island-canvas").getAttribute("data-frames"),
      ),
    ).toBeGreaterThan(firstFrame);
    const afterAnimation = await page.getByTestId("island-canvas").screenshot();
    expect(beforeAnimation.equals(afterAnimation)).toBe(false);
    const layout = await page.evaluate(() => ({
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      heading: document.querySelector("h1")?.getBoundingClientRect().toJSON(),
      start: document
        .querySelector(".start-button")
        ?.getBoundingClientRect()
        .toJSON(),
    }));
    expect(layout.scrollWidth).toBeLessThanOrEqual(viewport.width);
    expect(layout.heading?.left).toBeGreaterThanOrEqual(0);
    expect(layout.heading?.right).toBeLessThanOrEqual(viewport.width);
    expect(layout.start?.bottom).toBeLessThan(viewport.height);
    await page.getByRole("button", { name: "出发，去逛逛" }).click();
    await expect(page.locator(".is-exploring")).toBeVisible();
    await page.waitForTimeout(350);
    const before = await position(page);
    await page.keyboard.down("ArrowUp");
    await page.waitForTimeout(900);
    await page.keyboard.up("ArrowUp");
    const after = await position(page);
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(
      0.25,
    );
    await page.screenshot({ path: `${artifact}/${viewport.name}-driving.png` });
    await page.getByRole("button", { name: "小岛地图", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.screenshot({ path: `${artifact}/${viewport.name}-map.png` });
    await page.getByRole("button", { name: "直接前往", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "前往职业街区", exact: true })
      .click();
    await expect(page.getByTestId("island-canvas")).toHaveAttribute(
      "data-station",
      "career",
    );
    await page.getByRole("button", { name: /走进职业街区/ }).click();
    await expect(page.getByRole("dialog")).toContainText("麦肯锡咨询");
    await expect(page.getByRole("dialog")).toContainText("2026.04");
    await page.screenshot({ path: `${artifact}/${viewport.name}-career.png` });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.getByRole("button", { name: "小岛地图", exact: true }).click();
    await page.getByRole("button", { name: "直接前往", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "前往AI 实验室", exact: true })
      .click();
    await expect(page.getByTestId("island-canvas")).toHaveAttribute(
      "data-station",
      "lab",
    );
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${artifact}/${viewport.name}-lab.png` });
    expect(errors).toEqual([]);
    writeFileSync(
      `${artifact}/${viewport.name}-evidence.json`,
      JSON.stringify(
        {
          initialPixels,
          layout,
          movement: { before, after },
          pageErrors: errors,
        },
        null,
        2,
      ),
    );
  });
}

test("touch-style long press survives HUD updates and releases on pointer up", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await page.getByRole("button", { name: "出发，去逛逛" }).click();
  const button = page.getByRole("button", {
    name: "前进 (W / ↑)",
    exact: true,
  });
  const box = (await button.boundingBox())!;
  const before = await position(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1000);
  await page.mouse.up();
  const after = await position(page);
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(
    0.3,
  );
  await page.getByRole("button", { name: "重新回到路面", exact: true }).click();
  await page.waitForTimeout(400);
  expect((await position(page)).z).toBeLessThan(4);
});

test("editor draft isolation, preview, publish, cross-tab sync and persistence", async ({
  page,
  context,
}) => {
  await page.goto("/editor.html");
  const viewer = await context.newPage();
  await viewer.goto("/?view=reading");
  await expect(viewer.getByRole("heading", { name: /王轩钰/ })).toBeVisible();
  await page.getByLabel("中文姓名", { exact: true }).fill("王轩钰测试");
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("展示端未变更");
  await expect(
    viewer.getByRole("heading", { name: /王轩钰测试/ }),
  ).not.toBeVisible();
  const preview = await context.newPage();
  await preview.goto("/?preview=1&view=reading");
  await expect(
    preview.getByRole("heading", { name: /王轩钰测试/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "发布", exact: true }).click();
  await expect(
    viewer.getByRole("heading", { name: /王轩钰测试/ }),
  ).toBeVisible();
  await viewer.reload();
  await expect(
    viewer.getByRole("heading", { name: /王轩钰测试/ }),
  ).toBeVisible();
  await page.getByLabel("中文姓名", { exact: true }).fill("王轩钰");
  await page.getByRole("button", { name: "发布", exact: true }).click();
  await page.screenshot({
    path: `${artifact}/desktop-editor.png`,
    fullPage: true,
  });
});

test("editor validation, malformed import, hidden content and undo", async ({
  page,
  context,
}) => {
  await page.goto("/editor.html");
  await page.getByLabel("公开邮箱", { exact: true }).fill("invalid");
  await page.getByRole("button", { name: "发布", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("邮箱");
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(page.getByLabel("公开邮箱", { exact: true })).toHaveValue(
    "xuanyuwang11@outlook.com",
  );
  await page.locator("input[type=file]").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":2}'),
  });
  await expect(page.getByRole("alert")).toContainText("格式");
  await page.getByRole("button", { name: /经历与项目/ }).click();
  await page.getByLabel("公开显示", { exact: true }).uncheck();
  await page.getByRole("button", { name: "发布", exact: true }).click();
  const viewer = await context.newPage();
  await viewer.goto("/?view=reading");
  await expect(viewer.locator("#career")).not.toContainText("字节跳动");
  await expect(viewer.locator("#career")).toContainText("麦肯锡咨询");
  await page.getByRole("button", { name: "导出发布文件", exact: true }).click();
  await page.getByLabel("公开显示", { exact: true }).check();
  await page.getByRole("button", { name: "发布", exact: true }).click();
});

test("mobile editor and full reader stay within the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/editor.html");
  await expect(page.getByLabel("中文姓名", { exact: true })).toBeVisible();
  await page.screenshot({
    path: `${artifact}/mobile-editor.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: /经历与项目/ }).click();
  await expect(page.getByLabel("标题", { exact: true })).toBeVisible();
  await page.screenshot({
    path: `${artifact}/mobile-entry-editor.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.goto("/?view=reading");
  await expect(
    page.getByText("推荐免试研究生专业第一。", { exact: false }),
  ).toBeVisible();
  await expect(page.locator("#lab")).toContainText("4,000+");
  await page.screenshot({
    path: `${artifact}/mobile-reader.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("WebGL failure falls back to the complete readable portfolio", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      kind: string,
      ...args: unknown[]
    ) {
      if (kind === "webgl" || kind === "webgl2") return null;
      return original.apply(this, [kind, ...args] as Parameters<
        typeof original
      >);
    } as typeof original;
  });
  await page.goto("/");
  await expect(
    page.getByText("当前设备未能开启 3D，已为你打开完整阅读版。"),
  ).toBeVisible();
  await expect(page.locator("#career")).toContainText("字节跳动");
  await expect(page.locator("#lab")).toContainText("Gate 化 Doc Pipeline");
});

test("unobstructed reversing, overview and the remaining destinations", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await ready(page);
  await page.getByRole("button", { name: "出发，去逛逛" }).click();
  const before = await position(page);
  await page.keyboard.down("ArrowDown");
  await page.waitForTimeout(2200);
  await page.keyboard.up("ArrowDown");
  const reversed = await position(page);
  expect(reversed.z).toBeLessThan(before.z - 2);
  expect(
    Number(await page.getByTestId("island-canvas").getAttribute("data-y")),
  ).toBeGreaterThan(-0.2);
  await page.getByRole("button", { name: "全岛鸟瞰", exact: true }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${artifact}/desktop-overview.png` });
  await expect(
    page.getByRole("button", { name: "返回驾驶视角" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "返回驾驶视角" }).click();
  for (const [name, id] of [
    ["复旦校园", "campus"],
    ["网球公园", "park"],
    ["来信码头", "contact"],
  ]) {
    await page.getByRole("button", { name: "小岛地图", exact: true }).click();
    await page.getByRole("button", { name: "直接前往", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: `前往${name}`, exact: true })
      .click();
    await expect(page.getByTestId("island-canvas")).toHaveAttribute(
      "data-station",
      id,
    );
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${artifact}/desktop-${id}.png` });
  }
  await page.getByRole("button", { name: /走进来信码头/ }).click();
  await expect(page.getByRole("link", { name: "写一封邮件" })).toHaveAttribute(
    "href",
    "mailto:xuanyuwang11@outlook.com",
  );
});

test("entry create, reorder, delete and JSON backup round trip", async ({
  page,
}) => {
  await page.goto("/editor.html");
  await page.getByRole("button", { name: /经历与项目/ }).click();
  await page.getByRole("button", { name: "添加内容", exact: true }).click();
  await page.getByLabel("标题", { exact: true }).fill("端到端验证条目");
  await page.getByLabel("副标题 / 角色", { exact: true }).fill("测试草稿");
  await page.getByLabel("时间", { exact: true }).fill("2026.09");
  await page
    .getByLabel("内容摘要", { exact: true })
    .fill("验证完整编辑、保存与恢复流程。");
  await page
    .getByLabel("经历要点（每行一项）", { exact: true })
    .fill("新增条目\n保存与恢复");
  await page.getByLabel("公开显示").check();
  await page.getByRole("button", { name: "上移", exact: true }).click();
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("草稿已保存");
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出草稿", exact: true }).click();
  const download = await downloading;
  const json = JSON.parse(readFileSync((await download.path())!, "utf8"));
  expect(json.entries).toHaveLength(19);
  expect(json.entries[17].title).toBe("端到端验证条目");
  await page.getByRole("button", { name: "删除内容", exact: true }).click();
  await page.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(page.locator(".content-list-items")).not.toContainText(
    "端到端验证条目",
  );
  await page.locator("input[type=file]").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(json)),
  });
  await expect(page.getByRole("status")).toContainText("已导入草稿，尚未发布");
  await expect(page.locator(".content-list-items")).toContainText(
    "端到端验证条目",
  );
});

test("storage failures are reported without claiming a successful publish", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    };
  });
  await page.goto("/editor.html");
  await page.getByRole("button", { name: "发布", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("本地存储不可用");
  await expect(page.getByRole("status")).not.toContainText("已发布");
});

test("small phone and landscape layout retain usable first-screen controls", async ({
  page,
}) => {
  for (const viewport of [
    { name: "small-phone", width: 360, height: 640 },
    { name: "landscape", width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await ready(page);
    await page.waitForTimeout(500);
    const start = (await page
      .getByRole("button", { name: "出发，去逛逛" })
      .boundingBox())!;
    expect(start.y + start.height).toBeLessThan(viewport.height);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({ path: `${artifact}/${viewport.name}-welcome.png` });
  }
});
