/**
 * The minimal run log, in the right panel when no step is selected (spec: ops/screenshots/run-log-minimal-1104/,
 * R1–R4). A summary ("Run 16", "Failed · 18 of 20 suppliers", duration, trigger, who, when, and Re-run or Stop), then
 * one row per step: a mono time, a 16 px mark, the step and a muted detail, a mono duration on the right.
 *
 * For each folds to "20 suppliers · 2 failed"; opened, its failures come first, each with its reason, and the
 * successes fold to "18 done". Red only for a failure, blue only for running. A live run's rows appear as its steps
 * start, the running one with a ticking duration.
 */
import { useState } from "react";

import { Button, Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { START_ID } from "./document";
import { useEditor } from "./editor-context";
import { glyphSet, RunGlyph } from "./run-glyph";
import {
  bannerAction,
  factsOf,
  forEachId,
  type ItemProgress,
  outcomeLabel,
  outcomeOf,
  runClock,
  runTriggerId,
  signOffId,
} from "./run-history";
import { type LogRow, logRows, secondsText } from "./run-log";

import type { HistoryValue } from "./history-view";

const panelStyle = css({
  flexShrink: 0,
  width: "[384px]",
  height: "[100%]",
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  backgroundColor: "neutral.bgSolid.min",
  borderLeftWidth: "thin",
  borderLeftStyle: "solid",
  borderLeftColor: "neutral.bd.solid",
  zIndex: "[5]",
});

const summaryStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  padding: "6",
  borderBottomWidth: "thin",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.bd.subtle",
});

const rowStyle = css({
  display: "grid",
  gridTemplateColumns: "[64px 16px 1fr auto]",
  columnGap: "3",
  alignItems: "start",
  minHeight: "[32px]",
  paddingX: "4",
  paddingY: "[7px]",
  textStyle: "sm",
  color: "neutral.fg.body",
  transition: "[background-color 0.4s ease]",
  // "Show in log" from a run step's right-click menu marks its rows for a moment.
  "&[data-flash]": { backgroundColor: "neutral.bg.surface.active" },
  "&[data-toggle]": { cursor: "pointer" },
  "&[data-toggle]:hover": { backgroundColor: "neutral.bg.surface.hover" },
});

const monoStyle = css({
  fontFamily: "mono",
  textStyle: "xs",
  lineHeight: "[18px]",
  color: "neutral.fg.subtle",
  whiteSpace: "nowrap",
});

const mutedStyle = css({ color: "neutral.fg.subtle" });

/** A log row's mark: the run glyph, or a red cross for a failure. */
const Mark = ({
  glyph,
  progress,
}: {
  glyph: LogRow["glyph"];
  progress?: ItemProgress;
}) => (
  <span
    className={css({
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      height: "[18px]",
      color: "[var(--flows-failed-text)]",
    })}
  >
    {glyph === "cross" ? (
      <Icon name="close" size="sm" />
    ) : (
      <RunGlyph state={glyph} size={12} progress={progress} />
    )}
  </span>
);

const LogLine = ({
  id,
  time,
  glyph,
  progress,
  title,
  detail,
  note,
  duration,
  depth = 0,
  open,
  onToggle,
  failure,
  itemFailure,
}: {
  id: string;
  time?: string;
  glyph: LogRow["glyph"];
  progress?: ItemProgress;
  title: string;
  detail?: string;
  note?: string;
  duration: string;
  depth?: number;
  open?: boolean;
  onToggle?: () => void;
  failure?: boolean;
  /** A supplier that failed inside the For each. */
  itemFailure?: boolean;
}) => (
  // oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- the chevron inside is the keyboard control
  <div
    className={rowStyle}
    data-log-row={id}
    data-log-failure={itemFailure || undefined}
    data-toggle={onToggle ? true : undefined}
    onClick={onToggle}
  >
    <span className={monoStyle}>{time ?? ""}</span>
    <Mark glyph={glyph} progress={progress} />
    <span
      className={css({
        display: "flex",
        flexDirection: "column",
        gap: "0.5",
        minWidth: "[0]",
      })}
      style={{ paddingLeft: depth * 16 }}
    >
      <span className={css({ display: "flex", gap: "1.5", minWidth: "[0]" })}>
        <span
          className={css({
            color: "neutral.fg.heading",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          })}
        >
          {title}
        </span>
        {detail ? (
          <span
            className={css({
              color: "neutral.fg.subtle",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            })}
          >
            {detail}
          </span>
        ) : null}
        {onToggle ? (
          <button
            type="button"
            aria-label={open ? "Fold" : "Unfold"}
            aria-expanded={open}
            className={css({
              display: "inline-flex",
              alignItems: "center",
              color: "neutral.fg.muted",
              cursor: "pointer",
            })}
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
          >
            <Icon name={open ? "chevronDown" : "chevronRight"} size="xs" />
          </button>
        ) : null}
      </span>
      {note ? (
        <span
          className={css({ textStyle: "xs" })}
          style={{
            color: failure
              ? "var(--flows-failed-text)"
              : "var(--colors-neutral-fg-subtle)",
          }}
        >
          {note}
        </span>
      ) : null}
    </span>
    <span className={monoStyle} style={{ textAlign: "right" }}>
      {duration}
    </span>
  </div>
);

