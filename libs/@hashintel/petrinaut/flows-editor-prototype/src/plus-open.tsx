/**
 * `?plusopen=a|b|c|old`: takes on tying the step picker to the "+" on a step's right edge. `c` is the default
 * (Aakarsh, 12 Nov). `old` is the picker as before: beside the + when 288 px fit inside the canvas, else below it with
 * its left edge pulled in, where the DS Menu may flip it up and away; the + fades out as the pointer leaves the card.
 *
 * - `a`: the picker opens 8 px right of the +, its top edge level with the +'s; the + stays pressed while it is open.
 * - `b`: as a, with the figma-ds Popover arrow (Arrow=Left, 42156:2241) pointing at the +.
 * - `c`: a dashed ghost step on the canvas where the new step lands (`plusLanding` in canvas.tsx: clear of every
 *   step, inside the For each the port is in, on the port's path row), joined to the + by a dashed wire; the picker
 *   opens beside the ghost, or under it when the + and the picker cannot both fit beside each other.
 *
 * Every take pans the canvas, once, when the picker would not fit inside it. Panning or zooming by hand closes it.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { useReactFlow } from "@xyflow/react";
import { css } from "@hashintel/ds-helpers/css";

/** Inside the app root, where the DS tokens and fonts are defined; the body has neither. */
const portalHost = () =>
  globalThis.document.querySelector(".petrinaut-root") ?? globalThis.document.body;

const take = new URLSearchParams(globalThis.location.search).get("plusopen");

export const plusOpenTake: "a" | "b" | "c" | null =
  take === "a" || take === "b" ? take : take === "old" ? null : "c";

/**
 * `?ghost=today|g70|dashed`: how take c's ghost step looks (inbox `add-ghost-look`, 12 Nov). `today` is the default.
 * - `today`: dashed outline in the ghost border colour at 50%, faint dashed wire.
 * - `g70`: the ghost triggers' look (C-007): a step card at 70% titled "New step", solid faint wire.
 * - `dashed`: figma-ds dropzone (_DropzoneFileUpload 21276:17716): neutral/bg/subtle/default fill, a 1 px dashed
 *   border at its hover's border-emphasis (neutral.bd.solid.hover), full strength; dashed wire at neutral.bd.strong.
 */
const ghostParam = new URLSearchParams(globalThis.location.search).get("ghost");

export const plusGhostLook: "today" | "g70" | "dashed" =
  ghostParam === "g70" || ghostParam === "dashed" ? ghostParam : "today";

/** The picker's width with step rows (`add-node-picker.tsx`), the DS Menu's gap, and the room kept at the canvas edge. */
const pickerWidth = 288;
const menuGap = 8;
const canvasRoom = 24;

/** figma-ds Popover Arrow=Left: 12 px out, a 15.6 px base, 24 px down so it clears the 10 px corner. */
const arrowOut = 12;
const arrowHalf = 7.8;
const arrowDown = 24;

type Position = "right-start" | "bottom-start";

/** `position`: the picker opens beside the ghost, or under it when the + and a picker beside it cannot both fit. */
type Layout = { plus: DOMRect; ghost: DOMRect | null; position: Position };

const portAdd = (stepId: string, port: string) =>
  globalThis.document.querySelector<HTMLElement>(
    `[data-port-add="${stepId}:${port}"]`,
  );

/** `c`: the ghost is a canvas node (`PLUS_GHOST_ID` in canvas.tsx), so it pans and zooms with the canvas. */
const ghostRect = () => {
  const rect = globalThis.document
    .querySelector('.react-flow__node[data-id="plus-ghost"]')
    ?.getBoundingClientRect();
  return rect && rect.width > 0 ? rect : null;
};

const measure = (
  stepId: string,
  port: string,
  withGhost: boolean,
  position: Position,
): Layout | null => {
  const plus = portAdd(stepId, port)?.getBoundingClientRect();
  if (!plus) {
    return null;
  }
  const ghost = withGhost ? ghostRect() : null;
  if (withGhost && !ghost) {
    return null;
  }
  return { plus, ghost, position };
};

/** The rect the menu opens from: beside it (`right-start`, the DS gap to its right) or under it (`bottom-start`). */
const menuAnchor = (layout: Layout, arrow: boolean) => {
  const { plus, ghost } = layout;
  const rect = ghost
    ? ghost
    : arrow
      ? new DOMRect(plus.left, plus.top + plus.height / 2 - arrowDown, plus.width + arrowOut - 4, 1)
      : plus;
  return {
    current: {
      getBoundingClientRect: () => rect,
      closest: () => null,
    },
  } as unknown as React.RefObject<Element | null>;
};

const overlayStyle = css({
  position: "fixed",
  pointerEvents: "none",
  zIndex: "[5]",
});

/**
 * How far to pan so the picker fits: beside the ghost (or the +) when the + stays on the canvas, else under the ghost.
 * Positive x moves the canvas right; positive y moves it down.
 */
const fitShift = (
  layout: Layout,
  canvas: DOMRect,
  menuHeight: number,
  arrow: boolean,
): { x: number; y: number; position: Position } => {
  const { plus, ghost } = layout;
  const left = canvas.left + canvasRoom;
  const right = canvas.right - canvasRoom;
  const top = canvas.top + canvasRoom;
  const bottom = canvas.bottom - canvasRoom;
  const opensAt = ghost ? ghost.right : plus.right + (arrow ? arrowOut - 4 : 0);
  const anchorTop = ghost ? ghost.top : plus.top;
  const besideWidth = opensAt + menuGap + pickerWidth - plus.left;
  const vertical = (from: number, height: number) =>
    from < top ? top - from : Math.min(0, bottom - (from + height));
  if (!ghost || besideWidth <= right - left) {
    const shortX = Math.max(0, opensAt + menuGap + pickerWidth - right);
    const pastLeft = Math.max(0, left - plus.left);
    return {
      x: pastLeft > 0 ? pastLeft : -shortX,
      y: vertical(anchorTop, menuHeight),
      position: "right-start",
    };
  }
  // Too narrow for both: the picker under the ghost, the ghost's left edge on the canvas.
  const width = Math.max(ghost.width, pickerWidth);
  const x =
    ghost.left < left
      ? left - ghost.left
      : Math.min(0, right - (ghost.left + width));
  return {
    x,
    y: vertical(ghost.top, ghost.height + menuGap + menuHeight),
    position: "bottom-start",
  };
};

