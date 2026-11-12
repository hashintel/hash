/**
 * A step's Status in a run, as decided in the Run outputs playground (5 Nov, Aakarsh: "date-time on always"): the
 * step's own facts, "12 s · 5 Nov, 14:02", and a second line only when it applies (attempts, waiting on someone). The
 * run's id and trigger are not repeated here.
 *
 * The For each's item list (spec R8; Ciarán and Dora, 26 Oct): every item with its mark, failures first. Picking one
 * shows its branch, step by step; "Next failed" walks the failures.
 */
import { useState } from "react";

import { Button, Drawer } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { START_ID } from "./document";
import { ShowAllRow } from "./show-all-row";
import { statusWord } from "./status-grammar";
import { RunGlyph } from "./run-glyph";
import { clockText } from "./run-time";
import { STATUS_MARK_SIZE, statusSlotStyle, useStatusSide } from "./status-side";
import {
  clockPlus,
  findSpan,
  forEachId,
  type RunFacts,
  type RunRecord,
  runClock,
  runTriggerId,
  signOffAt,
  signOffId,
  stageSpan,
  type StepRun,
  type StepState,
  suppliers,
  runWhen,
} from "./run-history";

/**
 * `?approver=person`: Ask a person waits on the person the editor names (People · Maya Patel), not the role (Head of
 * quality), and its run inputs take the editor's labels (People, Instructions).
 */
export const approverPerson =
  new URLSearchParams(globalThis.location.search).get("approver") === "person";

export const approverName = approverPerson ? "Maya Patel" : "Head of quality";

/**
 * `?notreached=skipped`: in a run that has ended, a step it never reached reads Skipped, not Waiting (nothing waits
 * once the run is over).
 */
export const notReachedSkipped =
  new URLSearchParams(globalThis.location.search).get("notreached") === "skipped";

const strongLineStyle = css({ textStyle: "sm", color: "neutral.fg.heading" });
const quietLineStyle = css({ textStyle: "sm", color: "neutral.fg.subtle" });

const seconds = (duration: string) =>
  Number(/(\d+)h/.exec(duration)?.[1] ?? 0) * 3600 +
  Number(/(\d+)m/.exec(duration)?.[1] ?? 0) * 60 +
  Number(/(\d+)s/.exec(duration)?.[1] ?? 0);

/** The run bar's duration format ("12 s", "1m 20s", "1h 02m"), so a step and its run read the same. */
const durationText = (total: number) => clockText(Math.max(0, Math.round(total)));

/** "Today, 08:15" → "5 Nov"; "2 Nov, 16:20" → "2 Nov". */
/** When the step started and ended, in seconds from the run's start; `to` is empty while it runs. */
const stepTiming = (
  stepId: string,
  run: RunRecord,
  facts: RunFacts,
): { from: number; to?: number } | null => {
  const { n } = facts;
  const total = run.duration ? seconds(run.duration) : undefined;
  if (stepId === runTriggerId || stepId === START_ID) {
    return { from: 0, to: 0.1 };
  }
  if (stepId === "findSuppliers") {
    // A failed find ran until the run ended ("took over 5 min" in the run's summary).
    return facts.find === "running"
      ? { from: 0 }
      : facts.find === "failed" && total !== undefined
        ? { from: 0, to: total }
        : findSpan;
  }
  if (stepId === forEachId) {
    return { from: findSpan.to, to: signOffAt(n) };
  }
  if (stepId === signOffId) {
    return facts.signOff === "waiting" ? { from: signOffAt(n) } : { from: signOffAt(n), to: total };
  }
  const span = stageSpan(stepId, n);
  return span ? { from: span.from, to: span.to } : null;
};

/** `?statusline=old`: the Status block from before the one-line take (mark row, then facts, then notes). */
export const oldStatusLine =
  new URLSearchParams(globalThis.location.search).get("statusline") === "old";

