/** Run against a running Mission Control dev/preview server. All state changes use the player UI. */
import assert from "node:assert/strict";
import console from "node:console";
import { readFile } from "node:fs/promises";
import process from "node:process";
import { chromium } from "playwright";

const baseURL = process.env.MC_BASE_URL || "http://127.0.0.1:5173";
const channel = process.env.MC_BROWSER_CHANNEL || "chrome";
const selectedTest = process.env.MC_TEST
  ? new RegExp(process.env.MC_TEST, "i")
  : null;
const options = {
  headless: true,
  ...(channel === "chromium" ? {} : { channel }),
};
const browser = await chromium.launch(options);
const failures = [];
let passed = 0;

async function run(
  name,
  journey,
  contextOptions = {},
  browserOverride = browser,
) {
  if (selectedTest && !selectedTest.test(name)) return;
  const context = await browserOverride.newContext({
    viewport: { width: 1280, height: 850 },
    reducedMotion: "reduce",
    ...contextOptions,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    const response = await page.goto(baseURL, {
      waitUntil: "domcontentloaded",
    });
    assert.ok(response?.ok(), `Site returned HTTP ${response?.status()}`);
    const scenarios = page.locator(".mission-grid").getByRole("button");
    await scenarios.first().waitFor();
    assert.equal(
      await scenarios.count(),
      4,
      "Expected four playable destinations",
    );
    await journey(page);
    assert.deepEqual(errors, [], "Unexpected browser errors");
    passed++;
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push(name);
    console.error(`FAIL ${name}\n${error.stack || error}`);
  } finally {
    await context.close();
  }
}

const button = (page, name) => page.getByRole("button", { name, exact: true });
const click = (page, name) => button(page, name).click();
const tickText = (page) => page.locator(".flight-clock .mono").innerText();
const fuelValue = async (page) =>
  Number.parseFloat(
    (
      await page
        .locator(".resource")
        .filter({ hasText: "Propellant remaining" })
        .locator("strong")
        .innerText()
    ).replaceAll(",", ""),
  );
const designMetric = (page, label) =>
  page
    .locator(".budget-strip .metric")
    .filter({ hasText: label })
    .locator(".metric-value")
    .innerText();

async function openDesign(page, scenario) {
  if (scenario)
    await page.locator(".mission-card").filter({ hasText: scenario }).click();
  await click(page, "Design spacecraft");
  await page
    .getByRole("heading", { name: "Configure your spacecraft" })
    .waitFor();
}

async function flightPlan(page) {
  await click(page, "Select launch vehicle");
  await click(page, "Plan trajectory");
}

async function completeFlight(page, reloadAtFirstDecision = false) {
  await click(page, "20×");
  let count = 0;
  for (;;) {
    await page
      .locator(".anomaly-panel, .completion-panel")
      .first()
      .waitFor({ timeout: 20000 });
    if (await page.locator(".completion-panel").isVisible()) return count;
    const panel = page.getByRole("alertdialog");
    if (count === 0 && reloadAtFirstDecision) {
      const title = await panel.getByRole("heading").innerText();
      const tick = await tickText(page);
      const fuel = await fuelValue(page);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.locator("main.page-control").waitFor();
      await panel.getByRole("heading", { name: title, exact: true }).waitFor();
      assert.equal(
        await tickText(page),
        tick,
        "Reload advanced pending decision",
      );
      assert.equal(await fuelValue(page), fuel, "Reload changed propellant");
      await click(page, "20×");
    }
    assert.ok(count++ < 4, "Unexpected extra anomaly");
    await panel.getByRole("button").first().click();
    await panel.waitFor({ state: "hidden" });
  }
}

try {
  await run(
    "Guided Earth flight, anomaly recovery, reload and PDF",
    async (page) => {
      await click(page, "First mission guide");
      await page.locator(".tutorial").waitFor();
      await click(page, "Save design");
      await flightPlan(page);
      await click(page, "Commit to launch");
      await click(page, "Pause");
      const frozenTick = await tickText(page);
      await page.waitForTimeout(1100);
      assert.equal(await tickText(page), frozenTick);
      await click(page, "Resume");
      const decisions = await completeFlight(page, true);
      assert.equal(decisions, 3);
      assert.ok((await fuelValue(page)) > 0 && (await fuelValue(page)) < 80);
      assert.match(
        await page.locator(".science-achievement strong").innerText(),
        /100\s*%/,
      );
      await click(page, "View mission report");
      await page.getByText("Mission completed", { exact: true }).waitFor();
      assert.equal(await page.locator(".score-row").count(), 5);
      assert.match(
        await page
          .locator(".ledger-row")
          .filter({ hasText: "Operator decisions" })
          .innerText(),
        /3 recorded/,
      );
      const downloadPromise = page.waitForEvent("download");
      await click(page, "Export PDF report");
      const download = await downloadPromise;
      assert.match(download.suggestedFilename(), /\.pdf$/i);
      const pdf = await readFile(await download.path());
      assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
      assert.match(pdf.subarray(-48).toString(), /%%EOF/);
    },
  );

  await run("Save and compare spacecraft designs", async (page) => {
    await openDesign(page);
    const massBefore = await designMetric(page, "Launch mass");
    await click(page, "Save design");
    await page
      .locator(".component-card")
      .filter({ hasText: "Infrared spectrometer" })
      .click();
    const massAfter = await designMetric(page, "Launch mass");
    assert.notEqual(massAfter, massBefore);
    await page
      .locator(".decision-explainer")
      .filter({ hasText: "+30 kg" })
      .waitFor();
    await click(page, "Save design");
    await page
      .locator(".main-nav")
      .getByRole("button", { name: "Archive" })
      .click();
    assert.equal(await page.locator(".saved-card").count(), 2);
    for (const card of await page.locator(".saved-card").all())
      await card.getByRole("button", { name: "Compare", exact: true }).click();
    const values = await page
      .getByRole("row")
      .filter({ hasText: "Wet mass" })
      .getByRole("cell")
      .allInnerTexts();
    assert.equal(values.length, 2);
    assert.notEqual(values[0], values[1]);
    await page
      .locator(".saved-card")
      .last()
      .getByRole("button", { name: "Load design" })
      .click();
    assert.equal(await designMetric(page, "Launch mass"), massBefore);
  });

  await run(
    "Moon payload rejection and compatible launch recovery",
    async (page) => {
      await openDesign(page, "Lunar Pathfinder");
      await click(page, "Select launch vehicle");
      await page.locator(".vehicle-card").filter({ hasText: "Swift" }).click();
      await page
        .getByText(/Your spacecraft is .* kg over the launch limit/)
        .waitFor();
      await click(page, "Plan trajectory");
      assert.ok(await button(page, "Resolve readiness issues").isDisabled());
      await click(page, "Back");
      await page.locator(".vehicle-card").filter({ hasText: "Atlas" }).click();
      await click(page, "Plan trajectory");
      assert.ok(await button(page, "Commit to launch").isEnabled());
    },
  );

  await run("Mars solar power blocks launch", async (page) => {
    await openDesign(page, "Red Frontier");
    await page
      .locator(".category-nav")
      .getByRole("button", { name: /Solar arrays/ })
      .click();
    await page
      .locator(".component-card")
      .filter({ hasText: "Compact solar wings" })
      .click();
    await page.getByText(/Solar output is .* W below demand/).waitFor();
    assert.match(await designMetric(page, "Power balance"), /-/);
    await flightPlan(page);
    assert.ok(await button(page, "Resolve readiness issues").isDisabled());
  });

  await run(
    "Tight propellant reserve fails in flight with recorded cause",
    async (page) => {
      await openDesign(page);
      await page
        .locator(".category-nav")
        .getByRole("button", { name: /Propulsion/ })
        .click();
      const slider = page.getByLabel(/Propellant load/);
      await slider.press("Home");
      for (let i = 0; i < 6; i++) await slider.press("ArrowRight");
      assert.equal(await slider.inputValue(), "30");
      await flightPlan(page);
      await page.getByLabel("Simulation seed").fill("1");
      await click(page, "Commit to launch");
      await completeFlight(page);
      assert.match(
        await page.locator(".completion-panel").innerText(),
        /propellant/i,
      );
      assert.equal(await fuelValue(page), 0);
      await click(page, "View mission report");
      await page.getByText("Mission failed", { exact: true }).waitFor();
      assert.ok(
        Number.parseInt(
          await page.locator(".score-orbit strong").innerText(),
        ) <= 49,
      );
    },
  );

  await run(
    "Mobile navigation and viewport containment",
    async (page) => {
      const assertLayout = async (label) => {
        const width = await page.evaluate(() => ({
          document: globalThis.document.documentElement.scrollWidth,
          viewport: globalThis.innerWidth,
        }));
        assert.ok(
          width.document <= width.viewport + 1,
          `${label} overflows: ${width.document} > ${width.viewport}`,
        );
      };
      await assertLayout("Mission selection");
      await openDesign(page, "Lunar Pathfinder");
      await assertLayout("Design lab");
      await page
        .locator(".category-nav")
        .getByRole("button", { name: /Redundancy/ })
        .click();
      await page
        .locator(".component-card")
        .filter({ hasText: "Essential spares" })
        .click();
      await click(page, "Select launch vehicle");
      await assertLayout("Launch vehicles");
      await click(page, "Plan trajectory");
      await assertLayout("Flight plan");
      await page.getByRole("button", { name: "Open flight handbook" }).click();
      await page.getByRole("dialog").waitFor();
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await page
        .locator(".main-nav")
        .getByRole("button", { name: "Archive" })
        .click();
      await assertLayout("Archive");
    },
    {
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
    },
  );

  if (!selectedTest || selectedTest.test("2D WebGL fallback")) {
    const fallbackBrowser = await chromium.launch({
      ...options,
      args: ["--disable-webgl"],
    });
    try {
      await run(
        "2D WebGL fallback",
        async (page) => {
          await openDesign(page);
          await page
            .getByRole("img", { name: /Spacecraft schematic/ })
            .waitFor();
          await page
            .getByRole("button", { name: "Select spacecraft bus", exact: true })
            .click();
          await page
            .locator(".component-catalog")
            .getByRole("heading", { name: "Spacecraft bus" })
            .waitFor();
          // The two wings span the bus. Keyboard selection targets the group directly.
          await page
            .getByRole("button", { name: "Select solar arrays", exact: true })
            .press("Enter");
          await page
            .locator(".component-catalog")
            .getByRole("heading", { name: "Solar arrays" })
            .waitFor();
          await flightPlan(page);
          assert.ok(await button(page, "Commit to launch").isEnabled());
        },
        {},
        fallbackBrowser,
      );
    } finally {
      await fallbackBrowser.close();
    }
  }
} finally {
  await browser.close();
}
console.log(`${passed} browser journeys passed, ${failures.length} failed.`);
if (failures.length || !passed) process.exitCode = 1;
