// Screenshots the two cursor shapes at retina scale, so their size can be
// judged without recording a whole take.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Playwright and the example models come from the repository this runs in, so
// the script works from any checkout. Run it from the repository root.
const require = createRequire(path.join(process.cwd(), "package.json"));
const playwright = await import(
  pathToFileURL(require.resolve("playwright")).href
);
// Playwright ships CommonJS, so the named export only exists on `default`
// under some resolvers.
const chromium = playwright.chromium ?? playwright.default.chromium;
const here = path.dirname(fileURLToPath(import.meta.url));
const { createDemoHud } = await import(
  pathToFileURL(path.join(here, "demo-hud.mjs")).href
);
const { sirModel } = await import(
  pathToFileURL(
    path.join(
      process.cwd(),
      "libs/@hashintel/petrinaut-core/dist/examples/index.js",
    ),
  ).href
);

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const out = process.argv[2] ?? "./cursor-probe";

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1300, height: 812 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();
await page.addInitScript((net) => {
  localStorage.setItem(
    "petrinaut-sdcpn",
    JSON.stringify({
      "net-sir": {
        id: "net-sir",
        title: net.title,
        sdcpn: net.petriNetDefinition,
        lastUpdated: new Date().toISOString(),
      },
    }),
  );
  localStorage.setItem(
    "petrinaut:user-settings",
    JSON.stringify({
      showWalkthroughOnInit: false,
      isBottomPanelOpen: false,
      useEntitiesTreeView: true,
      compactNodes: true,
      leftSidebarWidth: 240,
    }),
  );
}, sirModel);
await page.goto("http://localhost:5173/");
const skip = page.getByRole("button", { name: "Skip tour" });
await skip
  .waitFor({ timeout: 20_000 })
  .then(() => skip.click())
  .catch(() => {});
await page.locator(".react-flow__node").first().waitFor({ timeout: 20_000 });
await pause(500);

const hud = createDemoHud(page, { rest: { x: 1150, y: 560 } });
await hud.install();
await hud.showPointer();

await page.locator('.react-flow__node[data-id="place__susceptible"]').click();
await pause(700);

const handle = page.getByRole("button", { name: "Resize panel from left" });
const box = await handle.boundingBox();
await hud.glide(box.x + box.width / 2, box.y + 300, 200);
await pause(250);
await page.screenshot({
  path: `${out}-resize-hover.png`,
  clip: { x: box.x - 90, y: box.y + 210, width: 200, height: 170 },
});

await hud.down();
await hud.glide(box.x - 120, box.y + 300, 300);
await pause(200);
await page.screenshot({
  path: `${out}-resize-drag.png`,
  clip: { x: box.x - 240, y: box.y + 210, width: 200, height: 170 },
});
await hud.up();

// The arrow, for size comparison, parked over the canvas.
await hud.glide(600, 400, 250);
await pause(250);
await page.screenshot({
  path: `${out}-arrow.png`,
  clip: { x: 520, y: 330, width: 200, height: 170 },
});

console.log("wrote", `${out}-{resize-hover,resize-drag,arrow}.png`);
await browser.close();
