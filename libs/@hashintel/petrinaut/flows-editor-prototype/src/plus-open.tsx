/**
 * `?plusopen=a|b|c`: takes on tying the step picker to the "+" on a step's right edge. With no flag, the picker
 * opens as before: beside the + when 288 px fit inside the canvas, else below it with its left edge pulled in, where
 * the DS Menu may flip it up and away; the + fades out as the pointer leaves the card.
 *
 * - `a`: the picker opens 8 px right of the +, its top edge level with the +'s; the + stays pressed while it is open.
 * - `b`: as a, with the figma-ds Popover arrow (Arrow=Left, 42156:2241) pointing at the +.
 * - `c`: as a, with a dashed ghost step where the new step lands, joined to the + by a dashed wire; the picker
 *   opens beside the ghost.
 *
 * Every take pans the canvas left, once, when the picker would not fit inside it.
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
  take === "a" || take === "b" || take === "c" ? take : null;

/** A step card and the gap after it (`document.ts` addStep), and the row a second branch drops to. */
const columnStep = 200 + 96;
const branchRow = 120;

/** The picker's width with step rows (`add-node-picker.tsx`), the DS Menu's gap, and the room kept at the canvas edge. */
const pickerWidth = 288;
const menuGap = 8;
const canvasRoom = 24;

/** figma-ds Popover Arrow=Left: 12 px out, a 15.6 px base, 24 px down so it clears the 10 px corner. */
const arrowOut = 12;
const arrowHalf = 7.8;
const arrowDown = 24;

type Layout = { plus: DOMRect; ghost: DOMRect | null; zoom: number };

const portAdd = (stepId: string, port: string) =>
  globalThis.document.querySelector<HTMLElement>(
    `[data-port-add="${stepId}:${port}"]`,
  );

const measure = (
  stepId: string,
  port: string,
  branch: number,
  zoom: number,
  withGhost: boolean,
): Layout | null => {
  const plus = portAdd(stepId, port)?.getBoundingClientRect();
  const node = globalThis.document
    .querySelector(`.react-flow__node[data-id="${stepId}"]`)
    ?.getBoundingClientRect();
  if (!plus || !node) {
    return null;
  }
  return {
    plus,
    zoom,
    ghost: withGhost
      ? new DOMRect(
          node.left + columnStep * zoom,
          node.top + branch * branchRow * zoom,
          200 * zoom,
          node.height,
        )
      : null,
  };
};

/** The rect the menu opens beside, `right-start`: its left edge is this rect's right edge plus the DS gap. */
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

const ghostStyle = css({
  position: "fixed",
  pointerEvents: "none",
  zIndex: "[5]",
  backgroundColor: "neutral.bgSolid.min",
  borderWidth: "thin",
  borderStyle: "dashed",
  borderColor: "[var(--flows-ghost-border)]",
  opacity: "[0.5]",
});

const Ghost = ({ layout }: { layout: Layout }) => {
  const { plus, ghost, zoom } = layout;
  if (!ghost) {
    return null;
  }
  const x1 = plus.right;
  const y1 = plus.top + plus.height / 2;
  const x2 = ghost.left;
  const y2 = ghost.top + ghost.height / 2;
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2) - 2;
  const width = Math.max(1, Math.abs(x2 - x1));
  const height = Math.abs(y2 - y1) + 4;
  const mid = (x1 + x2) / 2;
  return (
    <>
      <svg
        className={overlayStyle}
        style={{ left, top, width, height, overflow: "visible" }}
        aria-hidden
      >
        <path
          d={`M ${x1 - left} ${y1 - top} C ${mid - left} ${y1 - top}, ${mid - left} ${y2 - top}, ${x2 - left} ${y2 - top}`}
          fill="none"
          stroke="rgba(0, 0, 0, 0.2)"
          strokeWidth={1}
          strokeDasharray="3 2"
        />
      </svg>
      <div
        className={ghostStyle}
        style={{
          left: ghost.left,
          top: ghost.top,
          width: ghost.width,
          height: ghost.height,
          borderRadius: 8 * zoom,
        }}
      />
    </>
  );
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
 * ghost), then renders `menu` against that anchor. The menu stays where it opened, as a DS Menu does.
 */
export const PlusOpenFrame = ({
  stepId,
  port,
  branch,
  menuHeight,
  menu,
}: {
  stepId: string;
  port: string;
  /** The row the new step drops to: wires already on this port, plus one for a false port. */
  branch: number;
  /** About how tall the picker opens, so the canvas can make room under the + before it does. */
  menuHeight: number;
  menu: (anchor: React.RefObject<Element | null>) => React.ReactNode;
}) => {
  const flow = useReactFlow();
  const [layout, setLayout] = useState<Layout | null>(null);
  const [settled, setSettled] = useState(false);
  const takeNow = plusOpenTake;
  const ghostOn = takeNow === "c";

  // Before it opens: pan the canvas so the picker fits right of the + (or the ghost) and below its top.
  useEffect(() => {
    const zoom = flow.getZoom();
    const first = measure(stepId, port, branch, zoom, ghostOn);
    const canvas = globalThis.document
      .querySelector(".react-flow")
      ?.getBoundingClientRect();
    if (!first || !canvas) {
      return;
    }
    const opensAt = first.ghost
      ? first.ghost.right
      : first.plus.right + (takeNow === "b" ? arrowOut - 4 : 0);
    const top = menuAnchor(first, takeNow === "b").current?.getBoundingClientRect().top ?? 0;
    const shortX = Math.max(0, opensAt + menuGap + pickerWidth - (canvas.right - canvasRoom));
    const shortY = Math.max(0, top + menuHeight - (canvas.bottom - canvasRoom));
    if (shortX === 0 && shortY === 0) {
      setLayout(first);
      return;
    }
    const { x, y } = flow.getViewport();
    void flow.setViewport({ x: x - shortX, y: y - shortY, zoom });
    const timer = setTimeout(
      () => setLayout(measure(stepId, port, branch, zoom, ghostOn)),
      60,
    );
    return () => clearTimeout(timer);
    // The port and its picker stay the same while it is open, so this runs once, when it opens.
  }, [flow, stepId, port, branch, menuHeight, takeNow, ghostOn]);

  // Once it is open: if the menu still had to move to fit, the canvas moves the + (and the ghost) to meet it.
  useEffect(() => {
    if (!layout || settled) {
      return;
    }
    const timer = setTimeout(() => {
      setSettled(true);
      const opened = globalThis.document
        .querySelector('[data-scope="menu"][data-part="content"][data-state="open"]')
        ?.getBoundingClientRect();
      const meant = menuAnchor(layout, takeNow === "b").current?.getBoundingClientRect().top;
      if (!opened || meant === undefined || Math.abs(opened.top - meant) < 1) {
        return;
      }
      const { x, y, zoom } = flow.getViewport();
      void flow.setViewport({ x, y: y + opened.top - meant, zoom });
      setTimeout(
        () => setLayout(measure(stepId, port, branch, zoom, ghostOn)),
        60,
      );
    }, 160);
    return () => clearTimeout(timer);
  }, [layout, settled, flow, stepId, port, branch, takeNow, ghostOn]);

  if (!layout || !takeNow) {
    return null;
  }
  return (
    <>
      {createPortal(
        <>
          <Ghost layout={layout} />
          {takeNow === "b" ? <Arrow layout={layout} /> : null}
        </>,
        portalHost(),
      )}
      {menu(menuAnchor(layout, takeNow === "b"))}
    </>
  );
};
