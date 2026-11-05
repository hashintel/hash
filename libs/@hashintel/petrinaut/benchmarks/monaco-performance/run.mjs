import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";

import { chromium } from "playwright";

import { instrument } from "./instrument.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((argument) => argument.split("=")),
);
const origin = args.origin ?? "http://127.0.0.1:6027";
const surface = args.surface ?? "micro";
const model = args.model ?? "satellites";
const variants = (args.variants ?? "baseline").split(",");
const samples = Number(args.samples ?? 12);
const output = resolvePath(
  args.output ?? new URL("./results", import.meta.url).pathname,
);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const rows = [];

const performanceMetrics = async (session) =>
  Object.fromEntries(
    (await session.send("Performance.getMetrics")).metrics.map((metric) => [
      metric.name,
      metric.value,
    ]),
  );
const difference = (after, before) =>
  Object.fromEntries(
    Object.entries(after).map(([name, value]) => [
      name,
      value - (before[name] ?? 0),
    ]),
  );
const sleep = async (page, duration = 450) => page.waitForTimeout(duration);

const measure = async (
  page,
  session,
  label,
  selector,
  { expectNewPath = false, ready = true } = {},
) => {
  const before = await performanceMetrics(session);
  await page.evaluate(
    ({
      selector: targetSelector,
      expectNewPath: differentPath,
      ready: waitForEditor,
    }) => {
      const button = document.querySelector(targetSelector);
      if (!button) throw new Error(`Missing control: ${targetSelector}`);
      const activeEditor = () =>
        globalThis.__monacoBench
          .editors()
          .find(
            (editor) =>
              globalThis.__monacoBench.isReady(editor) &&
              editor.getDomNode()?.checkVisibility() &&
              editor.getLayoutInfo().width > 100 &&
              editor.getLayoutInfo().height > 50,
          );
      const previousPath = activeEditor()?.getModel()?.uri.toString();
      globalThis.__benchPending = new Promise((resolve, reject) => {
        button.addEventListener(
          "click",
          async () => {
            try {
              const start = performance.now();
              performance.mark("action-start");
              let editor;
              await new Promise(requestAnimationFrame);
              while (waitForEditor) {
                editor = activeEditor();
                if (
                  editor &&
                  (!differentPath ||
                    editor.getModel()?.uri.toString() !== previousPath)
                )
                  break;
                if (performance.now() - start > 5000)
                  throw new Error(`Editor not ready: ${targetSelector}`);
                await new Promise(requestAnimationFrame);
              }
              const visible = performance.now();
              if (editor) editor.focus();
              const editable = performance.now();
              const focused = editor?.hasTextFocus() ?? false;
              await new Promise(requestAnimationFrame);
              resolve({
                start,
                visible: visible - start,
                editable: editable - start,
                paintOpportunity: performance.now() - start,
                focused,
              });
            } catch (error) {
              reject(error);
            }
          },
          { once: true, capture: true },
        );
      });
    },
    { selector, expectNewPath, ready },
  );
  await page.locator(selector).click();
  const result = await page.evaluate(() => globalThis.__benchPending);
  await sleep(page);
  const after = await performanceMetrics(session);
  const snapshot = await page.evaluate(
    (start) => globalThis.__monacoBench.snapshot(start),
    result.start,
  );
  return { label, ...result, metrics: difference(after, before), snapshot };
};