/** When the step started and ended, as text: its duration (when it has ended or is running) and its start. */
const stepWhen = (
  stepId: string,
  run: RunRecord,
  facts: RunFacts,
  state: StepRun,
  now: number,
) => {
  const timing = stepTiming(stepId, run, facts);
  if (!timing || state.state === "notReached") {
    return null;
  }
  const live = run.kind === "live";
  const end =
    timing.to === undefined || (live && runClock(run, now) < timing.to)
      ? live
        ? runClock(run, now)
        : undefined
      : timing.to;
  const clock = clockPlus(run.startClock, timing.from);
  return {
    clock: clock.slice(0, 5),
    started: runWhen(run, clock),
    duration: end === undefined ? undefined : durationText(end - timing.from),
  };
};

export const StepStatusLines = ({
  stepId,
  run,
  facts,
  state,
  now,
}: {
  stepId: string;
  run: RunRecord;
  facts: RunFacts;
  state: StepRun;
  now: number;
}) => {
  const when = stepWhen(stepId, run, facts, state, now);
  if (!when) {
    return null;
  }
  const first = when.duration ? `${when.duration} · ${when.started}` : when.started;
  const retried = facts.failures.filter((failure) => failure.reason === "timed out");
  const extra =
    stepId === "fetchCertificate" && retried.length > 0 && state.state !== "running"
      ? retried
          .map((failure) => `${suppliers[failure.item] ?? "An item"}: 3 attempts`)
          .join(" · ")
      : stepId === signOffId && facts.signOff === "waiting"
        ? `Waiting on ${approverName}`
        : undefined;
  return (
    <>
      <span className={strongLineStyle}>{first}</span>
      {extra ? <span className={quietLineStyle}>{extra}</span> : null}
    </>
  );
};

/* ----------------------------------------------------------------------------------------------------------------
 * The one-line Status (step-status-line "bake", 10 Nov): mark · word · count · duration · start on one line, and a
 * quiet line under it only for a reason, attempts or who it waits on. Words follow the status grammar.
 * ------------------------------------------------------------------------------------------------------------- */

const statusLineStyle = css({
  gridColumn: "1 / -1",
  display: "flex",
  flexDirection: "column",
  // The output rows' rhythm: a 22 px line, 2 px, the quiet line under it.
  gap: "0.5",
  minWidth: "[0]",
});

const firstLineStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  minWidth: "[0]",
  textStyle: "sm",
  color: "neutral.fg.body",
  whiteSpace: "nowrap",
});

