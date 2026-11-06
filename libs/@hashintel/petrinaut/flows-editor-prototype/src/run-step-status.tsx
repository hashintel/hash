/**
 * A step's Status in a run, as decided in the Run outputs playground (5 Nov, Aakarsh: "date-time on always"): the
 * step's own facts, "12 s · 5 Nov, 14:02", and a second line only when it applies (attempts, waiting on someone). The
 * run's id and trigger are not repeated here.
 *
 * The For each's item list (spec R8; Ciarán and Dora, 26 Oct): every item with its mark, failures first. Picking one
 * shows its branch, step by step; "Next failed" walks the failures.
 */
import { useState } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { START_ID } from "./document";
import { RunGlyph } from "./run-glyph";
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

const strongLineStyle = css({ textStyle: "sm", color: "neutral.fg.heading" });
const quietLineStyle = css({ textStyle: "sm", color: "neutral.fg.subtle" });

const seconds = (duration: string) =>
  Number(/(\d+)h/.exec(duration)?.[1] ?? 0) * 3600 +
  Number(/(\d+)m/.exec(duration)?.[1] ?? 0) * 60 +
  Number(/(\d+)s/.exec(duration)?.[1] ?? 0);

const durationText = (total: number) => {
  const rounded = Math.max(0, Math.round(total));
  if (rounded < 60) {
    return `${rounded} s`;
  }
  if (rounded < 3600) {
    const minutes = Math.floor(rounded / 60);
    const rest = rounded % 60;
    return rest ? `${minutes}m ${rest}s` : `${minutes} min`;
  }
  return `${Math.round(rounded / 3600)} h`;
};

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
    return facts.find === "running" ? { from: 0 } : findSpan;
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
  const started = runWhen(run, clockPlus(run.startClock, timing.from));
  const first =
    end === undefined
      ? started
      : `${durationText(end - timing.from)} · ${started}`;
  const retried = facts.failures.filter((failure) => failure.reason === "timed out");
  const extra =
    stepId === "fetchCertificate" && retried.length > 0 && state.state !== "running"
      ? retried
          .map((failure) => `${suppliers[failure.item] ?? "An item"}: 3 attempts`)
          .join(" · ")
      : stepId === signOffId && facts.signOff === "waiting"
        ? "Waiting on Head of quality"
        : undefined;
  return (
    <>
      <span className={strongLineStyle}>{first}</span>
      {extra ? <span className={quietLineStyle}>{extra}</span> : null}
    </>
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
  "&[data-selected]": { backgroundColor: "neutral.bg.surface.active" },
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
  return (
    <div className={branchStyle}>
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
          >
            <RunGlyph state={stepState} size={12} />
            <span>
              {title}
              {stepState === "failed" && failure ? (
                <span className={quietLineStyle}> · {reasonText(failure.reason)}</span>
              ) : stepState === "skipped" ? (
                <span className={quietLineStyle}> · skipped</span>
              ) : null}
            </span>
          </span>
        );
      })}
    </div>
  );
};

export const ForEachItems = ({ facts }: { facts: RunFacts }) => {
  const failedItems = facts.failures.map((failure) => failure.item);
  const order = [
    ...failedItems,
    ...Array.from({ length: facts.n }, (_, item) => item).filter(
      (item) => !failedItems.includes(item),
    ),
  ];
  const [selected, setSelected] = useState<number | null>(failedItems[0] ?? null);
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
      {failedItems.length > 0 ? (
        <div className={css({ display: "flex", justifyContent: "flex-end", marginTop: "[-31px]", marginBottom: "1" })}>
          <Button size="xs" variant="ghost" tone="neutral" onClick={nextFailed}>
            Next failed
          </Button>
        </div>
      ) : null}
      {order.map((item) => {
        const state = itemState(facts, item);
        const failure = facts.failures.find((entry) => entry.item === item);
        return (
          <div key={item}>
            <button
              type="button"
              className={itemRowStyle}
              data-selected={selected === item ? true : undefined}
              onClick={() => setSelected(selected === item ? null : item)}
            >
              <RunGlyph state={state} size={12} tooltip={false} />
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
