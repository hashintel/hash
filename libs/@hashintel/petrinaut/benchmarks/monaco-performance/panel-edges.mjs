// Measures what moving the pointer across the edge of a docked panel costs:
// the style the browser works out again, the elements that takes, and the
// longest gap between two frames. It also counts the style rules a script
// writes meanwhile. `ResizeGroup` keeps that count at zero: a rule written
// per crossing is the resize library's cursor for every element of the page.
//
// The net is the Supply Chain example tiled into about 500 nodes
// (`copies=12`), with the left sidebar and the bottom panel open. A third
// path stays inside the canvas, for comparison: it crosses no edge, and what
// it costs is the hover of the nodes it passes.
//
// Usage, from libs/@hashintel/petrinaut, against `vite preview` of the
// benchmark build:
//   node benchmarks/monaco-performance/panel-edges.mjs origin=http://127.0.0.1:6027 copies=12 samples=5
import { chromium } from "playwright";

import { args, median, modelQuery, origin } from "./cli.mjs";
import { nextFrame } from "./observe.mjs";

const copies = Number(args.copies ?? 12);
const samples = Number(args.samples ?? 5);
const crossings = Number(args.crossings ?? 10);

/** Counts the rules written to any style sheet, and the frames the page starts. */
const watchPage = () => {
  globalThis.__ruleWrites = 0;
  for (const method of ["insertRule", "deleteRule", "replaceSync"]) {
    const original = CSSStyleSheet.prototype[method];
    CSSStyleSheet.prototype[method] = function write(...parameters) {
      globalThis.__ruleWrites += 1;
      return original.apply(this, parameters);
    };
  }
  globalThis.__frames = [];
  const tick = (time) => {
    globalThis.__frames.push(time);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

/** Runs `run` under a trace and returns the style recalculations in it. */
const styleIn = async (session, run) => {
  const events = [];
  const collect = ({ value }) => events.push(...value);
  session.on("Tracing.dataCollected", collect);
  await session.send("Tracing.start", {
    transferMode: "ReportEvents",
    traceConfig: { includedCategories: ["devtools.timeline"] },
  });
  await run();
  const done = new Promise((resolve) =>
    session.once("Tracing.tracingComplete", resolve),
  );
  await session.send("Tracing.end");
  await done;
  session.off("Tracing.dataCollected", collect);
  const recalculations = events.filter(
    (event) => event.name === "UpdateLayoutTree" && event.ph === "X",
  );
  return {
    styleMs: recalculations.reduce((sum, event) => sum + event.dur, 0) / 1000,
    elements: recalculations.reduce(
      (sum, event) => sum + (event.args?.elementCount ?? 0),
      0,
    ),
  };
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.addInitScript(watchPage);
await page.goto(
  `${origin}/benchmarks/monaco-performance/bench.html?surface=full&${modelQuery}&copies=${copies}`,
);
await page.getByRole("button", { name: "Fit view", exact: true }).waitFor();
await page.locator(".react-flow__node").first().waitFor();
await page
  .getByRole("button", { name: "Show panel", exact: true })
  .evaluate((element) => element.click());
await page.waitForTimeout(2500);
const session = await page.context().newCDPSession(page);

const edgeOf = async (name) => {
  const box = await page.getByRole("separator", { name }).boundingBox();
  return { x: Math.round(box.x), y: Math.round(box.y) };
};
const sidebar = await edgeOf("Resize the left sidebar");
const bottom = await edgeOf("Resize the bottom panel");

/** The pointer's paths: each goes from one point to the other and back. */
const paths = {
  "across the left sidebar's edge": [
    { x: sidebar.x - 60, y: 400 },
    { x: sidebar.x + 60, y: 400 },
  ],
  "across the bottom panel's edge": [
    { x: 700, y: bottom.y - 60 },
    { x: 700, y: bottom.y + 60 },
  ],
  "inside the canvas, across no edge": [
    { x: sidebar.x + 200, y: 400 },
    { x: sidebar.x + 320, y: 400 },
  ],
};

const measure = async ([from, to]) => {
  await page.mouse.move(from.x, from.y);
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => ({
    ruleWrites: globalThis.__ruleWrites,
    frames: globalThis.__frames.length,
  }));
  const style = await styleIn(session, async () => {
    for (let crossing = 0; crossing < crossings; crossing++) {
      const target = crossing % 2 === 0 ? to : from;
      await page.mouse.move(target.x, target.y, { steps: 8 });
      await page.waitForTimeout(60);
    }
    await nextFrame(page);
  });
  const after = await page.evaluate((firstFrame) => {
    const frames = globalThis.__frames.slice(firstFrame);
    return {
      ruleWrites: globalThis.__ruleWrites,
      longestFrameMs: Math.max(
        0,
        ...frames.slice(1).map((time, index) => time - frames[index]),
      ),
    };
  }, before.frames);
  return {
    ...style,
    longestFrameMs: after.longestFrameMs,
    ruleWrites: after.ruleWrites - before.ruleWrites,
  };
};

const rows = Object.fromEntries(Object.keys(paths).map((name) => [name, []]));
for (let sample = 0; sample < samples; sample++) {
  for (const [name, path] of Object.entries(paths)) {
    rows[name].push(await measure(path));
  }
}
await browser.close();

console.log(
  `${origin}, ${modelQuery}, copies ${copies}: ${crossings} crossings, median of ${samples} (min..max)`,
);
for (const [name, list] of Object.entries(rows)) {
  const cell = (key, unit) => {
    const values = list.map((entry) => entry[key]);
    return `${Math.round(median(values))}${unit} (${Math.round(Math.min(...values))}..${Math.round(Math.max(...values))})`;
  };
  console.log(
    `${name}: style ${cell("styleMs", " ms")}, elements restyled ${cell("elements", "")}, longest frame ${cell("longestFrameMs", " ms")}, style rules written ${cell("ruleWrites", "")}`,
  );
}