const firstLineTextStyle = css({
  minWidth: "[0]",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

const wordStyle = css({ fontWeight: "medium", color: "neutral.fg.heading" });

const noteStyle = css({
  textStyle: "sm",
  color: "neutral.fg.subtle",
  overflowWrap: "anywhere",
});

/**
 * `?statuslook=<name>`: a hook for restyling the Status line once its layout is picked (inbox "Step status line:
 * layout", reopened 12 Nov). Its value lands on `data-status-look`; today's look draws for every value.
 */
const statusLook = new URLSearchParams(globalThis.location.search).get("statuslook");

/** One Status: the mark and its word, then the facts after it, then a quiet line per reason or person. */
export const StatusLine = ({
  state,
  word,
  facts,
  notes = [],
}: {
  state: StepState;
  word: string;
  facts: (string | undefined)[];
  notes?: React.ReactNode[];
}) => (
  <div className={statusLineStyle} data-status-line data-status-look={statusLook ?? undefined}>
    <span className={firstLineStyle}>
      <RunGlyph state={state} size={16} />
      <span className={firstLineTextStyle}>
        <span className={wordStyle}>{word}</span>
        {facts
          .filter(Boolean)
          .map((fact) => ` · ${fact}`)
          .join("")}
      </span>
    </span>
    {notes.map((note, index) => (
      <span key={index} className={noteStyle}>
        {note}
      </span>
    ))}
  </div>
);

const failureNote = (failure: RunFacts["failures"][number]) =>
  `${suppliers[failure.item] ?? "An item"} · ${
    failure.reason === "404"
      ? "certificate link returned 404"
      : failure.reason === "timed out"
        ? "certificate link timed out · 3 tries"
        : failure.reason
  }`;

const loopSteps = [
  "readName",
  "readEmail",
  "readCertificateLink",
  "fetchCertificate",
  "sendReviewEmail",
  "markReviewed",
];

/** The word, the count and the quiet notes of a step's Status, by the status grammar. */
const statusParts = (
  stepId: string,
  facts: RunFacts,
  state: StepRun,
): { word: string; count?: string; notes: string[] } => {
  const { n } = facts;
  // "2 of 20 failed": with the noun ("suppliers") the line runs past the 384 px panel.
  const items = (count: number) => `${count} of ${n}`;
  switch (state.state) {
    case "notReached":
      return { word: statusWord("Not reached", "Waiting"), notes: [] };
    case "skipped":
      return { word: "Skipped", notes: [] };
    case "abandoned":
      return { word: "Abandoned", notes: [] };
    case "needsReview":
      return {
        word: "Needs review",
        notes: stepId === signOffId ? [`Waiting on ${approverName}`] : [],
      };
    default:
  }
  if (stepId === runTriggerId) {
    return { word: statusWord("Started the run", "Done"), notes: [] };
  }
  if (stepId === "findSuppliers") {
    return state.state === "failed"
      ? { word: "Failed", notes: ["Timed out"] }
      : state.state === "running"
        ? { word: "Running", notes: [] }
        : { word: statusWord(`${n} found`, "Done"), notes: [] };
  }
  if (stepId === signOffId) {
    return state.state === "failed"
      ? { word: "Failed", notes: ["Timed out after 48 h"] }
      : { word: statusWord("Approved", "Done"), notes: [] };
  }
  const failed = state.bar?.find((segment) => segment.state === "failed")?.count ?? 0;
  const skipped = state.bar?.find((segment) => segment.state === "skipped")?.count ?? 0;
  if (stepId === forEachId) {
    const failures = facts.failures.length;
    return state.state === "running"
      ? { word: "Running", count: items(facts.processed[0]), notes: [] }
      : failures > 0
        ? { word: "Done", count: `${items(failures)} failed`, notes: [] }
        : { word: "Done", notes: [] };
  }
  if (loopSteps.includes(stepId)) {
    const word = state.state === "running" ? "Running" : state.state === "failed" ? "Failed" : "Done";
    const stage = loopSteps.indexOf(stepId) < 3 ? 0 : loopSteps.indexOf(stepId) - 2;
    const shown = facts.failures.filter(
      (failure) => failure.item < facts.processed[stage as 0 | 1 | 2 | 3],
    );
    const count =
      state.state === "running"
        ? items(facts.processed[stage as 0 | 1 | 2 | 3])
        : failed > 0
          ? `${items(failed)} failed`
          : skipped > 0
            ? `${items(skipped)} skipped`
            : undefined;
    const notes =
      stepId === "fetchCertificate"
        ? shown.map(failureNote)
        : skipped > 0
          ? [`${shown.map((failure) => suppliers[failure.item] ?? "An item").join(", ")} · no certificate`]
          : [];
    return { word, count, notes };
  }
  return { word: state.state === "failed" ? "Failed" : "Done", notes: [] };
};

/** A step's Status in a run, on one line (the default; `?statusline=old` keeps the block from before). */
export const StepStatusLine = ({
  stepId,
  run,
  facts,
  state,
  now,
}: {
  stepId: string;
  run: RunRecord;
  facts: RunFacts;
  state: StepRun;
  now: number;
}) => {
  const ended = run.kind === "past" || run.stopped !== undefined;
  if (notReachedSkipped && ended && state.state === "notReached") {
    return <StatusLine state="skipped" word="Skipped" facts={[]} />;
  }
  const when = stepWhen(stepId, run, facts, state, now);
  const { word, count, notes } = statusParts(stepId, facts, state);
  const timeFacts =
    !when
      ? []
      : state.state === "needsReview"
        ? [`Asked ${when.clock}`]
        : [when.duration, when.started];
  return (
    <StatusLine
      state={state.state}
      word={word}
      facts={[count, ...timeFacts]}
      notes={notes}
    />
  );
};

/* ----------------------------------------------------------------------------------------------------------------
 * For each items
 * ------------------------------------------------------------------------------------------------------------- */

const branchSteps: [string, string][] = [
  ["readName", "Read supplier name"],
  ["readEmail", "Read contact email"],
  ["readCertificateLink", "Read certificate link"],
  ["fetchCertificate", "Fetch certificate"],
  ["sendReviewEmail", "Send review email"],
  ["markReviewed", "Mark supplier reviewed"],
];

const reasonText = (reason: string) =>
  reason === "404" ? "Link returned 404" : reason === "timed out" ? "Timed out, 3 attempts" : reason;

const itemState = (facts: RunFacts, item: number): StepState => {
  if (facts.failures.some((failure) => failure.item === item)) {
    return "failed";
  }
  if (item < facts.processed[3]) {
    return "done";
  }
  return item < facts.processed[0] ? "running" : "notReached";
};

const itemRowStyle = css({
  display: "grid",
  gridTemplateColumns: "[16px 1fr auto]",
  columnGap: "2",
  alignItems: "center",
  minHeight: "[32px]",
  paddingX: "2",
  marginX: "[-8px]",
  width: "[calc(100% + 16px)]",
  borderRadius: "md",
  textStyle: "sm",
  color: "neutral.fg.body",
  cursor: "pointer",
  textAlign: "left",
  "&:hover": { backgroundColor: "neutral.bg.surface.hover" },
  "&[data-selected], &[data-selected]:hover": { backgroundColor: "neutral.bg.subtle.active" },
});

const branchStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  paddingLeft: "6",
  paddingY: "1",
});

