// Measures what a user waits for when a docked panel opens or closes: the
// left sidebar, the Properties panel through a selection, and the bottom
// panel on each of its tabs. A closed panel is not mounted, so each opening
// mounts the panel's content.
//
// For each action the script reports, from the press:
//   drawn    ms to the first frame that shows the panel (for a close, the
//            first frame in which it has moved)
//   done     ms to the frame from which the panel's content stays the same
//            (for a close, the frame in which the panel is gone)
//   empty    frames that showed the panel before its content was complete
//   fMax     the longest frame, in ms
//   renders  component renders, on the profiling build only
//
// It reads the page after each frame is drawn, so a value Motion writes in a
// frame counts for that frame. Times depend on the machine: compare two
// builds in alternating rounds. `timeline=1` also runs a simulation and
// opens the panel on its Timeline, `reduced=1` asks for reduced motion, and
// `details=1` lists the components that rendered most.
//
// node benchmarks/monaco-performance/panel-mount.mjs origin=http://127.0.0.1:6027 copies=12 samples=5
import { mkdir, writeFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";

import { chromium } from "playwright";

import { instrument } from "./instrument.mjs";
import { metricsOf } from "./observe.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((argument) => argument.split("=")),
);
const origin = args.origin ?? "http://127.0.0.1:6027";
const copies = Number(args.copies ?? 1);
const samples = Number(args.samples ?? 3);
const output = resolvePath(
  args.output ?? new URL("./results", import.meta.url).pathname,
);
await mkdir(output, { recursive: true });

// A docked panel is the absolutely placed box with a border on its inner edge.
const panels = {
  left: "div.pos_absolute.bd-r-w_thin",
  properties: "div.pos_absolute.bd-l-w_thin",
  bottom: "div.pos_absolute.bd-t-w_thin",
};

/** Runs in the page: follows one panel frame by frame from the next input. */
const installTracker = () => {
  const afterFrame = new MessageChannel();
  let tracked = null;
  // How far the panel is in view, from the transform its slide writes.
  const shownOf = (panel) => {
    const offset = /([\d.eE+-]+)%/.exec(panel.style.transform);
    return offset ? 1 - Math.abs(Number(offset[1])) / 100 : 1;
  };
  // A message posted from a frame callback arrives once that frame is drawn.
  afterFrame.port1.onmessage = () => {
    if (!tracked) return;
    const panel = document.querySelector(tracked.selector);
    tracked.frames.push({
      time: performance.now(),
      present: panel !== null,
      shown: panel ? shownOf(panel) : 0,
      content: panel
        ? `${panel.getElementsByTagName("*").length}:${panel.textContent.length}`
        : "",
    });
  };
  const onFrame = () => {
    if (!tracked) return;
    afterFrame.port2.postMessage(null);
    requestAnimationFrame(onFrame);
  };
  const onInput = () => {
    if (tracked) tracked.pressed ??= performance.now();
  };
  for (const type of ["pointerdown", "keydown", "click"]) {
    window.addEventListener(type, onInput, true);
  }
  globalThis.__panelMount = {
    follow(selector) {
      tracked = { selector, pressed: null, frames: [] };
      requestAnimationFrame(onFrame);
    },
    stop() {
      const result = tracked;
      tracked = null;
      return result;
    },
  };
};

const timesOf = ({ pressed, frames }, opening) => {
  const since = frames.filter((frame) => frame.time >= pressed);
  const last = since.at(-1);
  let settledAt = since.length - 1;
  while (
    settledAt > 0 &&
    since[settledAt - 1].content === last.content &&
    since[settledAt - 1].present === last.present
  ) {
    settledAt--;
  }
  const drawnAt = since.findIndex((frame) =>
    opening
      ? frame.present && frame.shown > 0
      : !frame.present || frame.shown < 1,
  );
  const doneAt = Math.max(settledAt, drawnAt);
  const gaps = since.map((frame, at) =>
    at === 0 ? frame.time - pressed : frame.time - since[at - 1].time,
  );
  const duringSlide = gaps.filter((_, at) => since[at].time - pressed < 700);
  return {
    drawn: drawnAt < 0 ? null : since[drawnAt].time - pressed,
    done: since[doneAt].time - pressed,
    empty: doneAt - Math.max(drawnAt, 0),
    fMax: Math.max(...duringSlide),
    over20: duringSlide.filter((gap) => gap > 20).length,
  };
};

