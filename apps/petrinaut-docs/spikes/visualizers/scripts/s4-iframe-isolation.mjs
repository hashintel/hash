/**
 * Does a sandboxed iframe's busy loop stall the host document's rAF?
 * Serves a host page over http (srcdoc iframes need a real origin to make
 * the sandbox/opaque-origin distinction meaningful) and measures the host's
 * requestAnimationFrame count while each iframe variant spins for 1.5 s.
 */
import http from "node:http";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium, firefox, webkit } = require("playwright");

const SPIN_MS = 1500;
const frameScript = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; connect-src 'none'">
<script>
  addEventListener("message", async (e) => {
    if (e.data === "spin") { const t = Date.now(); while (Date.now() - t < ${SPIN_MS}) {} parent.postMessage("spun", "*"); }
    if (e.data === "probe") {
      const r = {};
      try { await fetch(location.href.startsWith("about") ? "https://example.com/" : "/ping"); r.fetch = "allowed"; } catch (err) { r.fetch = "blocked: " + err.message.slice(0, 40); }
      try { r.origin = origin; } catch {}
      try { localStorage.setItem("x", "1"); r.storage = "allowed"; } catch (err) { r.storage = "blocked"; }
      try { r.cookie = typeof document.cookie === "string" ? "readable" : "n/a"; } catch (err) { r.cookie = "blocked"; }
      try { r.parentDom = parent.document ? "accessible" : "n/a"; } catch (err) { r.parentDom = "blocked"; }
      parent.postMessage({ probe: r }, "*");
    }
  });
</script>`;
const variants = {
  "sandbox=allow-scripts (opaque origin)": `sandbox="allow-scripts"`,
  "sandbox=allow-scripts allow-same-origin": `sandbox="allow-scripts allow-same-origin"`,
  "plain srcdoc (same-origin, no sandbox)": ``,
};
const html = `<!doctype html><body><script>
  let frames = 0; (function tick() { frames++; requestAnimationFrame(tick); })();
  window.makeFrame = (attrs) => new Promise((resolve) => {
    document.querySelectorAll("iframe").forEach((f) => f.remove());
    const f = document.createElement("iframe"); f.setAttribute("srcdoc", ${JSON.stringify(frameScript).replace(/<\/script/g, "<\\/script")});
    if (attrs) f.setAttribute("sandbox", attrs.replace(/^sandbox="|"$/g, ""));
    f.onload = () => resolve(f); document.body.append(f);
  });
  window.measure = async (attrs) => {
    const f = await window.makeFrame(attrs);
    await new Promise((r) => setTimeout(r, 300));
    const probe = new Promise((r) => { const h = (e) => { if (e.data && e.data.probe) { removeEventListener("message", h); r(e.data.probe); } }; addEventListener("message", h); });
    f.contentWindow.postMessage("probe", "*");
    const probeResult = await Promise.race([probe, new Promise((r) => setTimeout(() => r({ timeout: true }), 2000))]);
    const spun = new Promise((r) => { const h = (e) => { if (e.data === "spun") { removeEventListener("message", h); r(); } }; addEventListener("message", h); });
    frames = 0; const t0 = performance.now();
    f.contentWindow.postMessage("spin", "*");
    await new Promise((r) => setTimeout(r, ${SPIN_MS} + 200));
    const hostFrames = frames; const elapsed = performance.now() - t0;
    await spun;
    return { hostFps: Math.round(hostFrames / (elapsed / 1000)), probe: probeResult };
  };
</script></body>`;
const server = http.createServer((req, res) => {
  res.setHeader(
    "content-type",
    req.url === "/ping" ? "text/plain" : "text/html",
  );
  res.end(req.url === "/ping" ? "pong" : html);
});
await new Promise((r) => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/`;
for (const [name, launcher] of [
  ["chromium", chromium],
  ["firefox", firefox],
  ["webkit", webkit],
]) {
  let browser;
  try {
    browser = await launcher.launch();
  } catch (e) {
    console.log(`${name}: cannot launch (${e.message.split("\n")[0]})`);
    continue;
  }
  const page = await browser.newPage();
  await page.goto(url);
  await page.waitForTimeout(300);
  const idle = await page.evaluate(async () => {
    const t0 = performance.now();
    const start = frames;
    await new Promise((r) => setTimeout(r, 1000));
    return Math.round((frames - start) / ((performance.now() - t0) / 1000));
  });
  console.log(`\n${name}: host idle rAF ≈ ${idle} fps`);
  for (const [label, attrs] of Object.entries(variants)) {
    const result = await page.evaluate((a) => window.measure(a), attrs);
    console.log(
      `  ${label.padEnd(44)} host rAF during iframe spin: ${String(result.hostFps).padStart(3)} fps  | probe: ${JSON.stringify(result.probe)}`,
    );
  }
  await browser.close();
}
server.close();
