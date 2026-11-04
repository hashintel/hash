/**
 * Run marks, decided 4 Nov ("run marks B"): a state glyph for steps that run once, a segmented bar along the card's
 * bottom edge for steps inside a For each. No colour dots. Blue = in progress, orange = needs review, and red is
 * pushed deeper (Figma Red/solid/s110) so it reads apart from orange.
 *
 * The glyphs follow the local Figma set 1196:88872. DS gap: ds-components has no run-state icons (no filled
 * check-circle, no half-filled ring), so they are drawn here.
 */
import { css } from "@hashintel/ds-helpers/css";

import { barColor, statusColor } from "./status-colors";

import type { BarSegment, StepState } from "./run-history";

const green = statusColor.done;
const red = statusColor.failed;
const blue = statusColor.running;
const orange = statusColor.review;
const grey = statusColor.quiet;
const white = statusColor.onSolid;

const Tick = () => (
  <path
    d="M3.6 6.2 5.2 7.8 8.4 4.4"
    fill="none"
    stroke="white"
    strokeWidth="1.4"
    strokeLinecap="round"
    strokeLinejoin="round"
  />
);

const glyphLabel: Record<StepState, string> = {
  notReached: "Not reached",
  running: "Running",
  done: "Done",
  failed: "Failed",
  needsReview: "Needs review",
  skipped: "Skipped",
  abandoned: "Abandoned",
  doneWithFailures: "Done with failures",
};

/** One state's glyph, 12 px by default, drawn on a 12 px grid. */
export const RunGlyph = ({
  state,
  size = 12,
}: {
  state: StepState;
  size?: number;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 12 12"
    role="img"
    aria-label={glyphLabel[state]}
    data-run-glyph={state}
    className={css({ flexShrink: 0, overflow: "visible" })}
  >
    {state === "notReached" ? (
      <circle
        cx="6"
        cy="6"
        r="5.25"
        fill="none"
        stroke={grey}
        strokeWidth="1.2"
      />
    ) : state === "running" ? (
      <>
        <circle
          cx="6"
          cy="6"
          r="5.25"
          fill="none"
          stroke={blue}
          strokeWidth="1.2"
        />
        <path d="M6 0.75a5.25 5.25 0 0 1 0 10.5z" fill={blue} />
      </>
    ) : state === "done" ? (
      <>
        <circle cx="6" cy="6" r="6" fill={green} />
        <Tick />
      </>
    ) : state === "failed" ? (
      <>
        <circle cx="6" cy="6" r="6" fill={red} />
        <path
          d="M4.1 4.1 7.9 7.9M7.9 4.1 4.1 7.9"
          stroke="white"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </>
    ) : state === "needsReview" ? (
      <>
        <circle cx="6" cy="6" r="6" fill={orange} />
        <path
          d="M6 3v3.6"
          stroke="white"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="6" cy="8.7" r="0.85" fill="white" />
      </>
    ) : state === "skipped" ? (
      <>
        <circle
          cx="6"
          cy="6"
          r="5.25"
          fill="none"
          stroke={grey}
          strokeWidth="1.2"
        />
        <path
          d="M3.8 6h4.4"
          stroke={grey}
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </>
    ) : state === "abandoned" ? (
      <>
        <circle cx="6" cy="6" r="6" fill={grey} />
        <rect x="4" y="4" width="4" height="4" rx="0.6" fill="white" />
      </>
    ) : (
      <>
        <circle cx="6" cy="6" r="6" fill={green} />
        <Tick />
        <circle
          cx="10.2"
          cy="10.2"
          r="2.6"
          fill={red}
          stroke={white}
          strokeWidth="1.2"
        />
      </>
    )}
  </svg>
);

const pulseStyle = css({ animation: "pulse" });

/**
 * A card's run bar: 3 px (2 px all but vanished at the run view's 45% zoom), inside the card's bottom edge and clipped to its corners, in neutral greys for now
 * (`barColor`). A step that runs once fills it; a step that runs per item gets one segment per item with 2 px gaps,
 * or proportional groups when the items would not fit. A running segment pulses.
 */
export const RunBar = ({
  segments,
  height = 3,
  gap = 2,
}: {
  segments: BarSegment[];
  height?: number;
  gap?: number;
}) => {
  const items = segments.reduce((sum, segment) => sum + segment.count, 0);
  // One segment per item while each stays at least 4 px on a 200 px card.
  const perItem = items > 1 && items <= 40;
  const parts = perItem
    ? segments.flatMap((segment) =>
        Array.from({ length: segment.count }, (_, index) => ({
          key: `${segment.state}-${index}`,
          state: segment.state,
          grow: 1,
        })),
      )
    : segments.map((segment) => ({
        key: segment.state,
        state: segment.state,
        grow: segment.count,
      }));
  return (
    <span
      aria-hidden
      data-run-bar
      style={{ height, gap }}
      className={css({
        position: "absolute",
        left: "[0]",
        right: "[0]",
        bottom: "[0]",
        display: "flex",
        overflow: "hidden",
        // The card's corner less its 1 px border, so the bar follows the inside of the curve.
        borderBottomRadius: "[calc(var(--radii-lg) - 1px)]",
        pointerEvents: "none",
      })}
    >
      {parts.map((part) => (
        <span
          key={part.key}
          data-segment={part.state}
          style={{
            flexGrow: part.grow,
            flexBasis: 0,
            minWidth: 2,
            backgroundColor: barColor[part.state],
          }}
          className={part.state === "running" ? pulseStyle : undefined}
        />
      ))}
    </span>
  );
};