/** The Popover's left arrow, drawn over the menu's edge so its border runs into the arrow's. */
const Arrow = ({ layout }: { layout: Layout }) => {
  const [colours, setColours] = useState<{ fill: string; line: string } | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      const menu = globalThis.document.querySelector(
        '[data-scope="menu"][data-part="content"][data-state="open"]',
      );
      const style = menu ? getComputedStyle(menu) : null;
      setColours(
        style
          ? { fill: style.backgroundColor, line: style.borderLeftColor }
          : null,
      );
    }, 120);
    return () => clearTimeout(timer);
  }, []);
  if (!colours) {
    return null;
  }
  const { plus } = layout;
  const edge = plus.right + arrowOut - 4 + menuGap;
  const centre = plus.top + plus.height / 2;
  return (
    <svg
      className={overlayStyle}
      style={{
        left: edge - arrowOut,
        top: centre - arrowHalf - 1,
        width: arrowOut + 2,
        height: arrowHalf * 2 + 2,
        zIndex: 2147483000,
      }}
      viewBox={`0 0 ${arrowOut + 2} ${arrowHalf * 2 + 2}`}
      aria-hidden
    >
      <path
        d={`M ${arrowOut + 1.5} 1 L 0.5 ${arrowHalf + 1} L ${arrowOut + 1.5} ${arrowHalf * 2 + 1} Z`}
        fill={colours.fill}
      />
      <path
        d={`M ${arrowOut} 1 L 0.5 ${arrowHalf + 1} L ${arrowOut} ${arrowHalf * 2 + 1}`}
        fill="none"
        stroke={colours.line}
        strokeWidth={1}
        strokeLinejoin="round"
      />
    </svg>
  );
};

/**
 * Opens the picker for a port's + in the take's place: pans the canvas so the picker fits, measures the + (and the
 * ghost), then renders `menu` against that anchor. The menu stays where it opened, as a DS Menu does; panning or
 * zooming by hand closes it (canvas.tsx `onMoveStart`).
 */
export const PlusOpenFrame = ({
  stepId,
  port,
  menuHeight,
  menu,
}: {
  stepId: string;
  port: string;
  /** About how tall the picker opens, so the canvas can make room under the + before it does. */
  menuHeight: number;
  menu: (
    anchor: React.RefObject<Element | null>,
    position: Position,
  ) => React.ReactNode;
}) => {
  const flow = useReactFlow();
  const [layout, setLayout] = useState<Layout | null>(null);
  const [settled, setSettled] = useState(false);
  const takeNow = plusOpenTake;
  const ghostOn = takeNow === "c";
  const arrow = takeNow === "b";

  // Before it opens: wait for the ghost node, then pan the canvas so the picker fits beside it (or under it).
  useEffect(() => {
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const open = () => {
      const first = measure(stepId, port, ghostOn, "right-start");
      const canvas = globalThis.document
        .querySelector(".react-flow")
        ?.getBoundingClientRect();
      if (!first || !canvas) {
        tries += 1;
        if (tries < 20) {
          timer = setTimeout(open, 30);
        }
        return;
      }
      const shift = fitShift(first, canvas, menuHeight, arrow);
      if (shift.x === 0 && shift.y === 0) {
        setLayout({ ...first, position: shift.position });
        return;
      }
      const { x, y, zoom } = flow.getViewport();
      void flow.setViewport({ x: x + shift.x, y: y + shift.y, zoom });
      timer = setTimeout(
        () => setLayout(measure(stepId, port, ghostOn, shift.position)),
        60,
      );
    };
    open();
    return () => clearTimeout(timer);
    // The port and its picker stay the same while it is open, so this runs once, when it opens.
  }, [flow, stepId, port, menuHeight, ghostOn, arrow]);

  // Once it is open: if the menu still had to move to fit, the canvas moves the + (and the ghost) to meet it.
  useEffect(() => {
    if (!layout || settled || layout.position !== "right-start") {
      return;
    }
    const timer = setTimeout(() => {
      setSettled(true);
      const opened = globalThis.document
        .querySelector('[data-scope="menu"][data-part="content"][data-state="open"]')
        ?.getBoundingClientRect();
      const meant = menuAnchor(layout, arrow).current?.getBoundingClientRect().top;
      if (!opened || meant === undefined || Math.abs(opened.top - meant) < 1) {
        return;
      }
      const { x, y, zoom } = flow.getViewport();
      void flow.setViewport({ x, y: y + opened.top - meant, zoom });
      setTimeout(
        () => setLayout(measure(stepId, port, ghostOn, layout.position)),
        60,
      );
    }, 160);
    return () => clearTimeout(timer);
  }, [layout, settled, flow, stepId, port, ghostOn, arrow]);

  if (!layout || !takeNow) {
    return null;
  }
  return (
    <>
      {arrow ? createPortal(<Arrow layout={layout} />, portalHost()) : null}
      {menu(menuAnchor(layout, arrow), layout.position)}
    </>
  );
};