/**
 * The rows "Show in log" marks for a step. A step inside the For each marks the suppliers it ran for: Fetch
 * certificate its failures, the reads their failures and the done group, Send and Mark the done group.
 */
const loopStepRows: Record<string, string[]> = {
  readName: ["failed", "done-items"],
  readEmail: ["failed", "done-items"],
  readCertificateLink: ["failed", "done-items"],
  fetchCertificate: ["failed"],
  sendReviewEmail: ["done-items"],
  markReviewed: ["done-items"],
};

const ownRow: Record<string, string> = {
  [runTriggerId]: "trigger",
  [START_ID]: "start",
  findSuppliers: "find",
  [forEachId]: "loop",
  [signOffId]: "sign-off",
};

const revealSelector = (stepId: string) => {
  const rows = loopStepRows[stepId];
  if (!rows) {
    return `[data-log-row="${ownRow[stepId] ?? "loop"}"]`;
  }
  return rows
    .map((row) =>
      row === "failed" ? "[data-log-failure]" : `[data-log-row="${row}"]`,
    )
    .join(", ");
};

/** Scrolls to a step's log rows and marks them for a moment, in neutral; the For each row if it has none yet. */
export const flashLogRows = (stepId: string) => {
  const find = (selector: string) => [
    ...globalThis.document.querySelectorAll<HTMLElement>(selector),
  ];
  const own = find(revealSelector(stepId));
  const rows = own.length > 0 ? own : find('[data-log-row="loop"]');
  rows[0]?.scrollIntoView({ block: "center" });
  for (const row of rows) {
    row.dataset.flash = "true";
  }
  setTimeout(() => {
    for (const row of rows) {
      delete row.dataset.flash;
    }
  }, 1400);
};

/** "5 m 00 s" → "5m 00s", as the spec writes durations. */
const tight = (duration: string) =>
  duration.replace(/ (m|s|h)\b/g, "$1").replace(" total", "");

