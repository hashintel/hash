import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const dist = path.resolve(import.meta.dirname, "dist");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
};
const server = http.createServer((req, res) => {
  // Serve only files inside `dist`: normalise the requested path and refuse
  // anything that resolves outside it.
  const requested = decodeURIComponent(req.url.split("?")[0]);
  const resolved = path.resolve(dist, `.${requested}`);
  if (!resolved.startsWith(dist + path.sep) || !fs.existsSync(resolved)) {
    res.statusCode = 404;
    return res.end();
  }
  res.setHeader(
    "content-type",
    types[path.extname(resolved)] ?? "application/octet-stream",
  );
  res.end(fs.readFileSync(resolved));
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/pages/`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } });
page.on("pageerror", (e) => console.log("PAGE ERROR", e.message));
const variants = (
  process.env.VARIANTS ??
  "vanilla,react-flat,react-flat-compiled,react-items,react-items-memo,react-items-compiled,preact,solid-index,solid-store,svelte"
).split(",");
const sizes = (process.env.SIZES ?? "1000,5000,20000").split(",").map(Number);
const fractions = (process.env.FRACTIONS ?? "1,0.1").split(",").map(Number);
const f = (x) => x.toFixed(1).padStart(6);
console.log(
  "variant".padEnd(22) +
    "n".padStart(6) +
    " moved" +
    "  script p50  script p95  frame p50  frame p95  nodes",
);
for (const variant of variants) {
  await page.goto(base + variant + ".html");
  await page.waitForFunction(() => typeof window.runBench === "function");
  for (const n of sizes)
    for (const changedFraction of fractions) {
      const r = await page.evaluate((cfg) => window.runBench(cfg), {
        n,
        changedFraction,
      });
      console.log(
        variant.padEnd(22) +
          String(n).padStart(6) +
          String(changedFraction).padStart(6) +
          "  " +
          f(r.script50) +
          "      " +
          f(r.script95) +
          "     " +
          f(r.interval50) +
          "     " +
          f(r.interval95) +
          "  " +
          r.nodes,
      );
    }
}
if (!process.env.VARIANTS || process.env.TRANSFER) {
  await page.goto(base + "transfer.html");
  await page.waitForFunction(() => typeof window.runTransfer === "function");
  console.log(
    "\nworker → main transfer (ms)".padEnd(40) +
      "n".padStart(6) +
      "  build p50  transit p50  transit p95  main structuredClone p50",
  );
  for (const n of sizes)
    for (const encoding of ["objects", "columns", "patches"]) {
      const r = await page.evaluate((cfg) => window.runTransfer(cfg), {
        n,
        encoding,
      });
      console.log(
        encoding.padEnd(40) +
          String(n).padStart(6) +
          "  " +
          f(r.built50) +
          "      " +
          f(r.transit50) +
          "       " +
          f(r.transit95) +
          "       " +
          f(r.mainClone50),
      );
    }
}
await browser.close();
server.close();
