/**
 * J6.0 (Figma 1205:16): History opens on the full run list (layout 1, decided 4 Nov). Status tabs with counts, Sort
 * and Filter with search, the runs table, and a right panel (direction only): tiles, runs over time, recent failures
 * and the next scheduled run. Clicking a run opens it on the canvas.
 *
 * DS gaps: ds-components has no Tabs (the status tabs are a local tablist with DS Badge-like counts), no table, and
 * no stacked bar chart; the DS Filter is one property's chip, not a Sort / Filter ribbon, so Sort and Filter are DS
 * subtle buttons that do nothing yet.
 */
import { useState } from "react";

import {
  Button,
  Icon,
  Menu,
  SegmentedControl,
  TextInput,
} from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { RunGlyph } from "./run-glyph";
import {
  factsOf,
  minutes,
  outcomeOf,
  outcomeState,
  type RunOutcome,
  type RunRecord,
  runClock,
  stepRuns,
  triggerLabel,
} from "./run-history";

import type { HistoryValue } from "./history-view";

type Tab = "all" | "running" | "completed" | "error" | "abandoned";

const tabOf: Record<RunOutcome, Exclude<Tab, "all">> = {
  running: "running",
  needsReview: "running",
  completed: "completed",
  warnings: "completed",
  error: "error",
  abandoned: "abandoned",
};

const tabs: { value: Tab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "running", label: "Running" },
  { value: "completed", label: "Completed" },
  { value: "error", label: "Error" },
  { value: "abandoned", label: "Abandoned" },
];

/** The Status column: the run's glyph and its counts ("18 ✓ · 2 ×", "14 of 20", "Timed out"). */
const statusText = (run: RunRecord, now: number) => {
  const outcome = outcomeOf(run, now);
  const facts = factsOf(run, now);
  const steps = stepRuns(facts);
  if (facts.find === "failed") {
    return "Timed out";
  }
  switch (outcome) {
    case "running":
      return facts.find === "running"
        ? "at Find active suppliers"
        : (steps.eachSupplier?.count ?? "");
    case "needsReview":
      return "Waiting for review";
    case "warnings":
      return steps.eachSupplier?.count ?? "";
    case "error":
      return steps.qualitySignOff?.count ?? "Error";
    case "abandoned":
      return steps.eachSupplier?.count ?? "";
    default:
      return `${facts.n} ✓`;
  }
};

const outputsText = (run: RunRecord, now: number) => {
  const outcome = outcomeOf(run, now);
  const facts = factsOf(run, now);
  if (outcome === "running" || outcome === "needsReview") {
    return "In progress";
  }
  if (facts.find === "failed") {
    return "Nothing (stopped at Find entities)";
  }
  const steps = stepRuns(facts);
  const done = (id: string) =>
    steps[id]?.bar?.find((segment) => segment.state === "done")?.count ?? 0;
  return `${done("fetchCertificate")} certificates · ${done("sendReviewEmail")} emails`;
};

const durationText = (run: RunRecord, now: number) => {
  if (run.kind === "past") {
    return run.duration ?? "";
  }
  const [m = "0", s = "00"] = minutes(runClock(run, now)).split(":");
  return `${m}m ${s}s`;
};

const pageStyle = css({
  flex: "1",
  minWidth: "[0]",
  display: "flex",
  backgroundColor: "neutral.bgSolid.min",
});

const tabStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "2",
  height: "[32px]",
  paddingX: "[10px]",
  textStyle: "sm",
  fontWeight: "medium",
  color: "neutral.fg.muted",
  cursor: "pointer",
  borderRadius: "md",
  _hover: { color: "neutral.fg.heading" },
  "&[aria-selected=true]": { color: "neutral.fg.heading" },
});

const countBadgeStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "[20px]",
  height: "[18px]",
  paddingX: "1",
  borderRadius: "sm",
  textStyle: "xs",
  fontWeight: "medium",
  color: "neutral.fg.muted",
  backgroundColor: "neutral.bgSolid.surface.active",
});