const browser = await chromium.launch({ headless: true });
const rows = [];
try {
  for (let sample = 0; sample < samples; sample++) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
      ...(args.reduced ? { reducedMotion: "reduce" } : {}),
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(instrument);
    await page.addInitScript(installTracker);
    const session = await context.newCDPSession(page);
    await session.send("Performance.enable");
    try {
      await page.goto(
        `${origin}/benchmarks/monaco-performance/bench.html?surface=full&model=supply-chain&copies=${copies}`,
      );
      await page
        .getByRole("button", { name: "Fit view", exact: true })
        .waitFor();
      await page.waitForFunction(
        () => globalThis.__monacoBench.monaco() !== undefined,
      );
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(copies > 1 ? 2500 : 1200);

      const measurements = [];
      const measure = async (name, panel, opening, action) => {
        await page.waitForTimeout(300);
        const before = await metricsOf(session);
        const start = await page.evaluate((selector) => {
          globalThis.__panelMount.follow(selector);
          return performance.now();
        }, panels[panel]);
        await page.waitForTimeout(50);
        await action();
        await page.waitForTimeout(1100);
        const after = await metricsOf(session);
        const { tracked, snapshot } = await page.evaluate(
          (since) => ({
            tracked: globalThis.__panelMount.stop(),
            snapshot: globalThis.__monacoBench.snapshot(since),
          }),
          start,
        );
        const ms = (key) => (after[key] - before[key]) * 1000;
        measurements.push({
          name,
          ...timesOf(tracked, opening),
          styleMs: ms("RecalcStyleDuration"),
          layoutMs: ms("LayoutDuration"),
          renders: snapshot.renders.reduce(
            (total, [, count]) => total + count,
            0,
          ),
          topRenders: snapshot.renders.slice(0, 16),
        });
      };

      // Found before the measurement starts and pressed from the page:
      // finding a button by role reads the style of every candidate, and
      // Playwright's own click scrolls its target into view.
      const press = async (name) => {
        const button = await page
          .getByRole("button", { name, exact: true })
          .elementHandle();
        return () => button.evaluate((element) => element.click());
      };
      const pressNow = async (name) => (await press(name))();
      const nodeCentre = async (label) => {
        const box = await page
          .locator(".react-flow__node")
          .filter({ has: page.getByText(label, { exact: true }) })
          .first()
          .boundingBox();
        return [box.x + box.width / 2, box.y + box.height / 2];
      };
      const escape = () => page.keyboard.press("Escape");

      const place = await nodeCentre("RawMaterials");
      const transition = await nodeCentre("Start production batch");
      await measure("select a place", "properties", true, () =>
        page.mouse.click(...place),
      );
      await measure("deselect it", "properties", false, escape);
      await measure("select a transition", "properties", true, () =>
        page.mouse.click(...transition),
      );
      await measure("deselect it", "properties", false, escape);

      await measure(
        "close the sidebar",
        "left",
        false,
        await press("Collapse sidebar"),
      );
      await measure(
        "open the sidebar",
        "left",
        true,
        await press("Expand sidebar"),
      );

      await measure(
        "open on Diagnostics",
        "bottom",
        true,
        await press("Show panel"),
      );
      await measure(
        "close on Diagnostics",
        "bottom",
        false,
        await press("Hide panel"),
      );
      await pressNow("Show panel");
      await page.waitForTimeout(500);
      await page
        .getByRole("tab", { name: "Simulation Settings", exact: true })
        .evaluate((element) => element.click());
      await page.waitForTimeout(1200);
      await pressNow("Hide panel");
      await page.waitForTimeout(600);
      await measure(
        "open on Simulation Settings",
        "bottom",
        true,
        await press("Show panel"),
      );
      await measure(
        "close on Simulation Settings",
        "bottom",
        false,
        await press("Hide panel"),
      );

      if (args.timeline) {
        // A run opens the panel on its timeline.
        await pressNow("Start Simulation");
        await page.waitForTimeout(3000);
        const pause = page.getByRole("button", {
          name: "Pause Playback",
          exact: true,
        });
        if (await pause.count()) {
          await pause.evaluate((element) => element.click());
          await page.waitForTimeout(500);
        }
        await pressNow("Hide panel");
        await page.waitForTimeout(600);
        await measure(
          "open on Timeline",
          "bottom",
          true,
          await press("Show panel"),
        );
        await measure(
          "close on Timeline",
          "bottom",
          false,
          await press("Hide panel"),
        );
      }
      rows.push({ sample, errors, measurements });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

await writeFile(
  `${output}/panel-mount-copies${copies}-${new URL(origin).port}.json`,
  JSON.stringify(rows, null, 1),
);

const sorted = (values) =>
  values.filter((value) => value !== null).sort((left, right) => left - right);
const median = (values) =>
  sorted(values)[Math.floor((sorted(values).length - 1) / 2)] ?? 0;
const spread = (values) =>
  `${Math.round(sorted(values)[0] ?? 0)}-${Math.round(sorted(values).at(-1) ?? 0)}`;
const columns = [
  ["drawn", true],
  ["done", true],
  ["empty", false],
  ["fMax", true],
  ["over20", false],
  ["styleMs", false],
  ["layoutMs", false],
  ["renders", false],
];
console.log(
  ["action".padEnd(30), ...columns.map(([key]) => key.padEnd(14))].join(""),
);
const count = rows[0]?.measurements.length ?? 0;
for (let at = 0; at < count; at++) {
  const entries = rows.map((row) => row.measurements[at]);
  console.log(
    [
      entries[0].name.padEnd(30),
      ...columns.map(([key, withSpread]) => {
        const values = entries.map((entry) => entry[key]);
        const middle = Math.round(median(values));
        return (
          withSpread ? `${middle} (${spread(values)})` : String(middle)
        ).padEnd(14);
      }),
    ].join(""),
  );
  if (args.details) {
    console.log(
      `    rendered: ${entries[0].topRenders
        .map(([name, renders]) => `${name} ${renders}`)
        .join(", ")}`,
    );
  }
}
const failures = rows.flatMap((row) => row.errors);
if (failures.length) console.log("page errors:", failures.slice(0, 3));
