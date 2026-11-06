/**
 * A run's log, as rows: one per step in time order, the For each grouping its items, a failed item carrying its
 * retries, and a last row saying how the run ended. `run-log-panel.tsx` draws them in the right panel.
 */
import { type IconName } from "@hashintel/ds-components";

import {
  clockPlus,
  outcomeOf,
  type RunFacts,
  type RunRecord,
  type StepState,
  suppliers,
} from "./run-history";
import { runLabel } from "./run-id";

/* ----------------------------------------------------------------------------------------------------------------
 * The log's rows
 * ------------------------------------------------------------------------------------------------------------- */

type Tone = "muted" | "red";

export type LogRow = {
  id: string;
  time?: string;
  glyph: StepState | "cross";
  icon?: IconName;
  title: string;
  label?: string;
  note?: string;
  tone?: Tone;
  duration: string;
  failure?: boolean;
  /** Retries and what they mean, under a failed step. */
  error?: { title: string; tries: [string, string][]; after: string };
  children?: LogRow[];
  open?: boolean;
};

export const secondsText = (seconds: number) =>
  seconds >= 3600
    ? `${Math.floor(seconds / 3600)} h ${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")} m`
    : seconds >= 60
      ? `${Math.floor(seconds / 60)} m ${Math.round(seconds % 60)} s`
      : `${seconds.toFixed(1)} s`;

const durationSeconds = (run: RunRecord) => {
  const hours = /(\d+)h (\d+)m/.exec(run.duration ?? "");
  if (hours) {
    return Number(hours[1]) * 3600 + Number(hours[2]) * 60;
  }
  const match = /(\d+)m (\d+)s/.exec(run.duration ?? "");
  return match ? Number(match[1]) * 60 + Number(match[2]) : 112;
};

const failureDetail = (
  supplier: string,
  reason: string,
  at: (seconds: number) => string,
  start: number,
): LogRow["error"] =>
  reason === "404"
    ? {
        title: `No certificate for ${supplier} on the supplier portal`,
        tries: [
          [
            at(start),
            "Try 1 of 3 failed · the portal returned 503 · retrying in 10 s",
          ],
          [
            at(start + 10),
            "Try 2 of 3 failed · the portal returned 503 · retrying in 10 s",
          ],
          [
            at(start + 20),
            "Try 3 of 3 failed · 404 · the certificate link points to a missing file",
          ],
        ],
        after: "This supplier stopped here. The steps after it did not run.",
      }
    : {
        title: `${supplier}'s portal did not answer`,
        tries: [
          [
            at(start),
            "Try 1 of 3 failed · timed out after 10 s · retrying in 10 s",
          ],
          [
            at(start + 10),
            "Try 2 of 3 failed · timed out after 10 s · retrying in 10 s",
          ],
          [at(start + 20), "Try 3 of 3 failed · timed out after 10 s"],
        ],
        after: "This supplier stopped here. The steps after it did not run.",
      };

