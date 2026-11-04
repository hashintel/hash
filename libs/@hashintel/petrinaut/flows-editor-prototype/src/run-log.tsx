/**
 * J6.9 / J6.10 (Figma 1207:95471, 1207:95816): a past run's Canvas | Log switch, a DS SegmentedControl xs at the
 * canvas top-left. Its placement is still open (4 Nov: L1 switch vs a logs button vs the right panel). Log replaces
 * the canvas with one chronological row per step; the For each groups its items, and a failed item opens on its
 * retries. The last row says how the run ended.
 */
import { useState } from "react";

import {
  Icon,
  type IconName,
  SegmentedControl,
  TextInput,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { useEditor } from "./editor-context";
import { RunGlyph } from "./run-glyph";
import {
  clockPlus,
  factsOf,
  outcomeOf,
  type RunFacts,
  type RunRecord,
  type StepState,
  suppliers,
} from "./run-history";

import type { HistoryValue } from "./history-view";

/** Only a run that has ended has a log to read; a live run stays on the canvas. */
const hasLog = (history: HistoryValue) => {
  const run = history.run;
  if (!run) {
    return false;
  }
  const outcome = outcomeOf(run, history.now);
  return outcome !== "running" && outcome !== "needsReview";
};

export const RunViewSwitch = ({ history }: { history: HistoryValue }) => {
  const { ui, setUi } = useEditor();
  // J6.4–J6.8 draw no switch; J6.9 adds it (its placement is still open), and from there every past run has it.
  if (!hasLog(history) || ui.runLog === undefined) {
    return null;
  }
  return (
    <SegmentedControl
      size="xs"
      aria-label="Run view"
      value={ui.runLog ? "log" : "canvas"}
      onChange={(view) =>
        setUi((current) => ({ ...current, runLog: view === "log" }))
      }
      items={[
        { value: "canvas", label: "Canvas" },
        { value: "log", label: "Log" },
      ]}
    />
  );
};

/* ----------------------------------------------------------------------------------------------------------------
 * The log's rows
 * ------------------------------------------------------------------------------------------------------------- */

type Tone = "muted" | "red";

type LogRow = {
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

const secondsText = (seconds: number) =>
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

const logRows = (run: RunRecord, facts: RunFacts, now: number): LogRow[] => {
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
          title: `Run ${run.id} completed with warnings (proposed)`,
          note: `${facts.failures.length} of ${facts.n} suppliers failed at Fetch certificate`,
          glyph: "cross" as const,
        }
      : outcome === "error"
        ? {
            title: `Run ${run.id} ended in an error`,
            note: run.ending ?? "",
            glyph: "cross" as const,
          }
        : outcome === "abandoned"
          ? {
              title: `Run ${run.id} abandoned`,
              note:
                run.kind === "live" && run.stopped
                  ? `stopped by you at ${run.stopped.clock}`
                  : (run.ending ?? ""),
              glyph: "abandoned" as const,
            }
          : {
              title: `Run ${run.id} completed`,
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
    failure: outcome !== "completed",
  });
  return rows;
};

/* ----------------------------------------------------------------------------------------------------------------
 * The log view
 * ------------------------------------------------------------------------------------------------------------- */

const rowStyle = css({
  display: "grid",
  gridTemplateColumns: "[88px 1fr auto]",
  alignItems: "center",
  minHeight: "[36px]",
  paddingX: "4",
  textStyle: "sm",
  "&[data-loop]": { backgroundColor: "neutral.bgSolid.surface" },
  // "Show in log" from a run step's menu marks its rows for a moment.
  "&[data-flash]": { backgroundColor: "neutral.bg.surface.active" },
  transition: "[background-color 0.4s ease]",
  "&[data-end]": {
    borderTopWidth: "thin",
    borderTopStyle: "solid",
    borderTopColor: "neutral.bd.subtle",
  },
});

const chevronStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[16px]",
  height: "[16px]",
  color: "neutral.fg.muted",
  cursor: "pointer",
  borderRadius: "sm",
  _hover: { backgroundColor: "neutral.bg.surface.active" },
});

