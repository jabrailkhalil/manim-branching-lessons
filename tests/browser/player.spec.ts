import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createHash } from "node:crypto";

test("plays real media and follows both branches", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Choose the next point" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Play clip", exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator("video")
        .evaluate((v) => (v as HTMLVideoElement).currentTime),
    )
    .toBeGreaterThan(0.1);
  // Windows WebKit exposes scaled decoder dimensions. Check source bytes
  // independently; decoding every frame at 960x540 is checked in Python.
  const metadata = await page.locator("video").evaluate((v) => {
    const video = v as HTMLVideoElement;
    return {
      width: video.videoWidth,
      height: video.videoHeight,
      duration: video.duration,
    };
  });
  expect(metadata.width).toBeGreaterThan(0);
  expect(metadata.width / metadata.height).toBeCloseTo(16 / 9, 2);
  expect(metadata.duration).toBeCloseTo(7, 1);
  const clip = await page.request.get("/clips/question.mp4");
  const render = await (
    await page.request.get("/clips/render-info.json")
  ).json();
  expect(
    createHash("sha256")
      .update(await clip.body())
      .digest("hex"),
  ).toBe(render.clips[0].sha256);
  await page.getByRole("button", { name: "x = 3", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Check the direction" }),
  ).toBeFocused();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Check the direction" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Try the question again" }).click();
  await page.getByRole("button", { name: "x = 1", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A step downhill" }),
  ).toBeFocused();
  await expect(page.getByText("3 transitions in this attempt")).toBeVisible();
  await page.getByText("Read the transcript", { exact: true }).click();
  await expect(page.getByText(/The next point is 2/)).toBeVisible();
  await page.screenshot({
    path: info.outputPath("completed.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Restart lesson" }).click();
  await page.reload();
  await expect(page.getByText("0 transitions in this attempt")).toBeVisible();
  expect(errors).toEqual([]);
});

test("local assets only, mobile layout and automated accessibility checks", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const external: string[] = [];
  await page.route("**/*", (route) => {
    if (new URL(route.request().url()).origin !== "http://127.0.0.1:4173") {
      external.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  await page.goto("./");
  await expect(
    page.getByRole("button", { name: "x = 1", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Play clip", exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator("video")
        .evaluate((v) => (v as HTMLVideoElement).currentTime),
    )
    .toBeGreaterThan(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: info.outputPath("mobile.png"),
    fullPage: true,
  });
  expect(external).toEqual([]);
});

test("works when browser storage is denied", async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("denied");
      },
    }),
  );
  await page.goto("./");
  await expect(page.getByText(/Browser storage is unavailable/)).toBeVisible();
  await page.getByRole("button", { name: "x = 1", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A step downhill" }),
  ).toBeVisible();
  await expect(page.getByText(/Progress could not be saved/)).toBeVisible();
});

test("recovers from corrupted saved progress", async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("branching-lesson:gradient-step", "{broken"),
  );
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Choose the next point" }),
  ).toBeVisible();
});

test("reports malformed manifest", async ({ page }) => {
  await page.route("**/lesson.json", (r) =>
    r.fulfill({ json: { version: 999 } }),
  );
  await page.goto("./");
  await expect(page.getByRole("alert")).toHaveText(
    "Unsupported lesson version",
  );
});

test("manifest text cannot insert HTML", async ({ page, request }) => {
  const response = await request.get("/lesson.json");
  const lesson = await response.json();
  lesson.nodes[0].title = '<img src=x onerror="window.injected=true">';
  lesson.title = "A different lesson title";
  await page.route("**/lesson.json", (r) => r.fulfill({ json: lesson }));
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: lesson.nodes[0].title }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    lesson.title,
  );
  await expect(page).toHaveTitle(`${lesson.title} · Branching lessons`);
  expect(await page.locator("#app img").count()).toBe(0);
  expect(await page.evaluate(() => Object.hasOwn(window, "injected"))).toBe(
    false,
  );
});

test("keyboard answers and focus follow the branch", async ({ page }) => {
  await page.goto("./");
  const answer = page.getByRole("button", { name: "x = 1", exact: true });
  await answer.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "A step downhill" }),
  ).toBeFocused();
});