const tableStyle = css({
  width: "[100%]",
  borderCollapse: "collapse",
  textStyle: "sm",
  "& th": {
    textAlign: "left",
    fontWeight: "medium",
    textStyle: "xs",
    color: "neutral.fg.muted",
    height: "[32px]",
    paddingX: "6",
    backgroundColor: "neutral.bgSolid.surface",
    borderBottomWidth: "thin",
    borderBottomStyle: "solid",
    borderBottomColor: "neutral.bd.subtle",
  },
  "& td": {
    height: "[48px]",
    paddingX: "6",
    color: "neutral.fg.body",
    whiteSpace: "nowrap",
    borderBottomWidth: "thin",
    borderBottomStyle: "solid",
    borderBottomColor: "neutral.bd.subtle",
  },
  "& tbody tr": { cursor: "pointer" },
  "& tbody tr:hover": { backgroundColor: "neutral.bg.surface.active" },
});

const RunsTable = ({ history }: { history: HistoryValue }) => {
  const { runs, now } = history;
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [older, setOlder] = useState(false);
  const counts = (value: Tab) =>
    value === "all"
      ? runs.length
      : runs.filter((run) => tabOf[outcomeOf(run, now)] === value).length;
  const matching = runs.filter(
    (run) =>
      (tab === "all" || tabOf[outcomeOf(run, now)] === tab) &&
      `Run ${run.id} ${run.when} ${triggerLabel(run).row}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  const shown = older ? matching : matching.slice(0, 10);
  return (
    <div
      className={css({
        flex: "1",
        minWidth: "[0]",
        overflowY: "auto",
        paddingX: "6",
        paddingTop: "6",
        paddingBottom: "8",
        display: "flex",
        flexDirection: "column",
        gap: "3",
      })}
    >
      <div
        className={css({ display: "flex", alignItems: "baseline", gap: "2" })}
      >
        <span
          className={css({
            textStyle: "lg",
            fontWeight: "semibold",
            color: "neutral.fg.heading",
          })}
        >
          Runs
        </span>
        <span className={css({ textStyle: "xs", color: "neutral.fg.subtle" })}>
          {runs.length} runs
        </span>
      </div>
      <div
        role="tablist"
        aria-label="Run status"
        className={css({ display: "flex", gap: "5" })}
      >
        {tabs.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={tab === item.value}
            className={tabStyle}
            onClick={() => setTab(item.value)}
          >
            <span className={countBadgeStyle}>{counts(item.value)}</span>
            {item.label}
          </button>
        ))}
      </div>
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          gap: "2",
          paddingY: "1",
        })}
      >
        <Button size="sm" variant="subtle" tone="neutral" iconName="sortDown">
          Sort
        </Button>
        <span
          aria-hidden
          className={css({
            width: "[1px]",
            height: "[20px]",
            backgroundColor: "neutral.bd.subtle",
          })}
        />
        <Button size="sm" variant="subtle" tone="neutral" iconName="filter">
          Filter
        </Button>
        <span className={css({ flex: "1" })} />
        <span className={css({ width: "[200px]" })}>
          <TextInput
            value={search}
            onChange={setSearch}
            placeholder="Search runs…"
            size="sm"
            prefix={{ iconName: "search", variant: "subtle" }}
          />
        </span>
      </div>
      <div className={css({ paddingX: "6" })}>
        <table className={tableStyle}>
          <thead>
            <tr>
              <th>Run</th>
              <th>Status</th>
              <th>Started by</th>
              <th>Outputs</th>
              <th>Duration</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {shown.map((run) => (
              <tr
                key={run.id}
                data-run-row={run.id}
                onClick={() => history.open(run.id)}
              >
                <td
                  className={css({
                    fontWeight: "medium",
                    color: "neutral.fg.heading",
                  })}
                >
                  Run {run.id} · {run.when}
                </td>
                <td>
                  <span
                    className={css({
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "2",
                    })}
                  >
                    <RunGlyph state={outcomeState[outcomeOf(run, now)]} />
                    {statusText(run, now)}
                  </span>
                </td>
                <td>
                  {run.trigger.kind === "manual"
                    ? `Manual · ${run.trigger.by}`
                    : "Schedule · monthly"}
                </td>
                <td>{outputsText(run, now)}</td>
                <td>{durationText(run, now)}</td>
                {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- keeps the row's click off the menu */}
                <td onClick={(event) => event.stopPropagation()}>
                  <Menu
                    position="bottom-end"
                    items={[
                      {
                        id: "open",
                        text: "Open run",
                        onClick: () => history.open(run.id),
                      },
                      {
                        id: "rerun",
                        text: "Re-run",
                        onClick: () => history.start(),
                      },
                    ]}
                    trigger={
                      <Button
                        size="xs"
                        variant="ghost"
                        tone="neutral"
                        iconName="ellipsis"
                        aria-label={`Run ${run.id} actions`}
                      />
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {matching.length > shown.length ? (
          <Button
            size="sm"
            variant="ghost"
            tone="neutral"
            className={css({ marginTop: "2" })}
            onClick={() => setOlder(true)}
          >
            {`Show ${matching.length - shown.length} older runs`}
          </Button>
        ) : null}
      </div>
    </div>
  );
};

/* ----------------------------------------------------------------------------------------------------------------
 * Right panel (direction only)
 * ------------------------------------------------------------------------------------------------------------- */

const tileStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  padding: "3",
  borderRadius: "lg",
  backgroundColor: "neutral.bgSolid.surface",
  minHeight: "[84px]",
});

const Tile = ({
  value,
  label,
  alert,
}: {
  value: string;
  label: string;
  alert?: boolean;
}) => (
  <div className={tileStyle}>
    <span
      className={css({
        textStyle: "lg",
        fontWeight: "semibold",
        color: alert ? "red.fg.body" : "neutral.fg.heading",
      })}
    >
      {value}
    </span>
    <span className={css({ textStyle: "xs", color: "neutral.fg.muted" })}>
      {label}
    </span>
  </div>
);

const months = [
  "Dec",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
];

/** Which month bucket a run falls in: "Today" and "2 Nov" are November. */
const monthOf = (run: RunRecord) =>
  run.when.startsWith("Today") ? "Nov" : (run.when.split(/[ ,]/)[1] ?? "");

type Bucket = { label: string; runs: RunRecord[] };

const chartColour: Record<RunOutcome, string> = {
  completed: "var(--colors-green-bg-solid)",
  warnings: "var(--colors-green-bg-solid)",
  error: "var(--colors-red-s110)",
  abandoned: "var(--colors-neutral-fg-subtle)",
  running: "var(--colors-blue-bg-solid)",
  needsReview: "var(--colors-orange-bg-solid)",
};

const stackOrder: RunOutcome[] = [
  "completed",
  "warnings",
  "abandoned",
  "error",
  "needsReview",
  "running",
];

const RunsChart = ({ history }: { history: HistoryValue }) => {
  const { runs, now } = history;
  const [period, setPeriod] = useState<"30d" | "6m" | "1y">("6m");
  const [hover, setHover] = useState<string | null>("Nov");
  const recent = runs.filter((run) => !run.when.includes("2025"));
  const buckets: Bucket[] =
    period === "30d"
      ? ["31 Oct", "1 Nov", "2 Nov", "Today"].map((day) => ({
          label: day === "Today" ? "4 Nov" : day,
          runs: recent.filter((run) => run.when.startsWith(day)),
        }))
      : (period === "6m" ? months.slice(6) : months).map((month) => ({
          label: month,
          runs:
            month === "Dec"
              ? runs.filter((run) => run.when.startsWith("1 Dec"))
              : recent.filter((run) => monthOf(run) === month),
        }));
  const max = 4;
  const hovered = buckets.find((bucket) => bucket.label === hover);
  const summary = (bucket: Bucket) => {
    const count = (outcome: RunOutcome) =>
      bucket.runs.filter((run) => outcomeOf(run, now) === outcome).length;
    const completed = count("completed") + count("warnings");
    return [
      [
        completed ? `${completed} completed` : "",
        count("warnings") ? `${count("warnings")} with warnings` : "",
      ]
        .filter(Boolean)
        .join(", "),
      [
        count("error") ? `${count("error")} error` : "",
        count("abandoned") ? `${count("abandoned")} abandoned` : "",
        count("running") + count("needsReview")
          ? `${count("running") + count("needsReview")} running`
          : "",
      ]
        .filter(Boolean)
        .join(" · "),
    ].filter(Boolean);
  };
  return (
    <section
      className={css({ display: "flex", flexDirection: "column", gap: "3" })}
    >
      <span
        className={css({
          textStyle: "sm",
          fontWeight: "medium",
          color: "neutral.fg.heading",
        })}
      >
        Runs over time
      </span>
      <SegmentedControl
        size="sm"
        aria-label="Period"
        value={period}
        onChange={(next) => setPeriod(next)}
        items={[
          { value: "30d", label: "30 days" },
          { value: "6m", label: "6 months" },
          { value: "1y", label: "1 year" },
        ]}
      />
      <div
        className={css({
          position: "relative",
          height: "[216px]",
          display: "flex",
          gap: "2",
          paddingLeft: "5",
          paddingTop: "[72px]",
        })}
      >
        {hovered && hovered.runs.length > 0 ? (
          <div
            className={css({
              position: "absolute",
              top: "[0]",
              right: "[0]",
              padding: "2",
              borderRadius: "md",
              borderWidth: "thin",
              borderStyle: "solid",
              borderColor: "neutral.bd.subtle",
              backgroundColor: "neutral.bgSolid.min",
              textStyle: "xs",
              color: "neutral.fg.muted",
              zIndex: "[1]",
            })}
          >
            <div
              className={css({
                fontWeight: "medium",
                color: "neutral.fg.heading",
              })}
            >
              {hovered.label} · {hovered.runs.length} runs
            </div>
            {summary(hovered).map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        ) : null}
        {[4, 2, 0].map((tick) => (
          <span
            key={tick}
            className={css({
              position: "absolute",
              left: "[0]",
              textStyle: "xs",
              color: "neutral.fg.subtle",
            })}
            style={{ bottom: 20 + (tick / max) * 124 - 7 }}
          >
            {tick}
          </span>
        ))}
        {buckets.map((bucket) => (
          // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- hover shows the bucket's counts
          <div
            key={bucket.label}
            className={css({
              flex: "1",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "1",
              justifyContent: "flex-end",
            })}
            onMouseEnter={() => setHover(bucket.label)}
          >
            <div
              className={css({
                display: "flex",
                flexDirection: "column-reverse",
                gap: "[1.5px]",
                width: "[100%]",
                maxWidth: "[28px]",
              })}
            >
              {stackOrder.map((outcome) => {
                const count = bucket.runs.filter(
                  (run) => outcomeOf(run, now) === outcome,
                ).length;
                return count > 0 ? (
                  <span
                    key={outcome}
                    style={{
                      height: (count / max) * 124 - 1.5,
                      backgroundColor: chartColour[outcome],
                      borderRadius: 2,
                    }}
                  />
                ) : null;
              })}
            </div>
            <span
              className={css({
                textStyle: "xs",
                color: "neutral.fg.subtle",
                height: "[16px]",
              })}
            >
              {bucket.label}
            </span>
          </div>
        ))}
      </div>
      <span className={css({ textStyle: "xs", color: "neutral.fg.subtle" })}>
        Direction, not final: Dei and Ciarán to weigh in. 30 days shows days, 1
        year shows months; failures sit inside each bar.
      </span>
    </section>
  );
};

const failureRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  width: "[100%]",
  paddingY: "1.5",
  textAlign: "left",
  cursor: "pointer",
  borderRadius: "md",
  _hover: { backgroundColor: "neutral.bg.surface.active" },
});

const Overview = ({ history }: { history: HistoryValue }) => {
  const { runs, now } = history;
  const errors = runs.filter((run) => outcomeOf(run, now) === "error").length;
  const abandoned = runs.filter(
    (run) => outcomeOf(run, now) === "abandoned",
  ).length;
  const warnings = runs.filter(
    (run) => outcomeOf(run, now) === "warnings",
  ).length;
  const failures: { runId: number; title: string; line: string }[] =
    runs.flatMap((run) => {
      const outcome = outcomeOf(run, now);
      const facts = factsOf(run, now);
      if (outcome === "warnings") {
        return [
          {
            runId: run.id,
            title: `Fetch certificate · ${facts.failures.length} of ${facts.n} failed`,
            line: `Run ${run.id} · ${run.when} · with warnings`,
          },
        ];
      }
      if (outcome === "error") {
        return [
          {
            runId: run.id,
            title:
              facts.find === "failed"
                ? "Find entities · timed out"
                : "Quality sign-off · timed out",
            line: `Run ${run.id} · ${run.when} · error`,
          },
        ];
      }
      return [];
    });
  return (
    <aside
      aria-label="Runs overview"
      className={css({
        flexShrink: 0,
        width: "[344px]",
        height: "[100%]",
        overflowY: "auto",
        padding: "6",
        display: "flex",
        flexDirection: "column",
        gap: "6",
        borderLeftWidth: "thin",
        borderLeftStyle: "solid",
        borderLeftColor: "neutral.bd.subtle",
      })}
    >
      <section
        className={css({ display: "flex", flexDirection: "column", gap: "2" })}
      >
        <span
          className={css({
            textStyle: "sm",
            fontWeight: "medium",
            color: "neutral.fg.heading",
          })}
        >
          All {runs.length} runs
        </span>
        <div
          className={css({
            display: "grid",
            gridTemplateColumns: "[1fr 1fr]",
            gap: "2",
          })}
        >
          <Tile value={String(runs.length)} label="runs since 18 Nov 2025" />
          <Tile
            value={String(errors + abandoned)}
            label={`didn't finish: ${errors} errors, ${abandoned} abandoned`}
            alert
          />
          <Tile value="1m 44s" label="typical run (median of completed runs)" />
          <Tile
            value={String(warnings)}
            label="completed with warnings (proposed)"
          />
        </div>
      </section>
      <RunsChart history={history} />
      <section
        className={css({ display: "flex", flexDirection: "column", gap: "1" })}
      >
        <span
          className={css({
            textStyle: "sm",
            fontWeight: "medium",
            color: "neutral.fg.heading",
          })}
        >
          Recent failures · click to open the run
        </span>
        {failures.map((failure) => (
          <button
            key={failure.runId}
            type="button"
            className={failureRowStyle}
            onClick={() => history.open(failure.runId)}
          >
            <span
              className={css({
                flex: "1",
                display: "flex",
                flexDirection: "column",
                gap: "0.5",
              })}
            >
              <span
                className={css({ textStyle: "sm", color: "neutral.fg.body" })}
              >
                {failure.title}
              </span>
              <span className={css({ textStyle: "xs", color: "blue.fg.link" })}>
                {failure.line}
              </span>
            </span>
            <span
              className={css({
                color: "neutral.fg.subtle",
                display: "inline-flex",
              })}
            >
              <Icon name="chevronRight" size="sm" />
            </span>
          </button>
        ))}
      </section>
      <section
        className={css({ display: "flex", flexDirection: "column", gap: "1" })}
      >
        <span
          className={css({
            textStyle: "sm",
            fontWeight: "medium",
            color: "neutral.fg.heading",
          })}
        >
          Next scheduled run
        </span>
        <span
          className={cx(css({ textStyle: "sm", color: "neutral.fg.body" }))}
        >
          1 Dec, 09:00 · Schedule · monthly
        </span>
      </section>
    </aside>
  );
};

export const AllRuns = ({ history }: { history: HistoryValue }) => (
  <div className={pageStyle} data-all-runs>
    <RunsTable history={history} />
    <Overview history={history} />
  </div>
);
