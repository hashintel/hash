/**
 * The minimal run log, in the right panel when no step is selected (spec: ops/screenshots/run-log-minimal-1104/,
 * R1–R4). A summary ("Run 16", "Failed · 18 of 20 suppliers", duration, trigger, who, when, and Stop or "2 failed"), then
 * one row per step: a mono time, a 16 px mark, the step and a muted detail, a mono duration on the right.
 *
 * For each folds to "20 suppliers · 2 failed"; opened, its failures come first, each with its reason, and the
 * successes fold to "18 done". Red only for a failure, blue only for running. A live run's rows appear as its steps
 * start, the running one with a ticking duration.
 */
import { useEffect, useState } from "react";

import { Button, Icon } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { RunIdsIn, runIdStyled, RunIdText, runLabel } from "./run-id";
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
  warningsText,
  runWhen,
} from "./run-history";
import { type LogRow, logRows, secondsText } from "./run-log";
import { BusinessRunLog, runLogTake } from "./run-log-business";
import {
  ErrorDetails,
  ErrorList,
  LogSummary,
  logSummaryTake,
  logWideTake,
  runErrors,
  TechnicalFold,
} from "./run-log-summary";
import { triggerFiredTake } from "./trigger-flags";
import { doneTone } from "./status-colors";

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

