// Measures the canvas on a large net: the Supply Chain example tiled into
// about 500 nodes (`copies=12`). For each interaction it reports the
// main-thread time by kind, the frames the page managed to start, and what
// the browser painted, rastered and drew, read from a trace.
//
// The net is measured in two views: `fit`, with every node on screen, and
// `close`, zoomed in to where the labels read.
//
// Usage, from libs/@hashintel/petrinaut, against `vite preview` of the
// benchmark build:
//   node benchmarks/monaco-performance/canvas-scale.mjs origin=http://127.0.0.1:6027 copies=12 samples=3
//
// React commit and render counts need the profiling build
// (BENCH_REACT_PROFILING=true), and component names an unminified one (see
// render-counts.mjs). `details=1` prints who rendered for each interaction.
import { mkdir, writeFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";

import { chromium } from "playwright";

import { args, median, modelQuery, origin } from "./cli.mjs";
import { instrument } from "./instrument.mjs";
import { nextFrame, observe } from "./observe.mjs";

const copies = Number(args.copies ?? 12);
const samples = Number(args.samples ?? 3);
const views = (args.views ?? "fit,close").split(",");
const output = resolvePath(
  args.output ?? new URL("./results", import.meta.url).pathname,
);
await mkdir(output, { recursive: true });

/** Runs `run` under a trace and returns its result with the trace's events. */
const traced = async (session, run) => {
  const events = [];
  const collect = ({ value }) => events.push(...value);
  session.on("Tracing.dataCollected", collect);
  await session.send("Tracing.start", {
    transferMode: "ReportEvents",
    traceConfig: {
      includedCategories: [
        "devtools.timeline",
        "disabled-by-default-devtools.timeline",
        "disabled-by-default-devtools.timeline.frame",
        "blink.user_timing",
      ],
    },
  });
  const result = await run();
  const done = new Promise((resolve) =>
    session.once("Tracing.tracingComplete", resolve),
  );
  await session.send("Tracing.end");
  await done;
  session.off("Tracing.dataCollected", collect);
  return { result, events };
};

/**
 * What the browser did between the `gesture-start` and `gesture-end` marks:
 * time painting and rastering, and the frames it drew.
 */
const drawn = (events) => {
  const mark = (name) => events.find((event) => event.name === name);
  const start = mark("gesture-start");
  const end = mark("gesture-end");
  if (!start || !end) {
    return {};
  }
  const within = events.filter(
    (event) =>
      event.pid === start.pid && event.ts >= start.ts && event.ts <= end.ts,
  );
  const total = (names) =>
    within
      .filter((event) => event.ph === "X" && names.includes(event.name))
      .reduce((sum, event) => sum + event.dur, 0) / 1000;
  const draws = within
    .filter((event) => event.name === "DrawFrame")
    .map((event) => event.ts)
    .sort((left, right) => left - right);
  const gaps = draws.slice(1).map((ts, index) => (ts - draws[index]) / 1000);
  return {
    gestureMs: (end.ts - start.ts) / 1000,
    paintMs: total(["Paint", "PrePaint", "Layerize"]),
    rasterMs: total(["RasterTask"]),
    draws: draws.length,
    drawGapMax: Math.max(0, ...gaps),
    drawGapsOver34: gaps.filter((gap) => gap > 34).length,
  };
};

const markGesture = (page, name) =>
  page.evaluate((mark) => performance.mark(mark), name);

/** Centres of the nodes in the middle of the canvas, nearest the middle first. */
const nodeCentres = (page) =>
  page.evaluate(() => {
    const flow = document.querySelector(".react-flow").getBoundingClientRect();
    // Clear of the left sidebar, of the Properties panel that a selection
    // opens, and of the bottom bar.
    const area = {
      left: flow.left + flow.width * 0.24,
      right: flow.left + flow.width * 0.66,
      top: flow.top + flow.height * 0.1,
      bottom: flow.top + flow.height * 0.72,
    };
    const middle = {
      x: (area.left + area.right) / 2,
      y: (area.top + area.bottom) / 2,
    };
    return [...document.querySelectorAll(".react-flow__node")]
      .map((node) => node.getBoundingClientRect())
      .map((box) => ({
        x: box.left + box.width / 2,
        y: box.top + box.height / 2,
      }))
      .filter(
        (point) =>
          point.x > area.left &&
          point.x < area.right &&
          point.y > area.top &&
          point.y < area.bottom,
      )
      .sort(
        (left, right) =>
          Math.hypot(left.x - middle.x, left.y - middle.y) -
          Math.hypot(right.x - middle.x, right.y - middle.y),
      );
  });

/** Two nodes to act on. Zoomed in, the middle of the canvas may hold one. */
const nodesInView = async (page) => {
  const [first, second = first] = await nodeCentres(page);
  if (!first) {
    throw new Error("No node in the middle of the canvas to act on");
  }
  return [first, second];
};

/** A point of the canvas with nothing on it, to drag the canvas by. */
const emptyPoint = (page) =>
  page.evaluate(() => {
    const flow = document.querySelector(".react-flow").getBoundingClientRect();
    for (let row = 3; row < 9; row++) {
      for (let column = 4; column < 9; column++) {
        const x = flow.left + (flow.width * column) / 12;
        const y = flow.top + (flow.height * row) / 12;
        if (
          document
            .elementFromPoint(x, y)
            ?.classList.contains("react-flow__pane")
        ) {
          return { x, y };
        }
      }
    }
    return null;
  });

const scaleOf = (page) =>
  page.evaluate(
    () =>
      new DOMMatrix(
        getComputedStyle(document.querySelector(".react-flow__viewport"))
          .transform,
      ).a,
  );

const browser = await chromium.launch({ headless: true });
const rows = [];
const loads = [];
try {
  for (let sample = 0; sample < samples; sample++) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(instrument);
    const session = await context.newCDPSession(page);
    await session.send("Performance.enable");
    if (args.cpu) {
      await session.send("Emulation.setCPUThrottlingRate", {
        rate: Number(args.cpu),
      });
    }
    try {
      const startedAt = Date.now();
      await page.goto(
        `${origin}/benchmarks/monaco-performance/bench.html?surface=full&${modelQuery}&variant=prototype&copies=${copies}`,
      );
      await page
        .getByRole("button", { name: "Fit view", exact: true })
        .waitFor();
      await page.locator(".react-flow__node").first().waitFor();
      const readyMs = Date.now() - startedAt;
      await page.waitForFunction(
        () => globalThis.__monacoBench.monaco() !== undefined,
      );
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(1500);
      const metrics = Object.fromEntries(
        (await session.send("Performance.getMetrics")).metrics.map((metric) => [
          metric.name,
          metric.value,
        ]),
      );
      loads.push({
        sample,
        readyMs,
        scriptMs: metrics.ScriptDuration * 1000,
        styleMs: metrics.RecalcStyleDuration * 1000,
        layoutMs: metrics.LayoutDuration * 1000,
        heapMb: metrics.JSHeapUsedSize / 1e6,
        ...(await page.evaluate(() => ({
          elements: document
            .querySelector(".petrinaut-root")
            .querySelectorAll("*").length,
          nodes: document.querySelectorAll(".react-flow__node").length,
          edges: document.querySelectorAll(".react-flow__edge[aria-label]")
            .length,
        }))),
      });

      // A button is found before the measurement starts: finding it by role
      // reads the style of every candidate, which would count as the work of
      // the interaction. The click is made from the page: Playwright's own
      // click first scrolls its target into view.
      const press = async (name) => {
        const button = await page
          .getByRole("button", { name, exact: true })
          .elementHandle();
        return () => button.evaluate((element) => element.click());
      };
      const measure = async (view, label, gesture, settle = 600) => {
        const { result, events } = await traced(session, () =>
          observe(
            page,
            session,
            label,
            async () => {
              await markGesture(page, "gesture-start");
              await gesture();
              await page.waitForTimeout(120);
              await markGesture(page, "gesture-end");
            },
            settle,
          ),
        );
        rows.push({ sample, view, ...result, ...drawn(events), errors });
      };
      /** One pointer or wheel step per frame, as a hand does. */
      const steps = async (count, step) => {
        for (let index = 1; index <= count; index++) {
          await step(index);
          await nextFrame(page);
        }
      };

      for (const view of views) {
        if (view === "fit") {
          await (
            await press("Fit view")
          )();
        } else {
          // Zoom in on the middle of the canvas until the labels read.
          const flow = await page.locator(".react-flow").boundingBox();
          await page.mouse.move(
            flow.x + flow.width * 0.45,
            flow.y + flow.height * 0.4,
          );
          for (let turn = 0; turn < 40 && (await scaleOf(page)) < 0.9; turn++) {
            await page.mouse.wheel(0, -160);
            await nextFrame(page);
          }
        }
        await page.waitForTimeout(900);
        const scale = await scaleOf(page);

        let [first, second] = await nodesInView(page);
        await measure(view, "select", () => page.mouse.click(first.x, first.y));
        // Selecting opens the Properties panel and may move the camera.
        [first, second] = await nodesInView(page);
        await measure(view, "select-next", () =>
          page.mouse.click(second.x, second.y),
        );

        [first, second] = await nodesInView(page);
        await measure(view, "hover", async () => {
          await page.mouse.move(first.x, first.y, { steps: 3 });
          await page.waitForTimeout(450);
          await page.mouse.move(second.x, second.y, { steps: 3 });
          await page.waitForTimeout(450);
        });

        [first] = await nodesInView(page);
        await measure(view, "drag-node", async () => {
          await page.mouse.move(first.x, first.y);
          await page.mouse.down();
          await steps(24, (index) =>
            page.mouse.move(first.x + index * 5, first.y + index * 3),
          );
          await page.mouse.up();
        });

        const grip = await emptyPoint(page);
        if (grip) {
          await measure(view, "pan", async () => {
            await page.mouse.move(grip.x, grip.y);
            await page.mouse.down();
            await steps(30, (index) =>
              page.mouse.move(grip.x - index * 9, grip.y - index * 5),
            );
            await page.mouse.up();
          });
        }

        const flow = await page.locator(".react-flow").boundingBox();
        await page.mouse.move(
          flow.x + flow.width * 0.45,
          flow.y + flow.height * 0.4,
        );
        await measure(view, "zoom", async () => {
          await steps(10, () => page.mouse.wheel(0, -80));
          await steps(10, () => page.mouse.wheel(0, 80));
        });

        await measure(view, "open-panel", await press("Show panel"));
        await measure(view, "close-panel", await press("Hide panel"));
        const pane = await emptyPoint(page);
        if (pane) {
          await measure(view, "deselect", () =>
            page.mouse.click(pane.x, pane.y),
          );
        }
        for (const row of rows) {
          if (row.sample === sample && row.view === view) {
            row.scale = scale;
          }
        }
      }
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

await writeFile(
  `${output}/canvas-scale-${args.modelUrl ? "file" : "x"}${copies}-${new URL(origin).port}${args.cpu ? `-cpu${args.cpu}` : ""}.json`,
  JSON.stringify({ loads, rows }, null, 1),
);

const round = (value) => Math.round(value * 10) / 10;
const medianOf = (entries, key) =>
  round(median(entries.map((entry) => entry[key])));

console.log(
  `load x${copies}: ready ${medianOf(loads, "readyMs")} ms, script ${medianOf(loads, "scriptMs")} ms, style ${medianOf(loads, "styleMs")} ms, layout ${medianOf(loads, "layoutMs")} ms, heap ${medianOf(loads, "heapMb")} MB, elements ${medianOf(loads, "elements")}, nodes ${medianOf(loads, "nodes")}, edges ${medianOf(loads, "edges")}`,
);
const columns = [
  ["scriptMs", "script"],
  ["styleMs", "style"],
  ["layoutMs", "layout"],
  ["paintMs", "paint"],
  ["rasterMs", "raster"],
  ["frameMax", "fMax"],
  ["framesOver20", ">20ms"],
  ["draws", "draws"],
  ["drawGapMax", "gapMax"],
  ["reactCommits", "commits"],
  ["componentRenders", "renders"],
];
console.log(
  ["view", "action", ...columns.map(([, title]) => title)].join("\t"),
);
for (const view of views) {
  const labels = [
    ...new Set(rows.filter((row) => row.view === view).map((row) => row.label)),
  ];
  for (const label of labels) {
    const entries = rows.filter(
      (row) => row.view === view && row.label === label,
    );
    console.log(
      [
        `${view}@${round(median(entries.map((entry) => entry.scale)))}`,
        label.padEnd(12),
        ...columns.map(([key]) => medianOf(entries, key)),
      ].join("\t"),
    );
    if (args.details && entries[0]) {
      const list = (title, pairs) =>
        console.log(
          `    ${title}: ${(pairs ?? [])
            .slice(0, Number(args.top ?? 12))
            .map(([name, count]) => `${name} ${count}`)
            .join(", ")}`,
        );
      list("rendered", entries[0].renders);
      list("renders below each starter", entries[0].rendersBelowStarters);
      list("new context values", entries[0].newContextValues);
    }
  }
}
const failures = [...new Set(rows.flatMap((row) => row.errors))];
if (failures.length) {
  console.log("page errors:", failures.slice(0, 3));
}
