// Measures what it costs to open and close the three panels around the
// canvas: the Properties panel through a selection, the bottom panel and the
// left sidebar. Each one slides for 150 ms, and the minimap, the bottom bar,
// the viewport controls and the neighbouring panels move with it.
//
// This script totals each toggle: script, style and layout time, commits and
// who rendered. It does not say when the panel is first drawn or when its
// content is complete: panel-mount.mjs follows a panel frame by frame for
// that.
//
// React commit counts and render time need the profiling build
// (BENCH_REACT_PROFILING=true, port 6028), and component names an unminified
// one (see render-counts.mjs). `details=1` prints, for each toggle, the
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
const output = resolvePath(
  args.output ?? new URL("./results", import.meta.url).pathname,
);
await mkdir(output, { recursive: true });

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
      await page.waitForTimeout(900);

      // Clicks are made from the page, on a button found before the
      // measurement starts: Playwright's own click scrolls its target into
      // view, and finding a button by role reads the style of every
      // candidate, which would be counted as the toggle's work.
      const toggle = async (label, name) => {
        const button = await page
          .getByRole("button", { name, exact: true })
          .elementHandle();
        return observe(
          page,
          session,
          label,
          () => button.evaluate((element) => element.click()),
          600,
        );
      };
      const node = await page
        .locator(".react-flow__node")
        .filter({
          has: page.getByText(
            model === "satellites" ? "Space" : "InboundShipments",
            { exact: true },
          ),
        })
        .boundingBox();
      const measurements = [
        await observe(
          page,
          session,
          "select",
          () =>
            page.mouse.click(node.x + node.width / 2, node.y + node.height / 2),
          600,
        ),
        await toggle("show-bottom", "Show panel"),
        await toggle("collapse-sidebar", "Collapse sidebar"),
        await toggle("expand-sidebar", "Expand sidebar"),
        await toggle("hide-bottom", "Hide panel"),
        await observe(
          page,
          session,
          "deselect",
          () => page.keyboard.press("Escape"),
          600,
        ),
      ];
      rows.push({ sample, model, origin, errors, measurements });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

await writeFile(
  `${output}/panel-toggles-${model}-${new URL(origin).port}${args.cpu ? `-cpu${args.cpu}` : ""}.json`,
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
];
console.log(["action", ...columns.map(([, title]) => title)].join("\t"));
for (const label of rows[0]?.measurements.map((entry) => entry.label) ?? []) {
  const entries = rows.flatMap((row) =>
    row.measurements.filter((entry) => entry.label === label),
  );
  console.log(
    [
      label.padEnd(16),
      ...columns.map(([key]) => round(median(entries.map((e) => e[key])))),
    ].join("\t"),
  );
  if (args.details && entries[0]) {
    const list = (title, pairs) =>
      console.log(
        `    ${title}: ${pairs
          .slice(0, Number(args.top ?? 14))
          .map(([name, count]) => `${name} ${count}`)
          .join(", ")}`,
      );
    list("rendered", entries[0].renders);
    list("started by", entries[0].renderStarts);
    list("renders below each starter", entries[0].rendersBelowStarters);
    list("new context values", entries[0].newContextValues);
  }
}
const failures = rows.flatMap((row) => row.errors);
if (failures.length) console.log("page errors:", failures.slice(0, 3));