const Branch = ({ facts, item }: { facts: RunFacts; item: number }) => {
  const failure = facts.failures.find((entry) => entry.item === item);
  const state = itemState(facts, item);
  const side = useStatusSide();
  return (
    // Marks on the right: the step names indent 24 px under the item name and their marks share the items' column.
    <div className={branchStyle} style={side === "right" ? { paddingLeft: 24 } : undefined}>
      {branchSteps.map(([id, title]) => {
        const stepState: StepState =
          state === "failed"
            ? id === "fetchCertificate"
              ? "failed"
              : id === "sendReviewEmail" || id === "markReviewed"
                ? "skipped"
                : "done"
            : state;
        return (
          <span
            key={id}
            className={css({
              display: "grid",
              gridTemplateColumns: "[16px 1fr]",
              columnGap: "2",
              alignItems: "center",
              textStyle: "sm",
              color: "neutral.fg.body",
            })}
            style={side === "right" ? { gridTemplateColumns: "1fr 16px" } : undefined}
          >
            {side ? (
              <span
                className={statusSlotStyle}
                data-status-slot={side}
                style={side === "right" ? { gridColumn: 2, gridRow: 1 } : undefined}
              >
                <RunGlyph state={stepState} size={STATUS_MARK_SIZE} />
              </span>
            ) : (
              <RunGlyph state={stepState} size={12} />
            )}
            <span>
              {title}
              {stepState === "failed" && failure ? (
                <span className={quietLineStyle}> · {reasonText(failure.reason)}</span>
              ) : stepState === "skipped" ? (
                <span className={quietLineStyle}> · Skipped</span>
              ) : null}
            </span>
          </span>
        );
      })}
    </div>
  );
};

/** `?foreachitems=all`: the For each panel lists every item in place, as before the overflow rule. */
const allItemsInPanel =
  new URLSearchParams(globalThis.location.search).get("foreachitems") === "all";

/** Rows the panel shows before "Show all N", as the other panel lists (outputs, needs review) show four. */
const panelItemRows = 4;

/**
 * The For each's items in a run (11 Nov, inbox conv-overflow): the first rows, failures first, then "Show all N
 * suppliers", which opens every item in the 640 px sheet.
 */
