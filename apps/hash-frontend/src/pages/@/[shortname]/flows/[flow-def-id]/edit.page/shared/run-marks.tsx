import { css, cx } from "@hashintel/ds-helpers/css";
import { HashIconArtwork, StaticHashIcon } from "@hashintel/ds-icons/static";

import { getBarSegments, stepStateLabels } from "./step-states";

import type { ItemState, StepRunMark, StepState } from "./step-states";
import type { HashIconName } from "@hashintel/ds-icons/static";

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
const failedArc = css({ color: "status.error.fg.muted" });
const stateIcons: Record<StepState, HashIconName> = {
  notReached: "place",
  running: "loading",
  needsReview: "error",
  done: "check",
  doneWithFailures: "place",
  failed: "close",
  skipped: "stepForward",
};

export const RunGlyph = ({
  state,
  exclaim = false,
  size = 16,
  label = stepStateLabels[state],
}: {
  state: StepState;
  exclaim?: boolean;
  size?: 12 | 16;
  /** What it's named for screen readers, when it marks something other than a step, such as a whole run. */
  label?: string;
}) => {
  const exclaims = exclaim && state === "failed";

  const className = cx(
    glyph,
    glyphColors[state],
    state === "running" && spinning,
  );
  if (state === "doneWithFailures") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        role="img"
        aria-label={label}
        className={className}
      >
        <HashIconArtwork name="place" />
        <g className={failedArc} style={{ clipPath: "inset(0 50% 0 0)" }}>
          <HashIconArtwork name="place" />
        </g>
      </svg>
    );
  }
  return (
    <StaticHashIcon
      name={exclaims ? "error" : stateIcons[state]}
      size={size}
      aria-label={label}
      strokeDasharray={state === "notReached" ? "1 4" : undefined}
      className={className}
    />
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
