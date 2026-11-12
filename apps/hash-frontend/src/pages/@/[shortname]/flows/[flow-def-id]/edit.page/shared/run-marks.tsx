import { css, cx } from "@hashintel/ds-helpers/css";

import { getBarSegments } from "./step-states";

import type { ItemState, StepRunMark, StepState } from "./step-states";
import type { ReactNode } from "react";

const stepStateLabels: Record<StepState, string> = {
  notReached: "Not reached",
  running: "Running",
  needsReview: "Needs review",
  done: "Done",
  doneWithFailures: "Done with failures",
  failed: "Failed",
  skipped: "Skipped",
};

const glyphColors: Record<StepState, string> = {
  notReached: css({ color: "bd.strong" }),
  running: css({ color: "status.info.fg.muted" }),
  needsReview: css({ color: "status.warning.fg.muted" }),
  done: css({ color: "status.success.fg.muted" }),
  doneWithFailures: css({ color: "status.success.fg.muted" }),
  failed: css({ color: "status.error.fg.muted" }),
  skipped: css({ color: "fg.subtle" }),
};

const glyph = css({ flexShrink: "0", overflow: "visible" });
/* The design system's own keyframes, as its loading spinner uses. */
const spinning = css({
  animation: "rotateRight 1.2s linear infinite",
  _motionReduce: { animation: "none" },
});
const failedArc = css({ stroke: "status.error.fg.muted" });

/* The F3 set from the flows editor prototype, drawn on a 16px grid. */
const glyphPaths: Record<StepState, ReactNode> = {
  notReached: (
    <circle
      cx="8"
      cy="8"
      r="4"
      strokeDasharray="0.01 3.13"
      transform="rotate(-90 8 8)"
    />
  ),
  running: (
    <>
      <circle cx="8" cy="8" r="4" opacity="0.25" />
      <path d="M8 4 A4 4 0 0 1 11.939 8.695" />
    </>
  ),
  needsReview: (
    <>
      <path d="M8 4.5V8.5" />
      <path d="M8 11.25h.01" strokeWidth="1.6" />
    </>
  ),
  done: <path d="M5.125 9 L7.5 11.375 L11.375 5.125" />,
  /* Equal halves, as the bar draws it: done on the right, failed on the left. */
  doneWithFailures: (
    <>
      <path d="M8.4 4.02 A4 4 0 0 1 8.4 11.98" />
      <path d="M7.6 11.98 A4 4 0 0 1 7.6 4.02" className={failedArc} />
    </>
  ),
  failed: <path d="M4.875 4.875 L11.125 11.125 M11.125 4.875 L4.875 11.125" />,
  skipped: <path d="M10.75 5.25 L5.25 10.75" />,
};

/**
 * A step state's glyph, named for screen readers. The design system has no run-state icons, so they're drawn here.
 * `exclaim` draws failed as "!", as needs review is, where it asks for a look rather than names the state.
 */
export const RunGlyph = ({
  state,
  exclaim = false,
  size = 16,
}: {
  state: StepState;
  exclaim?: boolean;
  size?: 12 | 16;
}) => {
  const exclaims = exclaim && state === "failed";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      role="img"
      aria-label={stepStateLabels[state]}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx(glyph, glyphColors[state], state === "running" && spinning)}
    >
      {exclaims ? glyphPaths.needsReview : glyphPaths[state]}
    </svg>
  );
};

/* As the design system hides its own text for screen readers. */
const visuallyHidden = css({
  position: "absolute",
  width: "[1px]",
  height: "[1px]",
  overflow: "clip",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
});

/** A step's state as text for screen readers only, for a card: its status bar is all that shows the state. */
export const StepStateText = ({ state }: { state: StepState }) => (
  <span className={visuallyHidden}>{stepStateLabels[state]}</span>
);

const segmentColors: Record<ItemState, string> = {
  done: css({ bg: "status.success.bg.solid" }),
  failed: css({ bg: "status.error.bg.solid" }),
  needsReview: css({ bg: "status.warning.bg.solid" }),
  running: css({ bg: "status.info.bg.solid" }),
  skipped: css({ bg: "bd.strong" }),
  notReached: css({ bg: "bd.subtle" }),
};

/* Inside the card's border, clipped to its corners so the bar follows their curve. */
const barClip = css({
  position: "absolute",
  inset: "0",
  overflow: "hidden",
  borderRadius: "[inherit]",
  pointerEvents: "none",
});
const bar = css({
  position: "absolute",
  left: "0",
  right: "0",
  bottom: "0",
  display: "flex",
  gap: "0.5",
  height: "1",
});
/* Wide enough to see however few items it stands for. */
const segment = css({ flexBasis: "0", minWidth: "1" });

/** The status bar along the bottom of a card, split by item for a step that runs per item. */
export const StatusBar = ({ mark }: { mark: StepRunMark }) => (
  <span aria-hidden className={barClip}>
    <span className={bar}>
      {getBarSegments(mark).map(({ state, weight }) => (
        <span
          key={state}
          className={cx(segment, segmentColors[state])}
          style={{ flexGrow: weight }}
        />
      ))}
    </span>
  </span>
);