export const ForEachItems = ({ facts }: { facts: RunFacts }) => {
  const [sheetOpen, setSheetOpen] = useState(false);
  if (allItemsInPanel) {
    return <ItemList facts={facts} />;
  }
  const limit = Math.max(panelItemRows, facts.failures.length);
  return (
    <>
      <ItemList facts={facts} limit={limit} />
      {facts.n > limit ? (
        <div className={css({ gridColumn: "1 / -1" })}>
          <ShowAllRow total={facts.n} noun="suppliers" onClick={() => setSheetOpen(true)} />
        </div>
      ) : null}
      {sheetOpen ? (
        <Drawer
          size="md"
          position="right"
          variant="plain"
          showBackdrop={false}
          shouldCloseOn="none"
          onClose={() => setSheetOpen(false)}
          aria-label={`For each supplier · ${facts.n}`}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setSheetOpen(false);
            }
          }}
        >
          <Drawer.Header
            title={`For each supplier · ${facts.n}`}
            actions={
              <Button
                size="sm"
                variant="subtle"
                tone="neutral"
                iconName="collapse"
                aria-label="Back to the panel"
                tooltip="Back to the panel · Esc"
                onClick={() => setSheetOpen(false)}
              />
            }
          />
          <Drawer.Body>
            <div data-foreach-items-sheet>
              <ItemList facts={facts} walk={false} />
            </div>
          </Drawer.Body>
        </Drawer>
      ) : null}
    </>
  );
};

const ItemList = ({
  facts,
  limit,
  walk = true,
}: {
  facts: RunFacts;
  limit?: number;
  /** "Next failed" beside the Items heading; the sheet has no such heading. */
  walk?: boolean;
}) => {
  const failedItems = facts.failures.map((failure) => failure.item);
  const order = [
    ...failedItems,
    ...Array.from({ length: facts.n }, (_, item) => item).filter(
      (item) => !failedItems.includes(item),
    ),
  ];
  const [selected, setSelected] = useState<number | null>(failedItems[0] ?? null);
  const side = useStatusSide();
  const nextFailed = () => {
    if (failedItems.length === 0) {
      return;
    }
    const at = selected === null ? -1 : failedItems.indexOf(selected);
    setSelected(failedItems[(at + 1) % failedItems.length] ?? null);
  };
  return (
    <div
      className={css({
        gridColumn: "1 / -1",
        display: "flex",
        flexDirection: "column",
      })}
    >
      {walk && failedItems.length > 0 ? (
        <div className={css({ display: "flex", justifyContent: "flex-end", marginTop: "[-31px]", marginBottom: "1" })}>
          <Button size="xs" variant="ghost" tone="neutral" onClick={nextFailed}>
            Next failed
          </Button>
        </div>
      ) : null}
      {(limit === undefined ? order : order.slice(0, limit)).map((item) => {
        const state = itemState(facts, item);
        const failure = facts.failures.find((entry) => entry.item === item);
        return (
          <div key={item}>
            <button
              type="button"
              className={itemRowStyle}
              data-selected={selected === item ? true : undefined}
              onClick={() => setSelected(selected === item ? null : item)}
              // Marks on the right: name, then the reason, then the mark's 16 px slot at the far right.
              style={side === "right" ? { gridTemplateColumns: "1fr auto 16px" } : undefined}
            >
              {side ? (
                <span
                  className={statusSlotStyle}
                  data-status-slot={side}
                  style={side === "right" ? { gridColumn: 3, gridRow: 1 } : undefined}
                >
                  <RunGlyph state={state} size={STATUS_MARK_SIZE} tooltip={false} />
                </span>
              ) : (
                <RunGlyph state={state} size={12} tooltip={false} />
              )}
              <span>{suppliers[item] ?? `Item ${item + 1}`}</span>
              <span className={quietLineStyle}>
                {failure ? reasonText(failure.reason) : ""}
              </span>
            </button>
            {selected === item ? <Branch facts={facts} item={item} /> : null}
          </div>
        );
      })}
    </div>
  );
};
