/**
 * `?runstatus=` (inbox history-status-col, open): one grammar for the runs table's Status column (5 Nov, Aakarsh: "each
 * is with an icon and then a different sort of text. it's so inconsistent"). Unset keeps today's cell.
 *
 * Every run is read as one engine status in plain words (Running, Needs review, Done, Failed, Cancelled; engine
 * Started, InformationRequired, Completed, Failed or TimedOut, Cancelled), one detail and, for runs over items, a count.
 * - a1: mark, word, then " · detail" muted. Same order on every row.
 * - a2: mark and word only; the detail is in the tooltip.
 * - b: the mark only; the word and detail are in the tooltip.
 * - c: mark and word, and the count moves to its own "Items" column, right-aligned.
 * - d: a quiet neutral chip with mark and word, the detail muted after it.
 * - e: mark and word on the left, the count right-aligned in the same cell.
 */
import { Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { RunGlyph } from "./run-glyph";
import {
  factsOf,
  outcomeOf,
  outcomeState,
  type RunRecord,
  runProgress,
  type StepState,
  warningsOf,
  warningsText,
} from "./run-history";

export type RunStatusTake = "a1" | "a2" | "b" | "c" | "d" | "e";

export const runStatusTake = (): RunStatusTake | null => {
  const value = new URLSearchParams(globalThis.location.search).get(
    "runstatus",
  );
  return value === "a1" ||
    value === "a2" ||
    value === "b" ||
    value === "c" ||
    value === "d" ||
    value === "e"
    ? value
    : null;
};

type RunStatus = {
  state: StepState;
  word: string;
  detail?: string;
  /** Items done of all, for runs over items. */
  count?: { done: number; total: number };
  warnings?: boolean;
};

const timedOutAt = (run: RunRecord, step: string) => {
  const after = /timed out (after .+)$/i.exec(run.ending ?? "")?.[1];
  return after ? `Timed out ${after} at ${step}` : `Timed out at ${step}`;
};

export const runStatusOf = (run: RunRecord, now: number): RunStatus => {
  const outcome = outcomeOf(run, now);
  const facts = factsOf(run, now);
  const progress = runProgress(run, now);
  const state = outcomeState[outcome];
  const count = progress
    ? { done: progress.done, total: progress.total }
    : facts.find === "done"
      ? { done: facts.n - facts.failures.length, total: facts.n }
      : undefined;
  if (facts.find === "failed") {
    return {
      state,
      word: "Failed",
      detail: timedOutAt(run, "Find active suppliers"),
    };
  }
  switch (outcome) {
    case "running":
      return facts.find === "running"
        ? { state, word: "Running", detail: "Find active suppliers" }
        : { state, word: "Running", detail: "For each supplier", count };
    case "needsReview":
      return { state, word: "Needs review", detail: "Quality sign-off", count };
    case "error":
      return {
        state,
        word: "Failed",
        detail: timedOutAt(run, "Quality sign-off"),
        count,
      };
    case "abandoned":
      return {
        state,
        word: "Cancelled",
        detail: run.trigger.kind === "manual" ? `by ${run.trigger.by}` : undefined,
        count,
      };
    case "warnings":
      return {
        state,
        word: "Done",
        detail: warningsText(warningsOf(run, now)),
        count,
        warnings: true,
      };
    default:
      return { state, word: "Done", count };
  }
};

/** The short detail a1 and d show inline: the reason, without "after 48 h". */
const shortDetail = (status: RunStatus) =>
  status.detail?.replace(/ after [^ ]+ [^ ]+ at /, " at ").replace(/^Timed out at .+$/, "Timed out");

const countText = (status: RunStatus) =>
  status.count ? `${status.count.done} of ${status.count.total}` : "";

const tooltipText = (status: RunStatus) =>
  [status.word, status.detail, status.count ? countText(status) : undefined]
    .filter(Boolean)
    .join(" · ");

const rowStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
  minWidth: "[0]",
  whiteSpace: "nowrap",
});

const wordStyle = css({ color: "neutral.fg.body" });

const mutedStyle = css({
  color: "neutral.fg.subtle",
  overflow: "hidden",
  textOverflow: "ellipsis",
  fontVariantNumeric: "tabular-nums",
});

const chipStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
  height: "[22px]",
  paddingX: "2",
  borderRadius: "md",
  backgroundColor: "neutral.s20",
  color: "neutral.fg.body",
  textStyle: "sm",
});

const splitStyle = css({
  display: "grid",
  gridTemplateColumns: "[auto 1fr auto]",
  alignItems: "center",
  columnGap: "1.5",
  width: "[176px]",
  whiteSpace: "nowrap",
});

const Mark = ({ status, tooltip }: { status: RunStatus; tooltip?: string }) => (
  <RunGlyph
    state={status.state}
    warnings={status.warnings}
    run
    detail={tooltip}
    tooltip={tooltip !== undefined}
  />
);

/** The Status cell for a take. */
export const RunStatusTakeCell = ({
  run,
  now,
  take,
}: {
  run: RunRecord;
  now: number;
  take: RunStatusTake;
}) => {
  const status = runStatusOf(run, now);
  switch (take) {
    case "a1": {
      const detail = shortDetail(status);
      return (
        <span className={rowStyle}>
          <Mark status={status} />
          <span className={wordStyle}>{status.word}</span>
          {detail ? <span className={mutedStyle}>· {detail}</span> : null}
        </span>
      );
    }
    case "a2":
      return (
        <Tooltip content={tooltipText(status)} openDelay="fast">
          <span className={rowStyle}>
            <Mark status={status} />
            <span className={wordStyle}>{status.word}</span>
          </span>
        </Tooltip>
      );
    case "b":
      return (
        <Tooltip content={tooltipText(status)} openDelay="fast">
          <span className={rowStyle}>
            <Mark status={status} />
          </span>
        </Tooltip>
      );
    case "c":
      return (
        <span className={rowStyle}>
          <Mark status={status} tooltip={status.detail} />
          <span className={wordStyle}>{status.word}</span>
        </span>
      );
    case "d": {
      const detail = shortDetail(status);
      return (
        <span className={rowStyle}>
          <span className={chipStyle}>
            <Mark status={status} />
            {status.word}
          </span>
          {detail ? <span className={mutedStyle}>{detail}</span> : null}
        </span>
      );
    }
    case "e":
      return (
        <span className={splitStyle}>
          <Mark status={status} tooltip={status.detail} />
          <span className={wordStyle}>{status.word}</span>
          <span className={mutedStyle}>{countText(status)}</span>
        </span>
      );
  }
};

/** Take c's own column: the items count, right-aligned. */
export const RunItemsCell = ({ run, now }: { run: RunRecord; now: number }) => {
  const status = runStatusOf(run, now);
  return (
    <span className={css({ display: "block", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "neutral.fg.body" })}>
      {status.count ? (
        <>
          {status.count.done}
          <span className={css({ color: "neutral.fg.subtle" })}> of {status.count.total}</span>
        </>
      ) : (
        <span className={css({ color: "neutral.fg.subtle" })}>–</span>
      )}
    </span>
  );
};
