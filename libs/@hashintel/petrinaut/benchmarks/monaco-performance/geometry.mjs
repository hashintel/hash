// Measures what a change of panel geometry costs with a code editor open:
// a width drag of the Properties panel, a height drag between two sections,
// and maximize, restore, collapse and expand of the Visualizer section.
//
// React commit counts and render time need the profiling build
// (BENCH_REACT_PROFILING=true, port 6028); they read 0 on the production build.
import { mkdir, writeFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";

import { chromium } from "playwright";

import { instrument } from "./instrument.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((argument) => argument.split("=")),
);
const origin = args.origin ?? "http://127.0.0.1:6027";
const model = args.model ?? "supply-chain";
const samples = Number(args.samples ?? 3);
const steps = Number(args.steps ?? 60);
const output = resolvePath(
  args.output ?? new URL("./results", import.meta.url).pathname,
);
await mkdir(output, { recursive: true });

const metricsOf = async (session) =>
  Object.fromEntries(
    (await session.send("Performance.getMetrics")).metrics.map((metric) => [
      metric.name,
      metric.value,
    ]),
  );
const nextFrame = (page) =>
  page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));

const quantile = (values, fraction) => {
  const sorted = [...values].sort((left, right) => left - right);
  if (!sorted.length) return 0;
  return sorted[
    Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))
  ];
};

/** Runs `action`, then reports main-thread totals and frame gaps for its window. */
const observe = async (page, session, label, action, settle = 350) => {
  await page.waitForTimeout(200);
  const before = await metricsOf(session);
  const start = await page.evaluate(() => {
    performance.clearMeasures();
    globalThis.__editorLayoutChanges = 0;
    for (const editor of globalThis.__monacoBench.editors()) {
      if (editor.__geometryObserved) continue;
      editor.__geometryObserved = true;
      editor.onDidLayoutChange(() => globalThis.__editorLayoutChanges++);
    }
    return performance.now();
  });
  await action();
  await page.waitForTimeout(settle);
  const after = await metricsOf(session);
  const snapshot = await page.evaluate(
    (since) => globalThis.__monacoBench.snapshot(since),
    start,
  );
  const frames = snapshot.frames.map((frame) => frame.duration);
  // `toJSON()` drops a measure's detail, so read the Profiler timings in the page.
  const { react, editorLayoutChanges } = await page.evaluate(
    (since) => ({
      react: performance
        .getEntriesByType("measure")
        .filter(
          (entry) =>
            entry.name.startsWith("react:") && entry.startTime >= since,
        )
        .map((entry) => ({
          wall: entry.duration,
          actual: entry.detail?.actualDuration ?? 0,
        })),
      editorLayoutChanges: globalThis.__editorLayoutChanges,
    }),
    start,
  );
  const ms = (name) => (after[name] - before[name]) * 1000;
  return {
    label,
    windowMs: snapshot.now - start,
    frames: frames.length,
    frameMedian: quantile(frames, 0.5),
    frameP95: quantile(frames, 0.95),
    frameMax: Math.max(0, ...frames),
    // Where in the window the longest frame fell, from 0 (start) to 1 (end).
    frameMaxAt: frames.indexOf(Math.max(0, ...frames)) / frames.length,
    framesOver12: frames.filter((duration) => duration > 12).length,
    framesOver20: frames.filter((duration) => duration > 20).length,
    scriptMs: ms("ScriptDuration"),
    styleMs: ms("RecalcStyleDuration"),
    layoutMs: ms("LayoutDuration"),
    taskMs: ms("TaskDuration"),
    styleCount: after.RecalcStyleCount - before.RecalcStyleCount,
    layoutCount: after.LayoutCount - before.LayoutCount,
    editorLayouts: editorLayoutChanges,
    reactCommits: react.length,
    reactRenderMs: react.reduce((total, entry) => total + entry.actual, 0),
    reactWallMs: react.reduce((total, entry) => total + entry.wall, 0),
  };
};