export const RunLogPanel = ({ history }: { history: HistoryValue }) => {
  const { run, now } = history;
  const { ui } = useEditor();
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});
  // "Show in log" on a step inside the For each (or on it) opens the For each, once per request.
  const reveal = ui.logReveal;
  const [revealedAt, setRevealedAt] = useState<number | null>(null);
  if (reveal && reveal.at !== revealedAt) {
    setRevealedAt(reveal.at);
    if (loopStepRows[reveal.stepId] || reveal.stepId === forEachId) {
      setOpenIds((current) => ({ ...current, loop: true }));
    }
  }
  if (!run) {
    return null;
  }
  const outcome = outcomeOf(run, now);
  const facts = factsOf(run, now);
  const live = outcome === "running" || outcome === "needsReview";
  const action = bannerAction(run, now);
  const elapsed = run.kind === "live" ? runClock(run, now) : undefined;
  const failed = facts.failures.length;
  const reached = live
    ? Math.min(facts.processed[3], facts.n)
    : facts.n - failed;

  const statusWord =
    outcome === "error"
      ? "Failed"
      : outcome === "warnings"
        ? failed > 0
          ? "Failed"
          : outcomeLabel[outcome]
        : outcomeLabel[outcome];
  const statusTone =
    statusWord === "Failed"
      ? "var(--flows-failed-text)"
      : outcome === "running"
        ? "var(--flows-running-text)"
        : outcome === "needsReview"
          ? "var(--flows-needsReview-text)"
          : "var(--colors-neutral-fg-heading)";
  const trigger =
    run.trigger.kind === "manual" ? `Manual · ${run.trigger.by}` : "Schedule";
  const duration = live
    ? tight(secondsText(elapsed ?? 0))
    : tight(run.duration ?? "");

  // The live run shows only the steps it has reached; the ended one closes with "Ended".
  const rows = logRows(run, facts, now).filter((row) =>
    live ? row.id !== "end" && row.glyph !== "notReached" : true,
  );
  const isOpen = (id: string, fallback = false) => openIds[id] ?? fallback;
  const toggle = (id: string, fallback = false) =>
    setOpenIds((current) => ({ ...current, [id]: !isOpen(id, fallback) }));

  const lines: React.ReactNode[] = [];
  for (const row of rows) {
    if (row.id === "loop") {
      const children = row.children ?? [];
      const failures = children.filter((child) => child.failure);
      const rest = children.filter((child) => !child.failure);
      const open = isOpen("loop");
      const loopMark = history.steps?.[forEachId];
      // The outline sets draw the For each's partly done mark from its items; the old set keeps R1's cross.
      const partlyDone =
        !live && glyphSet !== "old" && loopMark?.state === "doneWithFailures";
      lines.push(
        <LogLine
          key="loop"
          id="loop"
          time={row.time}
          glyph={live ? "running" : partlyDone ? loopMark.state : row.glyph}
          progress={loopMark?.progress}
          title={row.label ?? row.title}
          note={
            live
              ? `${reached} of ${facts.n} suppliers${failed > 0 ? ` · ${failed} failed` : ""}`
              : `${facts.n} suppliers${failed > 0 ? ` · ${failed} failed` : ""}`
          }
          duration={live ? "" : tight(row.duration)}
          open={open}
          onToggle={() => toggle("loop")}
        />,
      );
      if (open) {
        // Failures first, each with its reason; then the successes, folded.
        for (const failure of failures) {
          const failedStep = failure.children?.find((child) => child.failure);
          lines.push(
            <LogLine
              key={failure.id}
              id={failedStep?.id ?? failure.id}
              time={failure.time}
              glyph="cross"
              title={failure.title}
              note={failedStep?.error?.title ?? failure.note}
              duration={tight(failure.duration)}
              depth={1}
              failure
              itemFailure
            />,
          );
        }
        for (const group of rest) {
          const groupOpen = isOpen(group.id);
          lines.push(
            <LogLine
              key={group.id}
              id={group.id}
              time={group.time}
              glyph={group.glyph}
              title={group.title.replace(/^(\d+) suppliers done$/, "$1 done")}
              duration={tight(group.duration)}
              depth={1}
              open={group.children ? groupOpen : undefined}
              onToggle={group.children ? () => toggle(group.id) : undefined}
            />,
          );
          if (groupOpen) {
            for (const child of group.children ?? []) {
              lines.push(
                <LogLine
                  key={child.id}
                  id={child.id}
                  time={child.time}
                  glyph={child.glyph}
                  title={child.title}
                  duration={tight(child.duration)}
                  depth={2}
                />,
              );
            }
          }
        }
      }
      continue;
    }
    lines.push(
      <LogLine
        key={row.id}
        id={row.id}
        time={row.time}
        glyph={row.id === "end" ? "notReached" : row.glyph}
        title={
          row.id === "end"
            ? "Ended"
            : row.id === "trigger"
              ? run.trigger.kind === "manual"
                ? "Manual run"
                : "Schedule"
              : row.id === "start"
                ? row.title
                : (row.label ?? row.title)
        }
        detail={
          row.id === "trigger"
            ? run.trigger.kind === "manual"
              ? run.trigger.by
              : "monthly"
            : row.id === "find"
              ? row.note?.replace(" suppliers found", " found")
              : undefined
        }
        note={
          row.failure && row.id !== "end" && row.id !== "find"
            ? row.note
            : row.id === "find" && row.failure
              ? row.note
              : undefined
        }
        duration={row.id === "trigger" ? "–" : tight(row.duration)}
        failure={row.failure}
      />,
    );
  }

  return (
    <aside className={panelStyle} aria-label="Run log" data-run-log-panel>
      <div className={summaryStyle}>
        <div
          className={css({
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          })}
        >
          <span
            className={css({
              textStyle: "base",
              fontWeight: "medium",
              color: "neutral.fg.heading",
            })}
          >
            Run {run.id}
          </span>
          <Button
            size="sm"
            variant="ghost"
            tone="neutral"
            data-log-action
            onClick={() =>
              action === "Stop"
                ? history.stop(run.id)
                : history.start(outcome === "warnings" ? failed : undefined)
            }
          >
            {action === "Stop" ? "Stop" : "Re-run"}
          </Button>
        </div>
        <span className={css({ textStyle: "sm", color: "neutral.fg.heading" })}>
          <span style={{ color: statusTone }}>{statusWord}</span>
          {facts.n > 0 ? ` · ${reached} of ${facts.n} suppliers` : ""}
        </span>
        <span className={css({ textStyle: "sm" })}>
          <span className={mutedStyle}>
            {[duration, trigger, run.when.replace(", ", " ")]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
      </div>
      <div className={css({ paddingY: "3" })}>
        <div
          className={css({
            paddingX: "4",
            paddingBottom: "1",
            textStyle: "sm",
            color: "neutral.fg.subtle",
          })}
        >
          Log
        </div>
        {lines}
      </div>
    </aside>
  );
};
