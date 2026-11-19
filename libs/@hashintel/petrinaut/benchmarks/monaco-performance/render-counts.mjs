// Lists which React components render, and how often, while typing 20
// characters in the Visualizer editor. `host=website` mounts the editor in a
// host whose net list, callbacks and slots change on every edit.
//
// Needs an unminified build with React's profiling bundle, so component names
// survive and fibers carry timings:
//   BENCH_REACT_PROFILING=true vite build --config <this folder>/vite.config.ts \
//     --minify false --outDir benchmarks/monaco-performance/output-unminified
// served with `vite preview --outDir <the same> --port 6031`.
import { chromium } from "playwright";

import { instrument } from "./instrument.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((argument) => argument.split("=")),
);
const origin = args.origin ?? "http://127.0.0.1:6031";
const model = args.model ?? "supply-chain";

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  await page.addInitScript(instrument);
  await page.goto(
    `${origin}/benchmarks/monaco-performance/bench.html?surface=full&model=${model}&variant=prototype${args.host ? `&host=${args.host}` : ""}`,
  );
  await page.getByRole("button", { name: "Fit view", exact: true }).waitFor();
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
  await page.waitForTimeout(900);

  const start = await page.evaluate(() => {
    const editor = globalThis.__monacoBench
      .editors()
      .find((candidate) => candidate.getDomNode()?.checkVisibility());
    editor.focus();
    editor.setPosition({ lineNumber: 1, column: 1 });
    return performance.now();
  });
  await page.keyboard.type("// benchmark typing\n", { delay: 5 });
  await page.waitForTimeout(700);
  const snapshot = await page.evaluate(
    (since) => globalThis.__monacoBench.snapshot(since),
    start,
  );
  const total = snapshot.renders.reduce((sum, [, count]) => sum + count, 0);
  console.log(
    `model=${model} commits=${snapshot.react.length} component renders=${total} distinct=${snapshot.renders.length}`,
  );
  for (const [name, count] of snapshot.renders.slice(0, Number(args.top ?? 45)))
    console.log(`${String(count).padStart(6)}  ${name}`);
  // Where to look first: what rendered though the component above it did not,
  // and which contexts changed value.
  console.log("started by their own state or a context they read:");
  for (const [name, count] of snapshot.renderStarts.slice(
    0,
    Number(args.starts ?? 25),
  ))
    console.log(`${String(count).padStart(6)}  ${name}`);
  console.log("new context values:");
  for (const [name, count] of snapshot.newContextValues)
    console.log(`${String(count).padStart(6)}  ${name}`);
  await context.close();
} finally {
  await browser.close();
}
