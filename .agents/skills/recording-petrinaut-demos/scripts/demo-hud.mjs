// A head-up display for a demo take: the macOS pointer and a row of key caps,
// drawn over the app so a viewer can follow the input.
//
// The layer is `position: fixed`, `pointer-events: none`, and at the top of the
// stacking order, so it takes no layout space, never appears in hit testing,
// and sits over any modal the app draws. React only manages its own root
// container, so appending to the body does not disturb it.
//
// Playwright draws no cursor into a screencast, so the arrow is a mirror. Every
// gesture drives the real input and the mirror from one call, so the mirror is
// never at a different point from the real pointer, and hover states track the
// glide rather than firing ahead of it.
//
// Usage from a scenario:
//   import path from "node:path";
//   import { pathToFileURL } from "node:url";
//   const scripts = ".agents/skills/recording-petrinaut-demos/scripts";
//   const { createDemoHud } = await import(
//     pathToFileURL(path.join(process.cwd(), scripts, "demo-hud.mjs")).href
//   );
//
//   let hud;
//   export const prepare = async (page) => {
//     const viewport = page.viewportSize();
//     hud = createDemoHud(page, {
//       rest: { x: viewport.width - 190, y: viewport.height - 120 },
//     });
//     await hud.install();          // the arrow starts hidden
//   };
//   export const take = async (page) => {
//     await hud.press("Meta+k");    // caps: the modifier, then the key
//     await hud.type("layout");     // no caps: the field shows the text
//     await hud.press("Enter");
//     await hud.showPointer();
//     await hud.glideTo(page.getByRole("button", { name: "Run" }));
//     await hud.click();
//     await hud.down();            // drag: press, glide, release
//     await hud.glide(x, y, 1400);
//     await hud.up();
//     await hud.hidePointer();
//   };
//
// The shape follows the app: wherever the element under the pointer asks for
// a horizontal resize cursor, the arrow becomes the system's double arrow,
// and a `down` holds that shape until the matching `up`.

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs in the page. Self-contained on purpose: `page.evaluate` serializes the
 * function, so it can close over nothing.
 *
 * The pointer is the macOS arrow, the two-path white-over-black shape the
 * system draws, whose tip is at (10.01, 7.41) of its 32-unit box.
 */