const Glyph = ({ glyph }: { glyph: LogRow["glyph"] }) =>
  glyph === "cross" ? (
    <span
      className={css({ display: "inline-flex", color: "red.fg.body" })}
      aria-label="Failed"
    >
      <Icon name="close" size="sm" />
    </span>
  ) : (
    <RunGlyph state={glyph} size={14} />
  );

const Row = ({
  row,
  depth,
  open,
  onToggle,
}: {
  row: LogRow;
  depth: number;
  open: boolean;
  onToggle: () => void;
}) => (
  <div
    className={rowStyle}
    data-loop={row.id === "loop" || undefined}
    data-end={row.id === "end" || undefined}
    data-log-row={row.id}
  >
    <span className={css({ color: "neutral.fg.subtle" })}>
      {row.time ?? ""}
    </span>
    <span
      className={css({
        display: "flex",
        alignItems: "center",
        gap: "2",
        minWidth: "[0]",
      })}
      style={{ paddingLeft: depth * 28 }}
    >
      <span className={css({ width: "[16px]", display: "inline-flex" })}>
        {row.children ? (
          <button
            type="button"
            className={chevronStyle}
            aria-label={open ? "Fold" : "Unfold"}
            aria-expanded={open}
            onClick={onToggle}
          >
            <Icon name={open ? "chevronDown" : "chevronRight"} size="xs" />
          </button>
        ) : null}
      </span>
      <Glyph glyph={row.glyph} />
      {row.icon ? (
        <span
          className={css({ display: "inline-flex", color: "neutral.fg.muted" })}
        >
          <Icon name={row.icon} size="sm" />
        </span>
      ) : null}
      <span
        className={css({
          fontWeight: "medium",
          color: "neutral.fg.heading",
          whiteSpace: "nowrap",
        })}
      >
        {row.title}
        {row.label ? (
          <span
            className={css({ fontWeight: "normal", color: "neutral.fg.body" })}
          >
            {" "}
            · {row.label}
          </span>
        ) : null}
      </span>
      {row.note ? (
        <span
          className={css({
            color: row.tone === "red" ? "red.fg.body" : "neutral.fg.subtle",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          })}
        >
          {row.note}
        </span>
      ) : null}
    </span>
    <span
      className={css({
        color: "neutral.fg.subtle",
        whiteSpace: "nowrap",
        paddingLeft: "3",
      })}
    >
      {row.duration}
    </span>
  </div>
);

const errorBoxStyle = css({
  marginY: "1",
  marginRight: "4",
  padding: "3",
  borderRadius: "md",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "red.bd.solid",
  backgroundColor: "red.bgSolid.subtle",
  textStyle: "sm",
  display: "flex",
  flexDirection: "column",
  gap: "0.5",
});

const ErrorBox = ({
  error,
  depth,
}: {
  error: NonNullable<LogRow["error"]>;
  depth: number;
}) => (
  <div className={errorBoxStyle} style={{ marginLeft: 104 + depth * 28 }}>
    <span className={css({ color: "red.fg.body", fontWeight: "medium" })}>
      {error.title}
    </span>
    {error.tries.map(([time, line]) => (
      <span
        key={time + line}
        className={css({ textStyle: "xs", color: "neutral.fg.body" })}
      >
        <span className={css({ color: "neutral.fg.subtle", marginRight: "2" })}>
          {time}
        </span>
        {line}
      </span>
    ))}
    <span className={css({ textStyle: "xs", color: "neutral.fg.subtle" })}>
      {error.after}
    </span>
  </div>
);

/** Keeps what "Failures only" shows: failed rows, the rows that hold them, and how the run ended. A failed item keeps
 * every step, so its story reads in order. */
const failuresOnly = (rows: LogRow[]): LogRow[] =>
  rows.flatMap((row) =>
    row.id === "end"
      ? [row]
      : !row.failure
        ? []
        : row.id.startsWith("failed-") || !row.children
          ? [row]
          : [{ ...row, children: failuresOnly(row.children) }],
  );

