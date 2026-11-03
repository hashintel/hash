/**
 * A stepped part of a drawing on a slide: what a d2 shape or connection, or
 * an element of a deck's own SVG, compiles to when its classes name steps.
 *
 * States hold from their step on: the part shows from `at` and hides from
 * `until`, and from `draw` it shows, drawing its lines from start to end,
 * arrowhead last, on that step. The drawing runs on that step alone, so a
 * flow on a later step that ends never replays it. Events happen on their step alone: on a step in `flow`
 * dashes run along its lines, on a step in `focus` the rest of the drawing
 * fades, and on a step in `tokens` a token travels `path` from start to
 * end. The motion lives in the deck's CSS, which drops it in print and for
 * reduced motion.
 */

import { useStep } from "./stepper";

import type { CSSProperties, ReactNode } from "react";

const lines = "path, line, polyline, polygon, rect, circle, ellipse";

/** Each line's length, for the CSS that draws it. */
const measureLines = (part: SVGGElement | null): void => {
  for (const line of part?.querySelectorAll<SVGGeometryElement>(lines) ?? []) {
    line.style.setProperty("--deck-length", String(line.getTotalLength()));
  }
};

export const DiagramPart = ({
  at = 0,
  until,
  draw,
  flow = [],
  focus = [],
  tokens = [],
  path,
  children,
}: {
  at?: number;
  until?: number;
  draw?: number;
  flow?: readonly number[];
  focus?: readonly number[];
  tokens?: readonly number[];
  /** The line a token travels, in the drawing's coordinates. */
  path?: string;
  children: ReactNode;
}) => {
  const step = useStep();
  const shown =
    step >= Math.max(at, draw ?? 0) && (until === undefined || step < until);
  return (
    <g
      ref={draw === undefined ? undefined : measureLines}
      className="deck-part"
      data-visible={shown}
      data-drawing={draw === step}
      data-flowing={flow.includes(step)}
      data-focused={focus.includes(step)}
      aria-hidden={!shown}
    >
      {children}
      {path !== undefined && tokens.includes(step) ? (
        <circle
          className="deck-token"
          r={7}
          style={{ offsetPath: `path("${path}")` } as CSSProperties}
        />
      ) : null}
    </g>
  );
};
