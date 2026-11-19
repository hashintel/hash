// Measures what it costs to open, float, dock and close the AI assistant
// panel, with the rest of the editor in one of three states:
//   canvas    nothing else open
//   editor    the Visualizer's code editor open in the Properties panel
//   settings  the bottom panel on Simulation Settings, with its scenario form
//
// React commit counts and render time need the profiling build
// (BENCH_REACT_PROFILING=true, port 6028), and component names an unminified
// one (see render-counts.mjs). `details=1` prints, for each action, the
// components that rendered most, those that started the renders and the
// providers that gave out a new context value.
import { mkdir, writeFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";

import { chromium } from "playwright";

import { instrument } from "./instrument.mjs";
import { observe } from "./observe.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((argument) => argument.split("=")),
);
const origin = args.origin ?? "http://127.0.0.1:6027";
const model = args.model ?? "supply-chain";
const samples = Number(args.samples ?? 3);
const states = (args.states ?? "canvas,editor,settings").split(",");
const output = resolvePath(
  args.output ?? new URL("./results", import.meta.url).pathname,
);
await mkdir(output, { recursive: true });

/** Counts the callbacks the page's resize observers get, and the entries in them. */
const countResizes = () => {
  globalThis.__resizes = { callbacks: 0, entries: 0 };
  const Native = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class extends Native {
    constructor(callback) {
      super((entries, observer) => {
        globalThis.__resizes.callbacks += 1;
        globalThis.__resizes.entries += entries.length;
        callback(entries, observer);
      });
    }
  };
};

// Clicks are made from the page. Playwright's own click first scrolls its
// target into view, and the workspace has a drawer parked beside it that
// makes it scrollable: the click then shifts the whole editor.
const click = (locator) => locator.evaluate((element) => element.click());

const prepare = {
  canvas: async () => {},
  editor: async (page) => {
    await page
      .locator(".react-flow__node")
      .filter({
        has: page.getByText(
          model === "satellites" ? "Space" : "InboundShipments",
          { exact: true },
        ),
      })
      .hover();
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
        .some((editor) => editor.getDomNode()?.checkVisibility()),
    );
  },
  settings: async (page) => {
    await click(page.getByRole("button", { name: "Show panel", exact: true }));
    await page.waitForTimeout(300);
    await click(page.getByRole("tab", { name: "Simulation Settings" }));
  },
};

const browser = await chromium.launch({ headless: true });
const rows = [];
try {
  for (let sample = 0; sample < samples; sample++) {
    for (const state of states) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      page.setDefaultTimeout(8000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.addInitScript(instrument);
      await page.addInitScript(countResizes);
      const session = await context.newCDPSession(page);
      await session.send("Performance.enable");
      if (args.cpu)
        await session.send("Emulation.setCPUThrottlingRate", {
          rate: Number(args.cpu),
        });
      try {
        await page.goto(
          `${origin}/benchmarks/monaco-performance/bench.html?surface=full&model=${model}&variant=prototype&assistant=1${args.host ? `&host=${args.host}` : ""}`,
        );
        await page
          .getByRole("button", { name: "Fit view", exact: true })
          .waitFor();
        await page.waitForFunction(
          () => globalThis.__monacoBench.monaco() !== undefined,
        );
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(400);
        await prepare[state](page);
        await page.waitForTimeout(900);

        const press = (name) => () =>
          click(page.getByRole("button", { name, exact: true }));
        const measure = async (label, name) => {
          await page.evaluate(() => {
            globalThis.__resizes.callbacks = 0;
            globalThis.__resizes.entries = 0;
          });
          const measurement = await observe(
            page,
            session,
            label,
            press(name),
            600,
          );
          return {
            ...measurement,
            resizes: await page.evaluate(() => globalThis.__resizes),
          };
        };
        const measurements = [
          await measure("open", "Show AI assistant"),
          await measure("float", "Float AI assistant"),
          await measure("dock", "Dock AI assistant"),
          await measure("float-again", "Float AI assistant"),
          await measure("dock-again", "Dock AI assistant"),
          await measure("close", "Close AI assistant"),
        ];
        rows.push({ sample, state, model, origin, errors, measurements });
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}

await writeFile(
  `${output}/assistant-dock-${model}-${new URL(origin).port}${args.host ? `-${args.host}` : ""}${args.cpu ? `-cpu${args.cpu}` : ""}.json`,
  JSON.stringify(rows, null, 1),
);

const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? 0;
};
const round = (value) => Math.round(value * 10) / 10;
const columns = [
  ["scriptMs", "script"],
  ["styleMs", "style"],
  ["layoutMs", "layout"],
  ["frameMax", "fMax"],
  ["framesOver20", ">20ms"],
  ["frames", "frames"],
  ["reactCommits", "commits"],
  ["componentRenders", "renders"],
  ["editorLayouts", "edLay"],
];
console.log(
  ["state", "action", ...columns.map(([, title]) => title), "resizeCb"].join(
    "\t",
  ),
);
for (const state of states) {
  for (const label of ["open", "float", "dock", "close"]) {
    const entries = rows
      .filter((row) => row.state === state)
      .flatMap((row) =>
        row.measurements.filter(
          (entry) => entry.label === label || entry.label === `${label}-again`,
        ),
      );
    console.log(
      [
        state,
        label,
        ...columns.map(([key]) => round(median(entries.map((e) => e[key])))),
        round(median(entries.map((entry) => entry.resizes.callbacks))),
      ].join("\t"),
    );
    if (args.details && entries[0]) {
      const list = (title, pairs) =>
        console.log(
          `    ${title}: ${pairs
            .slice(0, 14)
            .map(([name, count]) => `${name} ${count}`)
            .join(", ")}`,
        );
      list("rendered", entries[0].renders);
      list("started by", entries[0].renderStarts);
      list("new context values", entries[0].newContextValues);
    }
  }
}
const failures = rows.flatMap((row) => row.errors);
if (failures.length) console.log("page errors:", failures.slice(0, 3));