export const RunLog = ({ history }: { history: HistoryValue }) => {
  const { run, now } = history;
  const [filter, setFilter] = useState<"all" | "failures">("all");
  const [search, setSearch] = useState("");
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  if (!run || !hasLog(history)) {
    return null;
  }
  const facts = factsOf(run, now);
  const all = logRows(run, facts, now);
  const failureCount =
    facts.failures.length +
    (facts.find === "failed" || facts.signOff === "timedOut" ? 1 : 0);
  const query = search.trim().toLowerCase();
  const isOpen = (row: LogRow) => toggled[row.id] ?? row.open ?? false;
  const flat: { row: LogRow; depth: number }[] = [];
  const visit = (rows: LogRow[], depth: number) => {
    for (const row of rows) {
      flat.push({ row, depth });
      if (row.children && (query || isOpen(row))) {
        visit(row.children, depth + 1);
      }
    }
  };
  visit(filter === "failures" ? failuresOnly(all) : all, 0);
  const shown = query
    ? flat.filter(({ row }) =>
        `${row.title} ${row.label ?? ""} ${row.note ?? ""}`
          .toLowerCase()
          .includes(query),
      )
    : flat;
  return (
    <div
      data-run-log
      className={css({
        position: "absolute",
        inset: "[0]",
        zIndex: "[5]",
        backgroundColor: "neutral.bgSolid.surface",
        paddingTop: "[74px]",
        paddingX: "4",
        paddingBottom: "4",
        display: "flex",
      })}
    >
      <div
        className={css({
          flex: "1",
          display: "flex",
          flexDirection: "column",
          minHeight: "[0]",
          backgroundColor: "neutral.bgSolid.min",
          borderWidth: "thin",
          borderStyle: "solid",
          borderColor: "neutral.bd.subtle",
          borderRadius: "lg",
          overflow: "hidden",
        })}
      >
        <div
          className={css({
            display: "flex",
            alignItems: "center",
            gap: "2",
            height: "[52px]",
            paddingX: "4",
            borderBottomWidth: "thin",
            borderBottomStyle: "solid",
            borderBottomColor: "neutral.bd.subtle",
          })}
        >
          <span
            className={css({
              textStyle: "base",
              fontWeight: "semibold",
              color: "neutral.fg.heading",
            })}
          >
            Log
          </span>
          <span
            className={css({
              textStyle: "sm",
              color: "neutral.fg.subtle",
              flex: "1",
            })}
          >
            {shown.length} rows · Run {run.id} ·{" "}
            {secondsText(durationSeconds(run))}
          </span>
          <SegmentedControl
            size="sm"
            aria-label="Rows"
            value={filter}
            onChange={(next) => setFilter(next)}
            items={[
              { value: "all", label: "All" },
              { value: "failures", label: `Failures only · ${failureCount}` },
            ]}
          />
          <span className={css({ width: "[200px]" })}>
            <TextInput
              value={search}
              onChange={setSearch}
              placeholder="Search the log"
              size="sm"
            />
          </span>
        </div>
        <div
          className={css({
            display: "grid",
            gridTemplateColumns: "[88px 1fr auto]",
            height: "[30px]",
            alignItems: "center",
            paddingX: "4",
            textStyle: "xs",
            color: "neutral.fg.muted",
          })}
        >
          <span>Time</span>
          <span>Step</span>
          <span>Duration</span>
        </div>
        <div
          className={css({ flex: "1", overflowY: "auto", paddingBottom: "2" })}
        >
          {shown.map(({ row, depth }) => (
            <div key={row.id}>
              <Row
                row={row}
                depth={depth}
                open={isOpen(row)}
                onToggle={() =>
                  setToggled((current) => ({
                    ...current,
                    [row.id]: !isOpen(row),
                  }))
                }
              />
              {row.error ? <ErrorBox error={row.error} depth={depth} /> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
