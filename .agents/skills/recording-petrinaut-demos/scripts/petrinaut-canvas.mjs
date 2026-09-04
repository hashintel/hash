// Framing helpers for a take on the Petrinaut canvas.
//
// The editor fits the view once, on load, caps that fit at zoom 1.1, and never
// refits. There is no fit-view control either: the viewport buttons are Zoom
// in, Zoom out, Fullscreen, Lock view and Settings. The canvas pane also spans
// the full window width while the left sidebar covers its left edge, so a
// fitted net can sit partly behind the panel, and moving the seeded
// coordinates does not help because the fit re-centres them.
//
// `frameNet` therefore measures and solves: the largest zoom whose pan puts
// the net inside the region the viewer can actually see. Measured rather than
// hardcoded, so a change to the model, the node size setting or the viewport
// moves the numbers and not the framing.

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Screen box the canvas nodes currently occupy. */
export const nodeBox = (page) =>
  page.evaluate(() => {
    const boxes = [...document.querySelectorAll(".react-flow__node")].map(
      (node) => node.getBoundingClientRect(),
    );
    if (boxes.length === 0) {
      throw new Error("no canvas nodes to measure");
    }
    return {
      left: Math.round(Math.min(...boxes.map((box) => box.x))),
      right: Math.round(Math.max(...boxes.map((box) => box.x + box.width))),
      top: Math.round(Math.min(...boxes.map((box) => box.y))),
      bottom: Math.round(Math.max(...boxes.map((box) => box.y + box.height))),
    };
  });

const ZOOM_FACTOR = 1.2;

/**
 * Zooms and pans so the net fills the visible canvas.
 *
 * `leftEdge` is where the viewer can first see the canvas, which is the
 * sidebar's width when one is open and zero otherwise. `rightReserve` is the
 * width a panel will claim during the take. `paneTop` is the height of the
 * chrome above it.
 */
export const frameNet = async (
  page,
  {
    viewport,
    leftEdge = 0,
    rightReserve = 0,
    paneTop = 64,
    edge = 16,
    maxSteps = 4,
    log,
  },
) => {
  const measured = await nodeBox(page);
  const centreX = viewport.width / 2;
  const centreY = paneTop + (viewport.height - paneTop) / 2;
  const clamp = (value, low, high) => Math.min(Math.max(value, low), high);
  /** The zoom buttons scale about the pane centre. */
  const zoomed = (box, factor) => ({
    left: centreX + (box.left - centreX) * factor,
    right: centreX + (box.right - centreX) * factor,
    top: centreY + (box.top - centreY) * factor,
    bottom: centreY + (box.bottom - centreY) * factor,
  });

  // `rightReserve` holds back the width a panel will take once the take opens
  // it. The properties panel appears on the first selection and the canvas
  // does not refit, so without this the nodes it covers leave the frame.
  const visible = {
    left: leftEdge + edge,
    right: viewport.width - rightReserve - edge,
    top: paneTop + edge,
    bottom: viewport.height - edge,
  };

  const planFor = (steps) => {
    const box = zoomed(measured, ZOOM_FACTOR ** steps);
    if (
      box.right - box.left > visible.right - visible.left ||
      box.bottom - box.top > visible.bottom - visible.top
    ) {
      return null;
    }
    return {
      steps,
      box,
      panX: clamp(
        (visible.left + visible.right) / 2 - (box.left + box.right) / 2,
        visible.left - box.left,
        visible.right - box.right,
      ),
      panY: clamp(
        (visible.top + visible.bottom) / 2 - (box.top + box.bottom) / 2,
        visible.top - box.top,
        visible.bottom - box.bottom,
      ),
    };
  };

  // Largest zoom that fits, searching down through zoom-out steps as well: a
  // net wider than the region left by the sidebar and a reserved panel has to
  // shrink, not give up.
  let plan = null;
  for (let steps = maxSteps; steps >= -maxSteps; steps -= 1) {
    plan = planFor(steps);
    if (plan) {
      break;
    }
  }
  if (!plan) {
    throw new Error("the net does not fit the visible canvas at any zoom");
  }

  const button = page.getByRole("button", {
    name: plan.steps < 0 ? "Zoom out" : "Zoom in",
  });
  for (let step = 0; step < Math.abs(plan.steps); step += 1) {
    await button.click();
    await pause(350);
  }

  // Dragging empty canvas pans. Start above the net, which the fit leaves
  // clear, and inside the visible region.
  const from = { x: visible.left + 60, y: paneTop + 30 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + plan.panX, from.y + plan.panY, { steps: 12 });
  await page.mouse.up();
  await pause(300);

  const framed = await nodeBox(page);
  log?.(
    `zoomed x${plan.steps}, panned ${Math.round(plan.panX)},${Math.round(plan.panY)}; ` +
      `net spans ${framed.left}..${framed.right} of ${viewport.width}, ` +
      `${Math.round(((framed.right - framed.left) / viewport.width) * 100)}% of the width`,
  );
  return framed;
};

/**
 * Clicks a node by its id, gliding the mirrored pointer onto it first, and
 * checks the node ended up selected.
 *
 * The check matters: the minimap floats over the canvas's top-right corner and
 * swallows a click aimed at a node underneath it, which looks like nothing
 * happening rather than like an error. Compact nodes overlap at coordinates
 * placed for circles, which does the same. Prefer nodes away from that corner.
 */
export const selectNode = async (page, hud, id, ms = 800) => {
  const node = page.locator(`.react-flow__node[data-id="${id}"]`);
  await node.waitFor({ timeout: 10_000 });
  await hud.glideTo(node, ms);
  await hud.click();
  await pause(250);
  const selected = await node.evaluate((element) =>
    element.classList.contains("selected"),
  );
  if (!selected) {
    throw new Error(
      `clicking ${id} did not select it: something is drawn over it, ` +
        "the minimap and overlapping nodes being the usual causes",
    );
  }
};
