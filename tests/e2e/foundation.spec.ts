import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ids } from "../../scripts/seed";
async function login(page: Page, name: string) {
  await page.goto("/login");
  await page.getByRole("button", { name, exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
}
test("registration, independent authority review, and community switching", async ({
  page,
  browser,
}) => {
  await login(page, "Applicant");
  await page.getByRole("link", { name: "Register or request access" }).click();
  await page
    .getByLabel("Legal association name", { exact: true })
    .fill("Synthetic Garden Association");
  await page
    .getByLabel("Display name", { exact: true })
    .fill("Synthetic Garden");
  await page.getByLabel("Requested community address").fill("synthetic-garden");
  await page.getByLabel("Approximate number of properties").fill("50");
  for (const legend of [
    "Physical community location",
    "Separate mailing address",
  ]) {
    const fields = page.getByRole("group", { name: legend });
    await fields
      .getByLabel("Street address", { exact: true })
      .fill(
        legend.startsWith("Physical")
          ? "700 Browser Street"
          : "800 Mailing Road",
      );
    await fields.getByLabel("City", { exact: true }).fill("Example City");
    await fields.getByLabel("State / province / region").fill("NY");
    await fields.getByLabel("Postal code").fill("10001");
  }
  await page
    .getByLabel("Authorized representative", { exact: true })
    .fill("Synthetic Representative");
  await page.getByLabel("Position / authority").fill("Board president");
  await page
    .getByLabel("Describe the evidence")
    .fill("Synthetic independent board resolution available for test review.");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(
    page.getByRole("heading", { name: "Request received" }),
  ).toBeVisible();
  const reviewer = await browser.newContext();
  const review = await reviewer.newPage();
  await login(review, "Reviewer");
  await review.getByRole("link", { name: "Platform review" }).click();
  await expect(review).toHaveURL(/\/admin$/);
  const card = review.getByRole("article").filter({
    has: review.getByRole("heading", {
      name: "Synthetic Garden",
      exact: true,
    }),
  });
  await expect(card, await review.locator("body").innerText()).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page: review })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await review.screenshot({
    path: "test-results/platform-review.png",
    fullPage: true,
  });
  await card.getByLabel("Decision").selectOption("approve");
  await card
    .getByLabel("Review reason", { exact: true })
    .fill(
      "Synthetic board resolution and representative authority reviewed independently.",
    );
  await card
    .getByLabel("Reviewed evidence reference")
    .fill("test-evidence:browser-resolution");
  await card.getByRole("button", { name: "Record decision" }).click();
  await expect(
    review.getByRole("heading", { name: "No pending reviews" }),
  ).toBeVisible();
  await page.goto("/app");
  await page
    .getByRole("link")
    .filter({
      has: page.getByRole("heading", { name: "Synthetic Garden", exact: true }),
    })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Synthetic Garden",
      exact: true,
      level: 1,
    }),
  ).toBeVisible();
  await reviewer.close();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("button", { name: "Manager", exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page
    .getByRole("link")
    .filter({
      has: page.getByRole("heading", {
        name: "Sample Courtyard HOA",
        exact: true,
      }),
    })
    .click();
  await page.getByLabel("Switch community").selectOption(ids.lake);
  await expect(
    page.getByRole("heading", { name: "Sample Lake Association", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Your role here: treasurer", { exact: false }),
  ).toBeVisible();
});
test("resident isolation, CSRF, host spoofing, and private cache headers", async ({
  page,
  request,
}) => {
  await login(page, "Resident");
  const permitted = await page.request.get(`/api/communities/${ids.courtyard}`);
  expect(permitted.status()).toBe(200);
  expect(permitted.headers()["cache-control"]).toContain("no-store");
  expect(
    (await page.request.get(`/api/communities/${ids.lake}`)).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post("/api/auth/logout", {
        data: {},
        headers: { Origin: "https://evil.test" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.get("/", { headers: { Host: "unverified.example.test" } })
    ).status(),
  ).toBe(421);
  expect(
    (
      await request.get(
        "/api/auth/callback?code=guess&state=" + "a".repeat(43),
        { headers: { Host: "sample-courtyard.localhost:3217" } },
      )
    ).status(),
  ).toBe(421);
  expect(
    (
      await request.get("/", {
        headers: { "X-Forwarded-Host": "sample-courtyard.localhost:3217" },
      })
    ).status(),
  ).toBe(200);
  const unknown = await request.get("/", {
    headers: { Host: "unknown.localhost:3217" },
  });
  expect(unknown.status()).toBe(404);
  const publicPage = await request.get("/", {
    headers: { Host: "sample-courtyard.localhost:3217" },
  });
  expect(publicPage.status()).toBe(200);
  expect(await publicPage.text()).not.toContain("resident@example.test");
});
test("mobile navigation and implemented screens have no automated accessibility violations", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("link", { name: "Skip to content" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  for (const route of ["/", "/login"]) {
    await page.goto(route);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  }
  await login(page, "Manager");
  for (const route of ["/app", `/communities/${ids.courtyard}`, "/portfolio"]) {
    await page.goto(route);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  }
  await page.screenshot({
    path: "test-results/mobile-workspace.png",
    fullPage: true,
  });
});
