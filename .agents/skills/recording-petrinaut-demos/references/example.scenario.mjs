// A worked scenario: the bottom toolbar keeping clear of the side panels.
//
// It exercises the three things most takes need — a click that opens a panel,
// a drag with a held cursor shape, and a hover that reveals something — so it
// is the file to copy when starting a new one.
//
// Storyboard (18 s):
//   Context, ~7.4 s
//     0.0  SIR net, toolbar centred on the canvas            hold 1.1
//     1.1  pointer fades in, glides onto Susceptible         1.0
//     2.1  click: properties panel opens, toolbar steps left hold 1.6
//     3.7  pointer glides onto the panel's resize handle     0.9
//     4.6  drag the panel wider, toolbar tracks the edge     2.8
//   Motion, ~6.6 s
//     7.4  toolbar collapses to cursor, status and Play      hold 1.6
//     9.0  pointer leaves the handle                         0.7
//     9.7  pointer glides onto the collapsed toolbar         0.9
//    10.6  the hidden controls come back under the pointer   hold 1.7
//    12.3  pointer leaves, the toolbar folds again           1.0
//    13.3  hold the folded toolbar                           0.7
//   Result, ~4.0 s
//    13.6  click empty canvas: panel closes                  0.9
//    14.5  toolbar expands and returns to centre             hold 0.8
//    15.3  click the panel toggle                            0.6
//    15.9  bottom panel slides up, toolbar rides with it     hold 2.1
//
// A glide costs about twice the duration it is given: every step is a mouse
// move plus a page evaluate, and the round trips dominate the 22 ms step. The
// durations below are halved for that, so the beats land where the storyboard
// puts them.
//
// Run from the repository root, against the website dev server:
//   node .agents/skills/recording-petrinaut-demos/scripts/record-demo.mjs \
//     <this file> --out ./demo --base-url http://localhost:5173

import path from "node:path";
import { pathToFileURL } from "node:url";

const scripts = path.join(
  process.cwd(),
  ".agents/skills/recording-petrinaut-demos/scripts",
);

const { createDemoHud } = await import(
  pathToFileURL(path.join(scripts, "demo-hud.mjs")).href
);
const { frameNet, nodeBox, selectNode } = await import(
  pathToFileURL(path.join(scripts, "petrinaut-canvas.mjs")).href
);
const { sirModel } = await import(
  pathToFileURL(
    path.join(
      process.cwd(),
      "libs/@hashintel/petrinaut-core/dist/examples/index.js",
    ),
  ).href
);

export const url = "/";

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const SIDEBAR_WIDTH = 240;
/**
 * How much wider the drag makes the properties panel. Enough to take the
 * toolbar past the width it needs, not so much that the hover beat has it
 * covering the viewport controls it normally keeps clear of.
 */
const DRAG_DISTANCE = 210;

let hud;

/** The toolbar's own box, and the gap between its two segments. */
const barGeometry = (page) =>
  page.evaluate(() => {
    // Matched by the segment gap and by sitting at the bottom of the window,
    // so the same take can be recorded against a build that predates the
    // lane the bar now sits in.
    const bar = [...document.querySelectorAll("div")].find(
      (element) =>
        typeof element.className === "string" &&
        element.className.includes("gap_[20px]") &&
        element.querySelector("button") !== null &&
        element.getBoundingClientRect().bottom > window.innerHeight - 220,
    );
    const box = bar.getBoundingClientRect();
    const segments = [...bar.children]
      .map((child) => child.getBoundingClientRect())
      .filter((rect) => rect.width > 0);
    const first = segments[0];
    const last = segments[segments.length - 1];
    return {
      left: Math.round(box.x),
      right: Math.round(box.right),
      width: Math.round(box.width),
      // The gap between the segments belongs to the bar and holds no control,
      // so hovering there expands it without raising a tooltip.
      gapX: Math.round((first.right + last.x) / 2),
      centreY: Math.round(box.y + box.height / 2),
    };
  });