/** One pointer move per animation frame, so each move gets its own frame. */
const drag = async (page, from, to, count = steps) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let index = 1; index <= count; index++) {
    const progress = index / count;
    await page.mouse.move(
      from.x + (to.x - from.x) * progress,
      from.y + (to.y - from.y) * progress,
    );
    await nextFrame(page);
  }
  await page.mouse.up();
};
const center = async (locator) => {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Missing bounding box");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

const browser = await chromium.launch({ headless: true });
const rows = [];
try {
  for (let sample = 0; sample < samples; sample++) {
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
    try {
      await page.goto(
        `${origin}/benchmarks/monaco-performance/bench.html?surface=full&model=${model}&variant=prototype`,
      );
      await page
        .getByRole("button", { name: "Fit view", exact: true })
        .waitFor();
      await page.waitForFunction(
        () => globalThis.__monacoBench.monaco() !== undefined,
      );
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(350);
      await page
        .getByRole("button", { name: "Collapse sidebar", exact: true })
        .click();
      await page.getByRole("button", { name: "Fit view", exact: true }).click();
      await page.waitForTimeout(450);
      const source = page.locator(".react-flow__node").filter({
        has: page.getByText(
          model === "satellites" ? "Space" : "InboundShipments",
          { exact: true },
        ),
      });
      await source.hover();
      await page
        .getByRole("button", { name: "Show state visualizer", exact: true })
        .evaluate((element) => element.click());
      await page.waitForFunction(() =>
        document.querySelector("[data-visualizer-scene] > svg"),
      );
      await page.locator("[data-visualizer-scene] > svg").hover();
      await page.waitForTimeout(150);
      await page.locator('button[aria-label="Edit visualizer code"]').click();
      await page.waitForFunction(() =>
        globalThis.__monacoBench
          .editors()
          .some(
            (editor) =>
              globalThis.__monacoBench.isReady(editor) &&
              editor.getDomNode()?.checkVisibility(),
          ),
      );
      await page.waitForTimeout(600);
      // Opening routes to the maximized section; go back to the stacked layout.
      const restore = page.locator("[data-restore-subview]");
      if (await restore.count()) {
        await restore.first().click();
        await page.waitForTimeout(500);
      }

      const section = page.locator('[data-subview-id="place-visualizer"]');
      const measurements = [];
      measurements.push(
        await observe(page, session, "idle", () => page.waitForTimeout(500), 0),
      );

      // Width drag of the panel that holds the section.
      const edgeHandle = page
        .locator('button[data-resize-edge="left"]')
        .filter({ visible: true })
        .last();
      const edge = await center(edgeHandle);
      measurements.push(
        await observe(page, session, "panel-width-drag", async () => {
          await drag(page, edge, { x: edge.x - 300, y: edge.y });
        }),
      );
      const widened = await center(edgeHandle);
      measurements.push(
        await observe(page, session, "panel-width-drag-back", async () => {
          await drag(page, widened, { x: widened.x + 300, y: widened.y });
        }),
      );

      // Height drag of the separator directly above the Visualizer section.
      const separatorPoint = await section.evaluate((element) => {
        const panel = element.closest("[data-panel]");
        let node = panel?.previousElementSibling;
        while (node && !node.matches("[data-separator]"))
          node = node.previousElementSibling;
        const box = node?.getBoundingClientRect();
        return box
          ? { x: box.left + box.width / 2, y: box.top + box.height / 2 }
          : null;
      });
      if (separatorPoint) {
        measurements.push(
          await observe(page, session, "section-height-drag", async () => {
            await drag(page, separatorPoint, {
              x: separatorPoint.x,
              y: separatorPoint.y - 150,
            });
          }),
        );
      }

      measurements.push(
        await observe(page, session, "maximize", () =>
          section.locator("[data-expand-subview]").click(),
        ),
      );
      measurements.push(
        await observe(page, session, "restore", () =>
          page.locator("[data-restore-subview]").first().click(),
        ),
      );
      measurements.push(
        await observe(page, session, "collapse", () =>
          section.locator("[data-toggle-subview]").click(),
        ),
      );
      measurements.push(
        await observe(page, session, "expand", () =>
          section.locator("[data-toggle-subview]").click(),
        ),
      );
      if (errors.length) throw new Error(`Page errors: ${errors.join("; ")}`);
      rows.push({
        sample,
        model,
        origin,
        cpu: Number(args.cpu ?? 1),
        measurements,
      });
      console.log(
        JSON.stringify({
          sample,
          actions: measurements.map((entry) => ({
            label: entry.label,
            frames: entry.frames,
            max: entry.frameMax.toFixed(1),
            maxAt: entry.frameMaxAt.toFixed(2),
            over12: entry.framesOver12,
            script: entry.scriptMs.toFixed(0),
            style: entry.styleMs.toFixed(0),
            layout: entry.layoutMs.toFixed(0),
            editorLayouts: entry.editorLayouts,
            commits: entry.reactCommits,
            render: entry.reactRenderMs.toFixed(0),
          })),
        }),
      );
    } catch (error) {
      await page.screenshot({ path: `${output}/failure-${sample}.png` });
      console.error("PAGE ERRORS", errors);
      throw error;
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  await writeFile(
    `${output}/geometry-${model}-${new URL(origin).port}${args.cpu ? `-cpu${args.cpu}` : ""}.json`,
    JSON.stringify(rows, null, 1),
  );
}