const type = async (page, session) => {
  const before = await performanceMetrics(session);
  const { start, value } = await page.evaluate(() => {
    const editor = globalThis.__monacoBench
      .editors()
      .find(
        (candidate) =>
          candidate.getDomNode()?.checkVisibility() &&
          candidate.getLayoutInfo().height > 50,
      );
    editor.focus();
    editor.setPosition({ lineNumber: 1, column: 1 });
    editor.pushUndoStop();
    return { start: performance.now(), value: editor.getValue() };
  });
  await page.keyboard.type("// benchmark typing\n", { delay: 5 });
  await sleep(page, 600);
  const snapshot = await page.evaluate(
    (since) => globalThis.__monacoBench.snapshot(since),
    start,
  );
  const after = await performanceMetrics(session);
  const written = await page.evaluate(() =>
    globalThis.__monacoBench
      .editors()
      .find((candidate) => candidate.hasTextFocus())
      ?.getValue(),
  );
  assert.ok(
    written.startsWith("// benchmark typing\n"),
    "real typing must update the document",
  );
  for (let attempt = 0; attempt < 8; attempt++) {
    await page.keyboard.press("Meta+z");
    await sleep(page, 40);
    if (
      (await page.evaluate(() =>
        globalThis.__monacoBench
          .editors()
          .find((candidate) => candidate.hasTextFocus())
          ?.getValue(),
      )) === value
    )
      break;
  }
  assert.equal(
    await page.evaluate(() =>
      globalThis.__monacoBench
        .editors()
        .find((candidate) => candidate.hasTextFocus())
        ?.getValue(),
    ),
    value,
    "undo must preserve the original document",
  );
  return {
    label: "typing",
    start,
    metrics: difference(after, before),
    snapshot,
  };
};

const prepareFull = async (page) => {
  await page
    .getByRole("button", { name: "Collapse sidebar", exact: true })
    .click();
  await page.getByRole("button", { name: "Fit view", exact: true }).click();
  await sleep(page);
  const source = page.locator(".react-flow__node").filter({
    has: page.getByText(model === "satellites" ? "Space" : "InboundShipments", {
      exact: true,
    }),
  });
  await source.hover();
  await page
    .getByRole("button", { name: "Show state visualizer", exact: true })
    .evaluate((element) => element.click());
  await page.waitForFunction(() =>
    document.querySelector("[data-visualizer-scene] > svg"),
  );
  await page.locator("[data-visualizer-scene] > svg").hover();
  await sleep(page, 150);
};