const installHud = () => {
  if (document.getElementById("__demo_hud")) {
    return;
  }

  // A little over life size: at 1x the arrow reads small against an app
  // recorded at 1300 CSS px and shown at 1600.
  const SCALE = 1.25;
  const BOX = 32 * SCALE;
  // The resize cursor is drawn smaller than the arrow, the way the system's
  // is: a double arrow reads at a glance and does not need the arrow's reach.
  const RESIZE_BOX = 32 * SCALE * 0.78;
  // The macOS arrow's tip within its 32-unit box, and the centre hotspot the
  // resize cursor is drawn around.
  const TIPS = {
    arrow: { x: 10.01 * SCALE, y: 7.41 * SCALE },
    resize: { x: RESIZE_BOX / 2, y: RESIZE_BOX / 2 },
  };
  const SYSTEM_FONT =
    '-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",system-ui,sans-serif';

  const root = document.createElement("div");
  root.id = "__demo_hud";
  root.setAttribute("aria-hidden", "true");
  root.style.cssText = [
    "position:fixed",
    "inset:0",
    "pointer-events:none",
    "z-index:2147483647",
  ].join(";");

  // Two elements: the outer one carries the position, the inner one the
  // appear, press and leave animations, so a transform never fights a move.
  const pointer = document.createElement("div");
  pointer.style.cssText = [
    "position:absolute",
    "left:0",
    "top:0",
    `width:${BOX}px`,
    `height:${BOX}px`,
    "transform:translate(-80px,-80px)",
    "will-change:transform",
  ].join(";");

  const pointerBody = document.createElement("div");
  pointerBody.style.cssText = [
    `width:${BOX}px`,
    `height:${BOX}px`,
    // Scaled about the hotspot, so a press dips the cursor into the click.
    `transform-origin:${TIPS.arrow.x}px ${TIPS.arrow.y}px`,
    "transform:scale(0.6)",
    "opacity:0",
    "filter:drop-shadow(0 1px 1.5px rgba(0,0,0,0.32))",
  ].join(";");
  // Both shapes are drawn, and one is shown: switching display keeps the
  // press and leave animations on the same element.
  pointerBody.innerHTML = `
    <svg data-shape="arrow" width="${BOX}" height="${BOX}" viewBox="0 0 32 32" style="display:block">
      <g fill="none" fill-rule="evenodd" transform="translate(10 7)">
        <path fill="#fff" d="m6.148 18.473 1.863-1.003 1.615-.839-2.568-4.816h4.332l-11.379-11.408v16.015l3.316-3.221z"/>
        <path fill="#000" d="m6.431 17 1.765-.941-2.775-5.202h3.604l-8.025-8.043v11.188l2.53-2.442z"/>
      </g>
    </svg>
    <svg data-shape="resize" width="${RESIZE_BOX}" height="${RESIZE_BOX}" viewBox="0 0 32 32" style="display:none">
      <path
        d="M4 16 10 11 10 14 22 14 22 11 28 16 22 21 22 18 10 18 10 21Z"
        fill="#000" stroke="#fff" stroke-width="2.8" stroke-linejoin="round"
        paint-order="stroke"
      />
    </svg>`;
  pointer.append(pointerBody);

  // A click is marked at the pointer, the way KeyCastr marks one, rather than
  // in the caps.
  const ripple = document.createElement("div");
  ripple.style.cssText = [
    "position:absolute",
    "left:0",
    "top:0",
    `width:${34 * SCALE}px`,
    `height:${34 * SCALE}px`,
    `margin:${-17 * SCALE}px 0 0 ${-17 * SCALE}px`,
    "border-radius:50%",
    "border:2px solid rgba(28,32,40,0.55)",
    "opacity:0",
    "transform:translate(-80px,-80px) scale(0.4)",
  ].join(";");

  // Bottom left, inset from the edge: an app usually centres its own toolbar
  // along the bottom and stacks controls on the right.
  const capBar = document.createElement("div");
  capBar.style.cssText = [
    "position:absolute",
    "left:32px",
    "bottom:32px",
    "display:flex",
    "align-items:center",
    "gap:9px",
    "padding:14px 16px",
    "border-radius:18px",
    "background:rgba(24,26,32,0.82)",
    "border:1px solid rgba(255,255,255,0.10)",
    "box-shadow:0 10px 30px rgba(0,0,0,0.30)",
    "backdrop-filter:blur(14px)",
    "-webkit-backdrop-filter:blur(14px)",
    "opacity:0",
    "transform:translateY(8px)",
    "transition:opacity 130ms ease,transform 130ms ease",
  ].join(";");

  // Same corner and the same visual family as the caps, and never shown with
  // them: a location badge replaces the caps for a take about navigation,
  // where the URL is the subject and the keystrokes are not.
  const locationBar = document.createElement("div");
  locationBar.style.cssText = [
    "position:absolute",
    "left:32px",
    // Low in the corner. It carries a short label rather than the query
    // string now, so it no longer reaches the centred bottom toolbar.
    "bottom:44px",
    "display:flex",
    "align-items:center",
    "gap:11px",
    "padding:13px 22px",
    "border-radius:999px",
    "background:rgba(24,26,32,0.82)",
    "border:1px solid rgba(255,255,255,0.10)",
    "box-shadow:0 10px 30px rgba(0,0,0,0.30)",
    "backdrop-filter:blur(14px)",
    "-webkit-backdrop-filter:blur(14px)",
    `font-family:${SYSTEM_FONT}`,
    // No CSS transition here: each pop is a Web Animation with fill:both, and
    // a transition on the same properties fights it.
    "opacity:0",
  ].join(";");

  root.append(ripple, pointer, capBar, locationBar);
  document.body.append(root);

  let fadeTimer;
  let position = { x: -80, y: -80 };

  /** One key cap. A word key is wider than a single glyph. */
  const cap = (label) => {
    const element = document.createElement("span");
    element.textContent = label;
    const isWord = [...label].length > 1;
    element.style.cssText = [
      isWord ? "padding:0 15px" : "width:44px",
      "height:44px",
      "flex-shrink:0",
      "display:inline-flex",
      "align-items:center",
      "justify-content:center",
      "border-radius:10px",
      "background:linear-gradient(#fdfdfe,#eceef3)",
      "border:1px solid rgba(0,0,0,0.16)",
      "box-shadow:0 3px 0 rgba(0,0,0,0.22),inset 0 1px 0 #fff",
      `font-family:${SYSTEM_FONT}`,
      "font-size:22px",
      "font-weight:600",
      "line-height:1",
      "color:#15181f",
      "letter-spacing:0.2px",
    ].join(";");
    return element;
  };

  const show = () => {
    capBar.style.opacity = "1";
    capBar.style.transform = "translateY(0)";
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => {
      capBar.style.opacity = "0";
      capBar.style.transform = "translateY(8px)";
    }, 1200);
  };

  /**
   * What the transition was, not where it went. A reviewer reads the address
   * bar for the parameters; the badge only has to say that the route moved,
   * and which way, in the browser's own vocabulary.
   */
  const MOVE_LABEL = {
    back: "Back",
    forward: "Forward",
    new: "New location",
  };

  const label = (text) => {
    const shown = document.createElement("span");
    shown.textContent = text;
    shown.style.cssText = [
      "font-size:19px",
      "font-weight:600",
      "letter-spacing:0.2px",
      "line-height:1",
      "white-space:nowrap",
      "color:#f6f7f9",
    ].join(";");
    return shown;
  };

  /** The direction glyph, bare inside the pill rather than in its own chip. */
  const arrow = (glyph) => {
    const shown = document.createElement("span");
    shown.textContent = glyph;
    shown.style.cssText = [
      "flex-shrink:0",
      "font-size:21px",
      "font-weight:700",
      "line-height:1",
      "color:rgba(255,255,255,0.92)",
    ].join(";");
    return shown;
  };

  let locationOn = false;
  let pendingMove = null;
  let hideTimer;
  let lastSearch = null;

  /**
   * The badge pops for the transition and leaves, travelling the way the router
   * moved: a new location rises from the bottom and leaves through the top,
   * forward crosses left to right, back crosses right to left. The arrow runs
   * its own animation on top of that one, so the pill arrives and the arrow
   * kicks the same way.
   */
  const popLocation = (move) => {
    const kind = move ?? "new";
    const glyph =
      kind === "back" ? arrow("←") : kind === "forward" ? arrow("→") : null;
    const text = label(MOVE_LABEL[kind]);
    locationBar.replaceChildren(
      ...(kind === "back"
        ? [glyph, text]
        : kind === "forward"
          ? [text, glyph]
          : [text]),
    );

    // The pill crosses the corner in the direction the router moved: forward
    // left to right, back right to left, a new location bottom to top. Entry
    // and exit are two halves of that one move, so it leaves by carrying on
    // rather than retreating the way it came. The exit covers half the
    // distance, which reads as a departure rather than a second arrival.
    const enter =
      kind === "back"
        ? "translateX(18px)"
        : kind === "forward"
          ? "translateX(-18px)"
          : "translateY(14px)";
    const exit =
      kind === "back"
        ? "translateX(-9px)"
        : kind === "forward"
          ? "translateX(9px)"
          : "translateY(-7px)";

    locationBar.style.opacity = "1";
    locationBar.animate(
      [
        { opacity: 0, transform: enter },
        { opacity: 1, transform: "translate(0, 0)" },
      ],
      { duration: 180, easing: "cubic-bezier(0.2,0.9,0.25,1)", fill: "both" },
    );

    // Nested inside the pill, so this composes with the slide above instead of
    // replacing it. It starts behind the pill's own travel direction and
    // overshoots past its resting place, which reads as a flick rather than a
    // slide, and pulls the same way the pill and the glyph both point.
    if (glyph) {
      const reach = kind === "back" ? -1 : 1;
      glyph.animate(
        [
          { opacity: 0, transform: `translateX(${-7 * reach}px)` },
          { opacity: 1, transform: `translateX(${3 * reach}px)`, offset: 0.7 },
          { opacity: 1, transform: "translateX(0)" },
        ],
        {
          duration: 340,
          delay: 110,
          easing: "cubic-bezier(0.2,0.9,0.25,1)",
          fill: "both",
        },
      );
    }

    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      locationBar.animate(
        [
          { opacity: 1, transform: "translate(0, 0)" },
          { opacity: 0, transform: exit },
        ],
        { duration: 160, easing: "ease-in", fill: "both" },
      );
    }, 900);
  };

  /** Pops whenever the URL changes, so the badge cannot claim a stale one. */
  setInterval(() => {
    if (!locationOn) {
      return;
    }
    if (window.location.search !== lastSearch) {
      lastSearch = window.location.search;
      popLocation(pendingMove);
      pendingMove = null;
    }
  }, 60);

  let shape = "arrow";
  let held = false;

  /**
   * The shape the app itself asks for at that point. Reading the computed
   * cursor means the mirror cannot disagree with the real one, the way the
   * key caps come from the chord actually pressed.
   */
  const shapeUnder = (x, y) => {
    const element = document.elementFromPoint(x, y);
    if (!element) {
      return "arrow";
    }
    const cursor = window.getComputedStyle(element).cursor;
    return /^(ew|col|e|w)-resize$/u.test(cursor) ? "resize" : "arrow";
  };

  const setShape = (next) => {
    if (next === shape) {
      return;
    }
    shape = next;
    for (const svg of pointerBody.children) {
      svg.style.display = svg.dataset.shape === next ? "block" : "none";
    }
    const tip = TIPS[next];
    pointerBody.style.transformOrigin = `${tip.x}px ${tip.y}px`;
  };

  const place = () => {
    const tip = TIPS[shape];
    pointer.style.transform = `translate(${position.x - tip.x}px, ${position.y - tip.y}px)`;
    ripple.style.transform = `translate(${position.x}px, ${position.y}px) scale(0.4)`;
  };

  window.__demoHud = {
    /**
     * Arms the badge rather than showing it. It stays hidden until the URL
     * actually changes, then pops for that transition and leaves, so the take
     * reads as a sequence of route changes and not a permanent status line.
     */
    location(on) {
      locationOn = on;
      lastSearch = window.location.search;
      if (!on) {
        locationBar.style.opacity = "0";
      }
    },
    /** Tags the next pop with the history move about to produce it. */
    history(move) {
      pendingMove = move;
    },
    pointer(x, y) {
      position = { x, y };
      if (!held) {
        setShape(shapeUnder(x, y));
      }
      place();
    },
    /**
     * A press that starts a drag rather than ending in a click: the cursor
     * dips but no ring is left behind, and the shape it had on the way down
     * is held for the whole gesture. The element under the pointer stops
     * being the handle as soon as the drag moves, so resolving per frame
     * would flick the arrow back mid-resize.
     */
    grab() {
      held = true;
      pointerBody.animate(
        [
          { transform: "scale(1)" },
          { transform: "scale(0.88)", offset: 0.4 },
          { transform: "scale(1)" },
        ],
        { duration: 220, easing: "ease-out" },
      );
    },
    release() {
      held = false;
      setShape(shapeUnder(position.x, position.y));
      place();
    },
    /** Fades and scales the arrow in, so it arrives rather than blinking on. */
    enter() {
      pointerBody.animate(
        [
          { opacity: 0, transform: "scale(0.6)" },
          { opacity: 1, transform: "scale(1.06)", offset: 0.72 },
          { opacity: 1, transform: "scale(1)" },
        ],
        { duration: 340, easing: "cubic-bezier(0.2,0.9,0.25,1)", fill: "both" },
      );
    },
    leave() {
      pointerBody.animate(
        [
          { opacity: 1, transform: "scale(1)" },
          { opacity: 0, transform: "scale(0.65)" },
        ],
        { duration: 260, easing: "ease-in", fill: "both" },
      );
    },
    /** The arrow dips into the click, and a ring marks where it landed. */
    press() {
      pointerBody.animate(
        [
          { transform: "scale(1)" },
          { transform: "scale(0.82)", offset: 0.35 },
          { transform: "scale(1)" },
        ],
        { duration: 260, easing: "ease-out" },
      );
      const at = `translate(${position.x}px, ${position.y}px)`;
      ripple.style.transform = `${at} scale(0.4)`;
      ripple.animate(
        [
          { opacity: 0.9, transform: `${at} scale(0.4)` },
          { opacity: 0, transform: `${at} scale(1.35)` },
        ],
        { duration: 440, easing: "ease-out" },
      );
    },
    /**
     * Named keys and modifier chords only; never the characters typed into a
     * field. A chord arrives one cap at a time, so a call that extends what is
     * already shown appends rather than rebuilding, and only the new cap pops.
     */
    caps(labels) {
      const shown = [...capBar.children].map((child) => child.textContent);
      const extends_ =
        labels.length > shown.length &&
        shown.every((label, index) => label === labels[index]);
      const added = extends_
        ? labels.slice(shown.length).map(cap)
        : labels.map(cap);
      if (extends_) {
        capBar.append(...added);
      } else {
        capBar.replaceChildren(...added);
      }
      // Each cap rises into place, the way a key travels back up.
      for (const element of added) {
        element.animate(
          [
            { opacity: 0, transform: "translateY(9px)" },
            { opacity: 1, transform: "translateY(0)" },
          ],
          { duration: 150, easing: "cubic-bezier(0.2,0.9,0.25,1)" },
        );
      }
      show();
    },
  };
};

