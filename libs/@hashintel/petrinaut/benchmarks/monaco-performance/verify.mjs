import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium } from "playwright";

import { instrument } from "./instrument.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((argument) => argument.split("=")),
);
const output = resolve(
  args.output ?? new URL("./results", import.meta.url).pathname,
);
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const results = [];
try {
  for (const variant of (
    args.variants ?? "baseline,combined,debounced-state"
  ).split(",")) {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(instrument);
    const snapshot = () =>
      page.evaluate(() => globalThis.__monacoBench.snapshot());
    const activeValue = () =>
      page.evaluate(() =>
        globalThis.__monacoBench
          .editors()
          .find((editor) => editor.getDomNode().checkVisibility())
          ?.getValue(),
      );
    const ready = () =>
      page.waitForFunction(() =>
        globalThis.__monacoBench
          .editors()
          .some(
            (editor) =>
              globalThis.__monacoBench.isReady(editor) &&
              editor.getDomNode().checkVisibility(),
          ),
      );
    const undoTo = async (value) => {
      for (
        let attempt = 0;
        attempt < 12 && (await activeValue()) !== value;
        attempt++
      ) {
        await page.keyboard.press("Meta+z");
        await page.waitForTimeout(50);
      }
      assert.equal(await activeValue(), value);
    };
    try {
      await page.goto(
        `http://127.0.0.1:6027/benchmarks/monaco-performance/bench.html?surface=full&model=supply-chain&variant=${variant}`,
      );
      await page
        .getByRole("button", { name: "Collapse sidebar", exact: true })
        .click();
      await page.getByRole("button", { name: "Fit view", exact: true }).click();
      await page.waitForTimeout(500);
      await page
        .locator(".react-flow__node")
        .filter({ has: page.getByText("InboundShipments", { exact: true }) })
        .hover();
      await page
        .getByRole("button", { name: "Show state visualizer", exact: true })
        .evaluate((element) => element.click());
      await page.locator("[data-visualizer-scene] > svg").hover();
      await page
        .getByRole("button", { name: "Edit visualizer code", exact: true })
        .click();
      await ready();
      await page.waitForTimeout(500);
      const original = await activeValue();
      assert.ok(original.includes("Visualizer.Svg"));
      const before = await snapshot();
      await page.evaluate(() => {
        const editor = globalThis.__monacoBench
          .editors()
          .find((candidate) => candidate.getDomNode().checkVisibility());
        editor.focus();
        editor.setPosition({ lineNumber: 1, column: 1 });
        editor.pushUndoStop();
      });
      const diagnosticStart = await page.evaluate(() => performance.now());
      await page.keyboard.type('const benchmarkBad: number = "no";\n', {
        delay: 5,
      });
      await page.waitForFunction(() => {
        const editor = globalThis.__monacoBench
          .editors()
          .find((candidate) => candidate.getDomNode().checkVisibility());
        return globalThis.__monacoBench
          .monaco()
          .editor.getModelMarkers({ resource: editor.getModel().uri })
          .some((marker) => marker.message.includes("not assignable"));
      });
      const diagnostics = await snapshot();
      await undoTo(original);
      await page.evaluate(() => {
        const editor = globalThis.__monacoBench
          .editors()
          .find((candidate) => candidate.hasTextFocus());
        editor.setPosition({ lineNumber: 1, column: 1 });
        editor.pushUndoStop();
      });
      await page.keyboard.type("parameters.", { delay: 15 });
      await page.locator(".suggest-widget.visible").waitFor();
      const suggestions = await page
        .locator(".suggest-widget.visible")
        .innerText();
      assert.ok(suggestions.length > 0);
      await page.keyboard.press("Escape");
      await undoTo(original);
      await page
        .locator('[data-scope="segment-group"][data-part="item-text"]')
        .filter({ hasText: /^Definitions$/ })
        .click();
      await page.waitForTimeout(700);
      const definitions = await snapshot();
      await page
        .locator('[data-scope="segment-group"][data-part="item-text"]')
        .filter({ hasText: /^Canvas$/ })
        .click();
      await ready();
      await page.waitForTimeout(450);
      assert.equal(await activeValue(), original);
      const returned = await snapshot();
      const handle = page
        .getByRole("button", { name: "Resize panel from left", exact: true })
        .last();
      const bounds = await handle.boundingBox();
      assert.ok(bounds);
      const resizeStart = await page.evaluate(() => performance.now());
      await page.mouse.move(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2,
      );
      await page.mouse.down();
      await page.waitForTimeout(70);
      for (let step = 1; step <= 20; step++) {
        await page.mouse.move(
          bounds.x - step * 10,
          bounds.y + bounds.height / 2,
        );
        await page.waitForTimeout(12);
      }
      await page.mouse.up();
      await page.waitForTimeout(400);
      const resized = await page.evaluate(
        (start) => globalThis.__monacoBench.snapshot(start),
        resizeStart,
      );
      assert.equal(await activeValue(), original);
      await page.screenshot({ path: `${output}/verified-${variant}.png` });
      assert.deepEqual(errors, []);
      const result = {
        variant,
        diagnosticLatency: diagnostics.now - diagnosticStart,
        suggestions,
        before,
        diagnostics,
        definitions,
        returned,
        resized,
      };
      results.push(result);
      await writeFile(`${output}/verification.json`, JSON.stringify(results));
      console.log(
        JSON.stringify({
          variant,
          diagnosticLatency: result.diagnosticLatency,
          definitionsEditors: definitions.editors,
          returnedEditors: returned.editors,
          disposeOnViewSwitch: returned.records.filter(
            (record) => record.kind === "dispose" && record.start > before.now,
          ).length,
          resizeMaxFrame: Math.max(
            ...resized.frames.map((frame) => frame.duration),
          ),
          errors,
        }),
      );
    } catch (error) {
      await page.screenshot({
        path: `${output}/verification-failed-${variant}.png`,
      });
      throw error;
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}