try {
  for (let sample = 0; sample < samples; sample++) {
    // Rotate order so later variants do not consistently receive a warmer or busier host.
    const order = variants
      .slice(sample % variants.length)
      .concat(variants.slice(0, sample % variants.length));
    for (const variant of order) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      page.setDefaultTimeout(8000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.addInitScript(instrument);
      const session = await context.newCDPSession(page);
      await session.send("Performance.enable");
      if (args.cpu)
        await session.send("Emulation.setCPUThrottlingRate", {
          rate: Number(args.cpu),
        });
      const url = `${origin}/benchmarks/monaco-performance/bench.html?surface=${surface}&model=${model}&variant=${variant}`;
      try {
        await page.goto(url);
        if (surface === "micro")
          await page.locator('[data-bench-action="open"]').waitFor();
        else
          await page
            .getByRole("button", { name: "Fit view", exact: true })
            .waitFor();
        const appReady = await page.evaluate(() => performance.now());
        await page.waitForFunction(
          () => globalThis.__monacoBench.monaco() !== undefined,
        );
        await page.evaluate(() => document.fonts.ready);
        await sleep(page, 350);
        if (variant === "no-has") {
          await page.evaluate(() => {
            const removeHas = (sheet) => {
              for (let index = sheet.cssRules.length - 1; index >= 0; index--) {
                const rule = sheet.cssRules[index];
                if (rule.selectorText?.includes(":has("))
                  sheet.deleteRule(index);
                else if (rule.cssRules) removeHas(rule);
              }
            };
            for (const sheet of document.styleSheets) removeHas(sheet);
          });
        }
        const startup = await page.evaluate(() =>
          globalThis.__monacoBench.snapshot(),
        );
        if (surface !== "micro") await prepareFull(page);
        if (args.trace) {
          await session.send("Profiler.enable");
          await session.send("Profiler.start");
          await session.send("Tracing.start", {
            categories:
              "devtools.timeline,v8,blink.user_timing,disabled-by-default-devtools.timeline",
            transferMode: "ReturnAsStream",
          });
        }
        const openSelector =
          surface === "micro"
            ? '[data-bench-action="open"]'
            : 'button[aria-label="Edit visualizer code"]';
        const measurements = [
          await measure(page, session, "first-open", openSelector),
        ];
        if (surface === "micro") {
          await measure(page, session, "close", openSelector, { ready: false });
          measurements.push(
            await measure(page, session, "warm-reopen", openSelector),
          );
          measurements.push(
            await measure(
              page,
              session,
              "switch-document",
              '[data-bench-action="switch"]',
              { expectNewPath: true },
            ),
          );
          measurements.push(
            await measure(
              page,
              session,
              "resize",
              '[data-bench-action="resize"]',
            ),
          );
        } else {
          await page.locator("[data-restore-subview]").click();
          await sleep(page);
          const section = page.locator('[data-subview-id="place-visualizer"]');
          const toggle = section.locator("[data-toggle-subview]");
          if ((await toggle.getAttribute("aria-expanded")) === "true") {
            await toggle.click();
            await sleep(page);
          }
          measurements.push(
            await measure(
              page,
              session,
              "warm-reopen",
              '[data-subview-id="place-visualizer"] [data-toggle-subview]',
            ),
          );
          measurements.push(
            await measure(
              page,
              session,
              "fullscreen",
              '[data-subview-id="place-visualizer"] [data-expand-subview]',
            ),
          );
        }
        measurements.push(await type(page, session));
        if (surface !== "micro") {
          await page
            .getByRole("button", { name: "Run simulation", exact: true })
            .click();
          await sleep(page, 600);
          measurements.push({
            ...(await type(page, session)),
            label: "typing-simulation",
          });
        }
        if (args.trace) {
          const { profile } = await session.send("Profiler.stop");
          await writeFile(
            `${output}/${variant}-${sample}.cpuprofile`,
            JSON.stringify(profile),
          );
          const completed = new Promise((resolve) =>
            session.once("Tracing.tracingComplete", resolve),
          );
          await session.send("Tracing.end");
          const { stream } = await completed;
          let trace = "";
          for (;;) {
            const chunk = await session.send("IO.read", { handle: stream });
            trace += chunk.data;
            if (chunk.eof) break;
          }
          await session.send("IO.close", { handle: stream });
          await writeFile(`${output}/${variant}-${sample}.trace.json`, trace);
        }
        await session.send("HeapProfiler.collectGarbage");
        const memory = await session.send("Runtime.getHeapUsage");
        const final = await page.evaluate(() =>
          globalThis.__monacoBench.snapshot(),
        );
        assert.deepEqual(errors, []);
        const row = {
          sample,
          variant,
          surface,
          model,
          origin,
          cpuThrottle: Number(args.cpu ?? 1),
          browser: browser.version(),
          appReady,
          startup,
          measurements,
          memory,
          final,
        };
        rows.push(row);
        await writeFile(
          `${output}/${surface}-${model}-${new URL(origin).port}${args.cpu ? `-cpu${args.cpu}` : ""}.json`,
          JSON.stringify(rows),
        );
        console.log(
          JSON.stringify({
            sample,
            variant,
            surface,
            appReady: Math.round(appReady),
            actions: measurements.map((action) => ({
              label: action.label,
              paint: action.paintOpportunity?.toFixed(1),
              create: action.snapshot.records
                .filter((entry) => entry.kind === "create")
                .reduce((total, entry) => total + entry.duration, 0)
                .toFixed(1),
              maxFrame: Math.max(
                ...action.snapshot.frames.map((frame) => frame.duration),
              ).toFixed(1),
            })),
          }),
        );
      } catch (error) {
        await page.screenshot({
          path: `${output}/failure-${variant}-${sample}.png`,
        });
        console.error("PAGE ERRORS", errors);
        throw error;
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}