export const init = async (page) => {
  await page.addInitScript(
    ({ net, sidebarWidth }) => {
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
          leftSidebarWidth: sidebarWidth,
        }),
      );
    },
    { net: sirModel, sidebarWidth: SIDEBAR_WIDTH },
  );
};

export const prepare = async (page, log) => {
  const skipTour = page.getByRole("button", { name: "Skip tour" });
  await skipTour
    .waitFor({ timeout: 15_000 })
    .then(() => skipTour.click())
    .catch(() => log("no tour"));
  await page.keyboard.press("Escape");
  await pause(400);

  const viewport = page.viewportSize();
  hud = createDemoHud(page, {
    rest: { x: viewport.width - 150, y: viewport.height - 260 },
  });
  await hud.install();

  await page.locator(".react-flow__node").first().waitFor({ timeout: 15_000 });
  // The properties panel opens on the first click and the canvas never
  // refits, so the frame holds back the width the panel will take.
  await frameNet(page, {
    viewport,
    leftEdge: SIDEBAR_WIDTH,
    rightReserve: 380,
    log,
  });
  const box = await nodeBox(page);
  log(`net spans ${box.left}..${box.right} of ${viewport.width}`);
  log(`toolbar at rest: ${JSON.stringify(await barGeometry(page))}`);
};

export const take = async (page, log) => {
  const viewport = page.viewportSize();
  await pause(1100);

  await hud.showPointer();
  await selectNode(page, hud, "place__susceptible", 620);
  log(`panel open, toolbar ${JSON.stringify(await barGeometry(page))}`);
  await pause(1600);

  // Widen the properties panel until the toolbar runs out of room.
  const handle = page.getByRole("button", { name: "Resize panel from left" });
  const handleBox = await handle.boundingBox();
  await hud.glide(handleBox.x + handleBox.width / 2, handleBox.y + 260, 470);
  // The handle asks for `ew-resize`, so the mirror shows the double arrow on
  // arrival and holds it until the drag is released.
  await hud.down();
  await hud.glide(handleBox.x - DRAG_DISTANCE, handleBox.y + 260, 1450);
  await hud.up();
  const squeezed = await barGeometry(page);
  log(`panel widened, toolbar ${JSON.stringify(squeezed)}`);
  await pause(1600);

  // Hover it: the hidden controls come back for as long as the pointer stays.
  await hud.glide(squeezed.gapX + 160, squeezed.centreY - 150, 370);
  await hud.glide(squeezed.gapX, squeezed.centreY, 470);
  await pause(250);
  // Expanding moves the segments out from under the pointer, and resting it on
  // a button raises that button's tooltip over the toolbar.
  const expanded = await barGeometry(page);
  await hud.glide(expanded.gapX, expanded.centreY, 130);
  log(`hovered, toolbar ${JSON.stringify(expanded)}`);
  await pause(1300);

  await hud.glide(squeezed.gapX - 120, squeezed.centreY - 190, 520);
  log(`pointer away, toolbar ${JSON.stringify(await barGeometry(page))}`);
  await pause(700);

  // Deselect: the panel closes and the toolbar returns to the centre.
  const box = await nodeBox(page);
  const emptyY = Math.min(box.bottom + 70, squeezed.centreY - 90);
  await hud.glide(SIDEBAR_WIDTH + 70, emptyY, 470);
  await hud.click();
  await pause(400);
  log(`panel closed, toolbar ${JSON.stringify(await barGeometry(page))}`);
  await pause(700);

  // The bottom panel lifts the toolbar, which rides the panel's own slide.
  await hud.glideTo(page.getByRole("button", { name: "Show panel" }), 250);
  await hud.click();
  await pause(250);
  log(`bottom panel open, toolbar ${JSON.stringify(await barGeometry(page))}`);
  await hud.toRest(250);
  await hud.hidePointer();
  await pause(1500);
};