/** `?logwide=1`, expanded: the panel takes the canvas's width; its rows keep a readable measure. */
const wideStyle = css({
  "&[class]": { flex: "[1000 1 0]", width: "[auto]", minWidth: "[0]" },
  "& > *": { maxWidth: "[880px]" },
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

/** "2 failed" in the summary: a quiet link that opens the For each on its failures. */
const failedLinkStyle = css({
  "&[class]": { color: "neutral.fg.subtle", fontWeight: "normal" },
  "&[class]:hover": { color: "neutral.fg.heading" },
});

/**
 * A log row's mark: the run glyph, the F3 cross for a failure; its tooltip names the state and the row's note. A row
 * with a note centres it on the 22 px title line (B′, ledger 2 Nov "Menu rows"), with its time.
 */
const Mark = ({
  glyph,
  progress,
  detail,
  twoLine,
}: {
  glyph: LogRow["glyph"];
  progress?: ItemProgress;
  detail?: string;
  twoLine?: boolean;
}) => (
  <span
    className={css({
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
    })}
    style={{ height: twoLine ? 22 : 18 }}
  >
    <RunGlyph
      state={glyph === "cross" ? "failed" : glyph}
      size={12}
      progress={progress}
      detail={detail}
    />
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
  after,
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
  /** Under the note: `?logsum=v1` puts the error's Show details here. */
  after?: React.ReactNode;
}) => (
  // oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- the chevron inside is the keyboard control
  <div
    className={rowStyle}
    data-log-row={id}
    data-log-failure={itemFailure || undefined}
    data-toggle={onToggle ? true : undefined}
    onClick={onToggle}
  >
    <span
      className={monoStyle}
      style={note ? { lineHeight: "22px" } : undefined}
    >
      {time ?? ""}
    </span>
    <Mark
      glyph={glyph}
      progress={progress}
      detail={progress ? undefined : note}
      twoLine={Boolean(note)}
    />
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
          <RunIdsIn text={title} />
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
      {after}
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
  const sumTake = logSummaryTake();
  // ?logwide=1: the log widened over the canvas; Esc brings it back.
  const [wide, setWide] = useState(false);
  useEffect(() => {
    if (!wide) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setWide(false);
      }
    };
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [wide]);
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

  // Binary: a run with warnings is Completed, its warnings counted on the right (5 Nov).
  const statusWord = outcomeLabel[outcome];
  const statusTone =
    statusWord === "Failed"
      ? "var(--flows-failed-text)"
      : outcome === "running"
        ? "var(--flows-running-text)"
        : outcome === "needsReview"
          ? "var(--flows-needsReview-text)"
          : outcome === "warnings" && doneTone === "neutral"
            ? "var(--flows-warnings-text)"
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
  // v1 shows its errors inside the For each, so it opens on them.
  const loopFallback = sumTake === "v1";
  const errors = runErrors(run, facts);
  const errorOf = (id: string) => errors.find((error) => error.id === id);
  const detailsFor = (id: string) => {
    const error = sumTake === "v1" ? errorOf(id) : undefined;
    return error ? <ErrorDetails error={error} /> : undefined;
  };
  const toggle = (id: string, fallback = false) =>
    setOpenIds((current) => ({ ...current, [id]: !isOpen(id, fallback) }));

  const lines: React.ReactNode[] = [];
  for (const row of rows) {
    if (row.id === "loop") {
      const children = row.children ?? [];
      const failures = children.filter((child) => child.failure);
      const rest = children.filter((child) => !child.failure);
      const open = isOpen("loop", loopFallback);
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
          onToggle={() => toggle("loop", loopFallback)}
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
              note={
                sumTake
                  ? (errorOf(failure.id)?.plain ?? failure.note)
                  : (failedStep?.error?.title ?? failure.note)
              }
              duration={tight(failure.duration)}
              depth={1}
              failure
              itemFailure
              after={detailsFor(failure.id)}
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
            : row.id === "find" && !(sumTake && row.failure)
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
        after={row.failure ? detailsFor(row.id) : undefined}
      />,
    );
  }

  const businessTake = runLogTake();
  if (businessTake) {
    return (
      <aside className={panelStyle} aria-label="Run log" data-run-log-panel>
        <BusinessRunLog
          take={businessTake}
          run={run}
          now={now}
          technical={lines}
        />
      </aside>
    );
  }

  const logLabel = sumTake ? "Technical log" : "Log";
  const logSection = (
    <div className={css({ paddingY: "3" })}>
      <div
        className={css({
          paddingX: "4",
          paddingBottom: "1",
          textStyle: "sm",
          color: "neutral.fg.subtle",
        })}
      >
        {logLabel}
      </div>
      {lines}
    </div>
  );
  return (
    <aside
      className={cx(panelStyle, wide && wideStyle)}
      aria-label="Run log"
      data-run-log-panel
      data-log-wide={wide || undefined}
    >
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
            {runIdStyled() ? (
              <RunIdText run={run} prefix copyable />
            ) : (
              runLabel(run)
            )}
          </span>
          <span
            className={css({ display: "flex", alignItems: "center", gap: "1" })}
          >
          {action === "Stop" ? (
            <Button
              size="sm"
              variant="ghost"
              tone="neutral"
              data-log-action
              onClick={() => history.stop(run.id)}
            >
              Stop
            </Button>
          ) : !live && failed > 0 ? (
            // Status, not a control: Re-run and "Re-run 2 failed" live in the top bar only.
            <Button
              size="sm"
              variant="ghost"
              tone="neutral"
              className={failedLinkStyle}
              tooltip="Show the items that failed"
              data-log-failed
              onClick={() =>
                setOpenIds((current) => ({ ...current, loop: true }))
              }
            >
              {outcome === "warnings"
                ? warningsText(failed)
                : `${failed} failed`}
            </Button>
          ) : null}
          {logWideTake() ? (
            <Button
              size="sm"
              variant="ghost"
              tone="neutral"
              iconName={wide ? "collapse" : "expand"}
              aria-label={wide ? "Collapse the log" : "Expand the log"}
              tooltip={wide ? "Collapse · Esc" : "Expand"}
              data-log-expand
              onClick={() => setWide(!wide)}
            />
          ) : null}
          </span>
        </div>
        <span className={css({ textStyle: "sm", color: "neutral.fg.heading" })}>
          <span style={{ color: statusTone }}>{statusWord}</span>
          {facts.n > 0 ? ` · ${reached} of ${facts.n} suppliers` : ""}
        </span>
        <span className={css({ textStyle: "sm" })}>
          <span className={mutedStyle}>
            {[
              duration,
              // ?triggerfired=2 names the trigger on its own line below.
              triggerFiredTake === 2 ? "" : trigger,
              runWhen(run),
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        {/* ?triggerfired=2: the summary names what started the run, beside the green path on the canvas. */}
        {triggerFiredTake === 2 ? (
          <span
            className={css({ textStyle: "sm", color: "neutral.fg.heading" })}
          >
            Triggered by{" "}
            {run.trigger.kind === "manual"
              ? `Manual · ${run.trigger.by}`
              : "Schedule · 1st of month at 09:00"}
          </span>
        ) : null}
      </div>
      {sumTake ? (
        <LogSummary run={run} facts={facts} now={now} live={live} />
      ) : null}
      {sumTake === "v2" || sumTake === "v3" ? (
        <ErrorList errors={errors} />
      ) : null}
      {sumTake === "v3" ? (
        <TechnicalFold count={lines.length}>{lines}</TechnicalFold>
      ) : (
        logSection
      )}
    </aside>
  );
};
