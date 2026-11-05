/**
 * A status cell: one F3 glyph and, only when it adds something, a short muted text (Aakarsh, 4 Nov: "this sort of
 * double tick representation is ridiculous"). Never a tick or cross character in the text; the glyph's tooltip
 * names the state.
 *
 * - done, run once: the glyph alone; done, repeated: "18"
 * - running or partly done: the progress ring and "6 of 20"
 * - failed: the cross and its reason, "Timed out"
 * - needs review: "Needs review"
 * - not reached, skipped: the glyph alone, muted
 */
import { css } from "@hashintel/ds-helpers/css";

import { RunGlyph } from "./run-glyph";

import type { ItemProgress, StepRun, StepState } from "./run-history";

const cellStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
  minWidth: "[0]",
  whiteSpace: "nowrap",
});

const textStyle = css({
  color: "neutral.fg.muted",
  fontVariantNumeric: "tabular-nums",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

/** The step list's quieter count, as its "6 steps". */
const smallTextStyle = css({
  textStyle: "xxs",
  color: "neutral.fg.subtle",
  fontVariantNumeric: "tabular-nums",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

/** The text a step's cell shows beside its glyph, by the rules above. */
export const cellText = ({ state, progress, count }: StepRun) => {
  const of = (items: ItemProgress) => `${items.done} of ${items.total}`;
  switch (state) {
    case "done":
      if (!progress || progress.total <= 1) {
        return undefined;
      }
      return progress.done === progress.total
        ? String(progress.total)
        : of(progress);
    case "running":
      return progress && progress.done + progress.failed > 0
        ? of(progress)
        : undefined;
    case "doneWithFailures":
    case "abandoned":
      return progress ? of(progress) : undefined;
    case "failed":
      return count ?? "Failed";
    case "needsReview":
      return "Needs review";
    default:
      return undefined;
  }
};

export const StatusCell = ({
  state,
  progress,
  text,
  detail,
  size,
  textFirst = false,
  small = false,
  warnings = false,
}: {
  state: StepState;
  progress?: ItemProgress;
  text?: string;
  /** The tooltip's detail after the state; by default from `progress`. */
  detail?: string;
  size?: number;
  /** The text before the glyph, for lists whose glyphs line up at the right edge. */
  textFirst?: boolean;
  /** Smaller, subtler text, for the step list. */
  small?: boolean;
  /** A run that completed with warnings. */
  warnings?: boolean;
}) => {
  const label = text ? (
    <span className={small ? smallTextStyle : textStyle}>{text}</span>
  ) : null;
  const glyph = (
    <RunGlyph
      state={state}
      progress={progress}
      detail={detail}
      size={size}
      warnings={warnings}
    />
  );
  return (
    <span className={cellStyle} data-status-cell={state}>
      {textFirst ? label : glyph}
      {textFirst ? glyph : label}
    </span>
  );
};