export const logRows = (
  run: RunRecord,
  facts: RunFacts,
  now: number,
): LogRow[] => {
  const at = (seconds: number) => clockPlus(run.startClock, seconds);
  const outcome = outcomeOf(run, now);
  const total = durationSeconds(run);
  const rows: LogRow[] = [
    {
      id: "trigger",
      time: at(2),
      glyph: "done",
      icon: "lightning",
      title: "Triggers",
      label:
        run.trigger.kind === "manual"
          ? `Manual · ${run.trigger.by}`
          : "Schedule · monthly",
      note:
        run.trigger.kind === "manual"
          ? "Started from the Run button in the editor"
          : "Started by the monthly schedule",
      duration: "–",
    },
    {
      id: "start",
      time: at(2),
      glyph: "done",
      icon: "play",
      title: "Start",
      label: "Review month",
      note: "November 2026 · Region EU",
      duration: "0.1 s",
    },
  ];
  if (facts.find === "failed") {
    rows.push({
      id: "find",
      time: at(3),
      glyph: "cross",
      icon: "search",
      title: "Find entities",
      label: "Find active suppliers",
      note: "Timed out after 5 min · the graph did not answer",
      tone: "red",
      duration: "5 m 00 s",
      failure: true,
    });
  } else {
    rows.push({
      id: "find",
      time: at(3),
      glyph: "done",
      icon: "search",
      title: "Find entities",
      label: "Find active suppliers",
      note: `${facts.n} suppliers found`,
      duration: "1.2 s",
    });
    const finished = facts.processed[3];
    const failed = facts.failures;
    const doneItems = suppliers
      .slice(0, finished)
      .filter((_, item) => !failed.some((failure) => failure.item === item));
    const loopEnd = Math.min(total - 2, 4 + 110);
    const children: LogRow[] = [
      {
        id: "done-items",
        glyph: "done",
        title: `${doneItems.length} suppliers done`,
        note:
          doneItems.length > 3
            ? `${doneItems.slice(0, 3).join(", ")} and ${doneItems.length - 3} more`
            : doneItems.join(", "),
        duration: "5.4 s avg",
        children: doneItems.map((supplier, index) => ({
          id: `done-${supplier}`,
          time: at(4 + index * 5.4),
          glyph: "done" as const,
          title: supplier,
          note: "Reviewed",
          duration: `${(5 + (index % 4) * 0.3).toFixed(1)} s`,
        })),
      },
      ...failed.map((failure, index): LogRow => {
        const supplier = suppliers[failure.item] ?? "Supplier";
        const start = 79 + index * 4;
        return {
          id: `failed-${supplier}`,
          time: at(start),
          glyph: "cross",
          title: supplier,
          note: "Failed at Fetch certificate",
          tone: "red",
          duration: `${(31.2 - index * 0.6).toFixed(1)} s`,
          failure: true,
          open: index === 0,
          children: [
            {
              id: `${supplier}-name`,
              time: at(start),
              glyph: "done",
              icon: "eye",
              title: "Read entity",
              label: "Read supplier name",
              duration: "0.3 s",
            },
            {
              id: `${supplier}-email`,
              time: at(start),
              glyph: "done",
              icon: "eye",
              title: "Read entity",
              label: "Read contact email",
              duration: "0.2 s",
            },
            {
              id: `${supplier}-link`,
              time: at(start + 1),
              glyph: "done",
              icon: "eye",
              title: "Read entity",
              label: "Read certificate link",
              duration: "0.3 s",
            },
            {
              id: `${supplier}-fetch`,
              time: at(start + 2),
              glyph: "cross",
              icon: "download",
              title: "Fetch file",
              label: "Fetch certificate",
              note: "Failed after 3 tries",
              tone: "red",
              duration: "30.1 s",
              failure: true,
              error: failureDetail(supplier, failure.reason, at, start + 2),
            },
            {
              id: `${supplier}-send`,
              glyph: "skipped",
              icon: "at",
              title: "Send email",
              label: "Send review email",
              note: "Not run",
              duration: "–",
            },
            {
              id: `${supplier}-mark`,
              glyph: "skipped",
              icon: "pencil",
              title: "Update entity",
              label: "Mark supplier reviewed",
              note: "Not run",
              duration: "–",
            },
          ],
        };
      }),
      ...(facts.abandoned && finished < facts.n
        ? [
            {
              id: "not-run",
              glyph: "notReached" as const,
              title: `${facts.n - finished} suppliers not run`,
              note: "The run was cancelled",
              duration: "–",
            },
          ]
        : []),
    ];
    rows.push({
      id: "loop",
      time: at(4),
      glyph:
        failed.length > 0 ? "cross" : facts.abandoned ? "abandoned" : "done",
      icon: "rotate",
      title: "For each",
      label: "For each supplier",
      note:
        failed.length > 0
          ? `${facts.n - failed.length} done · ${failed.length} failed`
          : facts.abandoned
            ? `${finished} done · ${facts.n - finished} not run`
            : `${facts.n} done`,
      tone: failed.length > 0 ? "red" : "muted",
      duration: facts.abandoned
        ? secondsText(total - 6)
        : secondsText(loopEnd - 4),
      failure: failed.length > 0,
      open: true,
      children,
    });
    if (facts.signOff === "approved" || facts.signOff === "timedOut") {
      const timedOut = facts.signOff === "timedOut";
      rows.push({
        id: "sign-off",
        time: at(total - 4),
        glyph: timedOut ? "cross" : "done",
        icon: "user",
        title: "Ask a person",
        label: "Quality sign-off",
        note: timedOut
          ? "Timed out after 48 h · nobody answered"
          : "Approved by the head of quality",
        tone: timedOut ? "red" : "muted",
        duration: timedOut ? "48 h" : "–",
        failure: timedOut,
      });
    }
  }
  const ending =
    outcome === "warnings"
      ? {
          title: `${runLabel(run)} completed`,
          note: `${facts.failures.length === 1 ? "1 warning" : `${facts.failures.length} warnings`} · ${facts.failures.length} of ${facts.n} suppliers failed at Fetch certificate`,
          glyph: "done" as const,
        }
      : outcome === "error"
        ? {
            title: `${runLabel(run)} ended in an error`,
            note: run.ending ?? "",
            glyph: "cross" as const,
          }
        : outcome === "abandoned"
          ? {
              title: `${runLabel(run)} abandoned`,
              note:
                run.kind === "live" && run.stopped
                  ? `stopped by you at ${run.stopped.clock}`
                  : (run.ending ?? ""),
              glyph: "abandoned" as const,
            }
          : {
              title: `${runLabel(run)} completed`,
              note: run.ending ?? "",
              glyph: "done" as const,
            };
  rows.push({
    id: "end",
    time: at(total),
    glyph: ending.glyph,
    title: ending.title,
    note: ending.note,
    duration: `${secondsText(total)} total`,
    failure: outcome !== "completed" && outcome !== "warnings",
  });
  return rows;
};
