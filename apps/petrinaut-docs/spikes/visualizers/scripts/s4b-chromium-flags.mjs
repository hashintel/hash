/** s4's measurement again, Chromium only, with sandboxed-iframe process isolation requested explicitly. */
import http from "node:http";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const SPIN_MS = 1500;
const frameScript = `<script>addEventListener("message", (e) => { if (e.data === "spin") { const t = Date.now(); while (Date.now() - t < ${SPIN_MS}) {} parent.postMessage("spun", "*"); } });</script>`;
const html = `<!doctype html><body><script>
  let frames = 0; (function tick() { frames++; requestAnimationFrame(tick); })();
  window.measure = async (sandbox) => {
    document.querySelectorAll("iframe").forEach((f) => f.remove());
    const f = document.createElement("iframe"); f.setAttribute("srcdoc", ${JSON.stringify(frameScript).replace(/<\/script/g, "<\\/script")});
    if (sandbox !== null) f.setAttribute("sandbox", sandbox);
    await new Promise((r) => { f.onload = r; document.body.append(f); });
    await new Promise((r) => setTimeout(r, 300));
    frames = 0; const t0 = performance.now();
    f.contentWindow.postMessage("spin", "*");
    await new Promise((r) => setTimeout(r, ${SPIN_MS} + 200));
    return Math.round(frames / ((performance.now() - t0) / 1000));
  };
</script></body>`;
const server = http.createServer((req, res) => {
  res.setHeader("content-type", "text/html");
  res.end(html);
});
await new Promise((r) => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/`;
const configs = [
  ["headless shell, default args", {}],
  [
    "headless shell, --enable-features=IsolateSandboxedIframes --site-per-process",
    {
      args: ["--enable-features=IsolateSandboxedIframes", "--site-per-process"],
    },
  ],
  ["full chromium (channel), default args", { channel: "chromium" }],
  [
    "full chromium (channel), --enable-features=IsolateSandboxedIframes --site-per-process",
    {
      channel: "chromium",
      args: ["--enable-features=IsolateSandboxedIframes", "--site-per-process"],
    },
  ],
];
for (const [label, opts] of configs) {
  let browser;
  try {
    browser = await chromium.launch(opts);
  } catch (e) {
    console.log(`${label}: cannot launch (${e.message.split("\n")[0]})`);
    continue;
  }
  const page = await browser.newPage();
  await page.goto(url);
  const version = browser.version();
  const results = [];
  for (const [name, sandbox] of [
    ["allow-scripts", "allow-scripts"],
    ["allow-scripts allow-same-origin", "allow-scripts allow-same-origin"],
    ["no sandbox", null],
  ]) {
    results.push(
      `${name}: ${await page.evaluate((s) => window.measure(s), sandbox)} fps`,
    );
  }
  console.log(
    `${label} [${version}]\n   host rAF while the iframe spins -> ${results.join(" | ")}`,
  );
  await browser.close();
}
server.close();
