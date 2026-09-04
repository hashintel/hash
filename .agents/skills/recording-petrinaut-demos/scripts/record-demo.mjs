#!/usr/bin/env node
// Records a demo take at retina density and writes the frames of the 18 s
// window as a timestamped image sequence for make-demo.sh.
//
// Usage: node record-demo.mjs <scenario.mjs> [--out <dir>] [--base-url <url>] [--viewport-width <css px>] [--browser-args <a,b,c>]
//
// --browser-args passes comma-separated Chromium flags to launch(); a scenario
// may also export `browserArgs: string[]`. Headless Chromium exposes no WebGPU
// adapter by default; "--enable-unsafe-webgpu,--ignore-gpu-blocklist,--use-angle=metal"
// enables it on macOS.
//
// The scenario module exports:
//   url          string          path or URL to open (relative to base URL)
//   init?        (page) => void  before navigation: addInitScript for localStorage etc.
//   prepare?     (page, log)     off camera: dismiss tours, warm runtimes, clean up
//   take         (page, log)     the 18 s path; the harness marks its start
//   holdSeconds? number          how long the take is recorded (default 21)
//
// Capture is a CDP screencast of a 16:10 viewport at deviceScaleFactor 2, so a
// 1300 CSS px wide page arrives as 2600x1624 device pixels. Playwright's own
// recordVideo cannot do this: it never upscales, and CSS zoom breaks its
// actionability checks.
//
// Playwright is resolved from the current working directory's node_modules, so
// run this from the repository root.

import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const scenarioArg = args.find((arg) => !arg.startsWith("--"));
if (!scenarioArg) {
  console.error(
    "usage: record-demo.mjs <scenario.mjs> [--out <dir>] [--base-url <url>] [--viewport-width <css px>]",
  );
  process.exit(2);
}
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const outDir = path.resolve(option("--out", "./demo"));
const framesDir = path.join(outDir, "frames");
const baseUrl = option(
  "--base-url",
  process.env.BASE_URL ?? "http://localhost:5173",
);
mkdirSync(framesDir, { recursive: true });

const require = createRequire(path.join(process.cwd(), "package.json"));
const playwright = await import(
  pathToFileURL(require.resolve("playwright")).href
);
const chromium = playwright.chromium ?? playwright.default.chromium;
const scenario = await import(pathToFileURL(path.resolve(scenarioArg)).href);

const cssWidth = Number(option("--viewport-width", "1300"));
const cssHeight = Math.round((cssWidth * 10) / 16 / 2) * 2;
const viewport = { width: cssWidth, height: cssHeight };
const capture = { width: cssWidth * 2, height: cssHeight * 2 };
// The take's length. 18s is the house default; a path with more beats than that
// can carry gets `--duration`, and the same number has to reach make-demo.sh or
// the encode will cut the tail off.
const demoSeconds = Number(option("--duration", "18"));
const holdSeconds = scenario.holdSeconds ?? demoSeconds + 3;
const startedAt = Date.now();
// The format string stays constant and the elapsed time is an argument:
// putting a computed value first would make `console.log` read it for format
// specifiers.
const log = (...parts) =>
  console.log("[%ss]", ((Date.now() - startedAt) / 1000).toFixed(1), ...parts);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

log(
  "viewport",
  `${viewport.width}x${viewport.height}`,
  "capture",
  `${capture.width}x${capture.height}`,
);
const browserArgs = [
  ...(scenario.browserArgs ?? []),
  ...option("--browser-args", "")
    .split(",")
    .map((flag) => flag.trim())
    .filter(Boolean),
];
if (browserArgs.length > 0) log("browser args", browserArgs.join(" "));
const browser = await chromium.launch({ headless: true, args: browserArgs });
const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
const page = await context.newPage();

const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

// Screencast frames arrive only when the page changes; each carries the wall
// clock at receipt so the GIF step can lay them out on a constant timeline.
const frames = [];
const cdp = await context.newCDPSession(page);
cdp.on("Page.screencastFrame", ({ data, sessionId }) => {
  const file = path.join(
    framesDir,
    `f${String(frames.length).padStart(6, "0")}.jpg`,
  );
  writeFileSync(file, Buffer.from(data, "base64"));
  frames.push({ file, at: Date.now() });
  cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => undefined);
});
const startScreencast = () =>
  cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 95,
    maxWidth: capture.width,
    maxHeight: capture.height,
    everyNthFrame: 1,
  });

await scenario.init?.(page);

let takeStartedAt = 0;
let takeEndedAt = 0;
try {
  await page.goto(new URL(scenario.url, baseUrl).href);
  log("loaded", scenario.url);
  await scenario.prepare?.(page, log);
  await pause(600);

  await startScreencast();
  await pause(300);
  takeStartedAt = Date.now();
  log("TAKE START");
  await scenario.take(page, (...parts) =>
    log(`take ${((Date.now() - takeStartedAt) / 1000).toFixed(1)}s:`, ...parts),
  );
  while (Date.now() - takeStartedAt < holdSeconds * 1000) {
    await pause(200);
  }
  takeEndedAt = Date.now();
  log("TAKE END");
} catch (error) {
  log("FAILED:", error instanceof Error ? error.message : String(error));
  const snapshot = await page
    .locator("body")
    .ariaSnapshot()
    .catch(() => "no snapshot");
  console.log(snapshot.slice(0, 4000));
  process.exitCode = 1;
}
await cdp.send("Page.stopScreencast").catch(() => undefined);
await context.close();
await browser.close();

// The concat list covers the take window: the frame on screen when the take
// started, then every frame until the window ends, each shown until the next
// one arrived.
const windowEnd = takeStartedAt + demoSeconds * 1000;
const inWindow = frames.filter((frame) => frame.at <= windowEnd);
const firstIndex = Math.max(
  0,
  inWindow.findLastIndex((frame) => frame.at <= takeStartedAt),
);
const list = [];
for (let index = firstIndex; index < inWindow.length; index += 1) {
  const frame = inWindow[index];
  const shownFrom = Math.max(frame.at, takeStartedAt);
  const shownUntil =
    index + 1 < inWindow.length ? inWindow[index + 1].at : windowEnd;
  const duration = (shownUntil - shownFrom) / 1000;
  if (duration <= 0) continue;
  list.push(`file '${frame.file}'`, `duration ${duration.toFixed(3)}`);
}
if (inWindow.length > 0) {
  list.push(`file '${inWindow[inWindow.length - 1].file}'`);
}
const framesList = path.join(outDir, "frames.txt");
writeFileSync(framesList, list.join("\n") + "\n");

const recording = {
  framesList,
  frameCount: frames.length,
  takeFrameCount: Math.max(0, inWindow.length - firstIndex),
  takeMs: takeEndedAt - takeStartedAt,
  demoSeconds,
  viewport,
  capture,
  errors,
};
writeFileSync(
  path.join(outDir, "recording.json"),
  JSON.stringify(recording, null, 2),
);
log(
  "frames captured",
  frames.length,
  "in take window",
  recording.takeFrameCount,
);
log("errors:", errors.length);
for (const error of errors) log("  ", error.slice(0, 300));
