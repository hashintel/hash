/**
 * Run marks, decided 4 Nov ("run marks B"): a state glyph for steps that run once, a segmented bar along the card's
 * bottom edge for steps inside a For each. No colour dots. Blue = in progress, orange = needs review, and red is
 * pushed deeper (Figma Red/solid/s110) so it reads apart from orange.
 *
 * The glyphs follow the local Figma set 1196:88872. DS gap: ds-components has no run-state icons (no filled
 * check-circle, no half-filled ring), so they are drawn here.
 */
import { css } from "@hashintel/ds-helpers/css";

import type { BarSegment, StepState } from "./run-history";

const green = "var(--colors-green-bg-solid)";
const red = "var(--colors-red-s110)";
const blue = "var(--colors-blue-bg-solid)";
const orange = "var(--colors-orange-bg-solid)";
const grey = "var(--colors-neutral-fg-subtle)";
const white = "var(--colors-neutral-bg-solid-min)";

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

const segmentColour: Record<BarSegment["state"], string> = {
  done: green,
  failed: red,
  running: blue,
  skipped: "var(--colors-neutral-bg-solid-subtle-hover)",
  rest: "var(--colors-neutral-bg-solid-subtle-hover)",
};

/** The For each bar: one segment per state, in proportion to its items, 1.5 px white gaps between. */
export const RunBar = ({
  segments,
  height = 4,
  gap = 1.5,
}: {
  segments: BarSegment[];
  height?: number;
  gap?: number;
}) => (
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
      borderBottomRadius: "lg",
      pointerEvents: "none",
    })}
  >
    {segments.map((segment) => (
      <span
        key={segment.state}
        data-segment={segment.state}
        style={{
          flexGrow: segment.count,
          flexBasis: 0,
          minWidth: 3,
          backgroundColor: segmentColour[segment.state],
        }}
      />
    ))}
  </span>
);