/**
 * Apple's own keycap legends: the glyph for a modifier, the printed word for a
 * named key. Derived from the chord actually pressed, so a cap can never
 * disagree with the keystroke.
 */
const CAP_LEGENDS = {
  meta: "⌘",
  control: "⌃",
  alt: "⌥",
  shift: "⇧",
  enter: "return",
  escape: "esc",
  tab: "tab",
  backspace: "delete",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
};

export const capLegends = (combo) =>
  combo
    .split("+")
    .map(
      (key) =>
        CAP_LEGENDS[key.toLowerCase()] ??
        (key.length === 1 ? key.toUpperCase() : key),
    );

const easeInOut = (t) =>
  t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) * (-2 * t + 2)) / 2;

/**
 * Drives the real input and its mirror together.
 *
 * `rest` is where the arrow waits; give it a point clear of the app's own
 * controls. `chordStagger` is the gap between the caps of one chord, so a
 * viewer reads the modifier before the key, the way it is actually held.
 */
export const createDemoHud = (page, { rest, chordStagger = 220 } = {}) => {
  let cursor = { ...rest };

  const mirror = (x, y) =>
    page.evaluate(([px, py]) => window.__demoHud?.pointer(px, py), [x, y]);

  const glide = async (x, y, ms = 620) => {
    const steps = Math.max(2, Math.round(ms / 22));
    const from = { ...cursor };
    for (let step = 1; step <= steps; step += 1) {
      const progress = easeInOut(step / steps);
      const nextX = from.x + (x - from.x) * progress;
      const nextY = from.y + (y - from.y) * progress;
      await page.mouse.move(nextX, nextY);
      await mirror(nextX, nextY);
      await pause(ms / steps);
    }
    cursor = { x, y };
  };

  return {
    /** Installed after the app has mounted, so nothing in its tree owns it. */
    async install() {
      await page.evaluate(installHud);
      await mirror(rest.x, rest.y);
      await page.mouse.move(rest.x, rest.y);
    },
    glide,
    async glideTo(locator, ms) {
      const box = await locator.boundingBox();
      if (!box) {
        throw new Error("cannot glide to a locator with no box");
      }
      await glide(box.x + box.width / 2, box.y + box.height / 2, ms);
    },
    async toRest(ms = 700) {
      await glide(rest.x, rest.y, ms);
    },
    async click() {
      await page.evaluate(() => window.__demoHud?.press());
      await page.mouse.down();
      await pause(90);
      await page.mouse.up();
    },
    /**
     * Press and release for a drag: `down`, then `glide` to drag, then `up`.
     * The cursor holds the shape it had at the press, so a resize keeps its
     * double arrow across the whole gesture.
     */
    async down() {
      await page.evaluate(() => window.__demoHud?.grab());
      await page.mouse.down();
    },
    async up() {
      await page.mouse.up();
      await page.evaluate(() => window.__demoHud?.release());
    },
    showPointer: () => page.evaluate(() => window.__demoHud?.enter()),
    hidePointer: () => page.evaluate(() => window.__demoHud?.leave()),
    /**
     * Arms the location badge, for a take whose subject is the URL. It pops on
     * each route change and leaves, so it shares the bottom-left corner with
     * the caps without either one having to be cleared.
     */
    showLocation: () => page.evaluate(() => window.__demoHud?.location(true)),
    hideLocation: () => page.evaluate(() => window.__demoHud?.location(false)),
    /**
     * Goes back or forward, tagging the pop with the direction it travelled.
     * Driven through the History API rather than Playwright's navigation,
     * because a router's entries are same-document and `goBack` resolves null
     * on those.
     */
    async history(direction) {
      await page.evaluate((move) => window.__demoHud?.history(move), direction);
      await page.evaluate((move) => {
        if (move === "back") {
          window.history.back();
        } else {
          window.history.forward();
        }
      }, direction);
    },
    /** A chord or a named key: shown on the caps, one cap at a time. */
    async press(combo) {
      const legends = capLegends(combo);
      for (let count = 1; count <= legends.length; count += 1) {
        await page.evaluate(
          (labels) => window.__demoHud?.caps(labels),
          legends.slice(0, count),
        );
        if (count < legends.length) {
          await pause(chordStagger);
        }
      }
      await page.keyboard.press(combo);
    },
    /** Characters into a field: the field shows them, so the caps stay quiet. */
    async type(text, perCharacter = 145) {
      for (const character of text) {
        await page.keyboard.type(character);
        await pause(perCharacter);
      }
    },
  };
};
