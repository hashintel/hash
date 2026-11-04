/**
 * J6.0 (Figma 1205:16): History opens on the full run list (layout 1, decided 4 Nov). Status tabs with counts, Sort
 * and Filter with search, the runs table, and a right panel (direction only): tiles, runs over time, recent failures
 * and the next scheduled run. Clicking a run opens it on the canvas.
 *
 * DS gaps: ds-components has no Tabs (the status tabs are a local tablist with DS Badge-like counts), no table, and
 * no stacked bar chart; the DS Filter is one property's chip, not a Sort / Filter ribbon, so Sort and Filter are DS
 * subtle buttons that do nothing yet.
 */
import { useLayoutEffect, useRef, useState } from "react";

import {
  Button,
  Icon,
  Menu,
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
import { statusColor } from "./status-colors";

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

/**
 * The status filters and Sort / Filter are one family (Aakarsh, 4 Nov: "sizes are all over the place"): 28 px high,
 * 8 px corners, 14 px Medium, 16 px icons, no border. The selected status sits on a subtle neutral fill.
 */
const tabStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
  height: "[28px]",
  paddingX: "2.5",
  textStyle: "sm",
  fontWeight: "medium",
  color: "neutral.fg.muted",
  cursor: "pointer",
  borderRadius: "lg",
  _hover: { backgroundColor: "neutral.bg.surface.hover" },
  "&[aria-selected=true]": {
    color: "neutral.fg.heading",
    backgroundColor: "neutral.bg.surface.active",
  },
});

const countStyle = css({
  color: "neutral.fg.subtle",
  fontVariantNumeric: "tabular-nums",
});

const rowButtonStyle = css({
  "&[class]": { color: "neutral.fg.muted" },
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
        className={css({
          display: "flex",
          alignItems: "center",
          gap: "1",
          paddingY: "1",
        })}
      >
        <div
          role="tablist"
          aria-label="Run status"
          className={css({ display: "flex", alignItems: "center", gap: "1" })}
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
              {item.label}
              <span className={countStyle}>{counts(item.value)}</span>
            </button>
          ))}
        </div>
        <span className={css({ flex: "1" })} />
        <Button
          size="sm"
          variant="ghost"
          tone="neutral"
          iconName="sortDown"
          className={rowButtonStyle}
        >
          Sort
        </Button>
        <Button
          size="sm"
          variant="ghost"
          tone="neutral"
          iconName="filter"
          className={rowButtonStyle}
        >
          Filter
        </Button>
        <span className={css({ width: "[200px]", marginLeft: "2" })}>
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

const monthNames = [
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
  "Dec",
];

/** The demo's today: 4 Nov 2026 (MOCK: the seeded runs are dated around it). */
const today = new Date(2026, 10, 4);

const dayMs = 24 * 60 * 60 * 1000;

/** A run's day from its "Today, 10:42" / "2 Nov, 16:20" / "1 Dec 2025, 09:00" label. */
const runDay = (run: RunRecord) => {
  if (run.when.startsWith("Today")) {
    return today;
  }
  if (run.when.startsWith("Yesterday")) {
    return new Date(today.getTime() - dayMs);
  }
  const [day = "1", month = "Jan", year = "2026"] = run.when
    .split(",")[0]!
    .split(" ");
  return new Date(Number(year), monthNames.indexOf(month), Number(day));
};

const dayLabel = (date: Date) =>
  `${date.getDate()} ${monthNames[date.getMonth()]}`;

type Period = "30d" | "6m" | "1y";

type Bucket = { label: string; runs: RunRecord[] };

/** 30D by day, 6M by week, 1Y by month (decided 4 Nov), each ending today. */
const bucketsFor = (
  period: Period,
  runs: RunRecord[],
): { name: string; range: string; buckets: Bucket[]; axis: string[] } => {
  const days = runs.map((run) => ({ run, day: runDay(run).getTime() }));
  const within = (start: number, end: number) =>
    days
      .filter((entry) => entry.day >= start && entry.day <= end)
      .map((entry) => entry.run);
  if (period === "1y") {
    const buckets = Array.from({ length: 12 }, (_, index) => {
      const start = new Date(
        today.getFullYear(),
        today.getMonth() - 11 + index,
        1,
      );
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
      return {
        label: monthNames[start.getMonth()]!,
        runs: within(start.getTime(), end.getTime()),
      };
    });
    return {
      name: "Monthly",
      range: "Dec 2025 – Nov 2026",
      buckets,
      axis: ["Dec", "Jun", "Nov"],
    };
  }
  const size = period === "30d" ? 1 : 7;
  const count = period === "30d" ? 30 : 26;
  const buckets = Array.from({ length: count }, (_, index) => {
    const end = today.getTime() - (count - 1 - index) * size * dayMs;
    const start = end - (size - 1) * dayMs;
    return {
      label:
        size === 1
          ? dayLabel(new Date(end))
          : `${dayLabel(new Date(start))} – ${dayLabel(new Date(end))}`,
      runs: within(start, end),
    };
  });
  const first = new Date(today.getTime() - (count * size - 1) * dayMs);
  const middle = new Date(
    today.getTime() - Math.floor((count * size) / 2) * dayMs,
  );
  return {
    name: size === 1 ? "Daily" : "Weekly",
    range: `${dayLabel(first)} – ${dayLabel(today)}`,
    buckets,
    axis: [dayLabel(first), dayLabel(middle), "Today"],
  };
};

const chartColour: Record<RunOutcome, string> = {
  completed: statusColor.done,
  warnings: statusColor.done,
  error: statusColor.failed,
  abandoned: statusColor.quiet,
  running: statusColor.running,
  needsReview: statusColor.review,
};

const stackOrder: RunOutcome[] = [
  "completed",
  "warnings",
  "abandoned",
  "error",
  "needsReview",
  "running",
];

const chartHeight = 124;

const periodStyle = css({
  height: "[24px]",
  paddingX: "1.5",
  borderRadius: "md",
  textStyle: "xs",
  fontWeight: "medium",
  color: "neutral.fg.subtle",
  cursor: "pointer",
  _hover: { color: "neutral.fg.heading" },
  "&[aria-checked=true]": {
    color: "neutral.fg.heading",
    backgroundColor: "neutral.bg.surface.active",
  },
});

/** The bucket a bar shows, and where its tooltip anchors: the bar's centre and top, in the chart's own pixels. */
type ChartHover = { label: string; x: number; top: number };

const tipStyle = css({
  position: "absolute",
  zIndex: "[1]",
  paddingX: "2",
  paddingY: "1",
  borderRadius: "md",
  backgroundColor: "neutral.fg.heading",
  color: "neutral.fg.onSolid",
  textStyle: "xs",
  whiteSpace: "nowrap",
  pointerEvents: "none",
  transform: "[translateY(calc(-100% - 6px))]",
});

const RunsChart = ({ history }: { history: HistoryValue }) => {
  const { runs, now } = history;
  const [period, setPeriod] = useState<Period>("6m");
  const [hover, setHover] = useState<ChartHover | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const { name, range, buckets, axis } = bucketsFor(period, runs);
  const max = Math.max(1, ...buckets.map((bucket) => bucket.runs.length));
  // GitHub-style axis on the right: 0, the midpoint when it is a whole number, and the max.
  const ticks = [max, ...(max % 2 === 0 && max > 2 ? [max / 2] : []), 0];
  const hovered = hover
    ? buckets.find((bucket) => bucket.label === hover.label)
    : undefined;
  const tipText = (bucket: Bucket) => {
    const failed = bucket.runs.filter(
      (run) => outcomeOf(run, now) === "error",
    ).length;
    const runsText = `${bucket.runs.length} ${bucket.runs.length === 1 ? "run" : "runs"}`;
    return [bucket.label, runsText, failed > 0 ? `${failed} failed` : ""]
      .filter(Boolean)
      .join(" · ");
  };

  // The tooltip centres on its bar, clamped inside the chart so it never clips at either edge.
  useLayoutEffect(() => {
    const tip = tipRef.current;
    const box = boxRef.current;
    if (!hover || !tip || !box) {
      return;
    }
    const width = tip.offsetWidth;
    const left = Math.min(
      Math.max(hover.x - width / 2, 0),
      box.clientWidth - width,
    );
    tip.style.left = `${left}px`;
    tip.style.top = `${hover.top}px`;
  }, [hover]);

  return (
    <section
      className={css({ display: "flex", flexDirection: "column", gap: "3" })}
    >
      <div
        className={css({ display: "flex", flexDirection: "column", gap: "1" })}
      >
        <div
          className={css({
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          })}
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
          {/* A small text toggle (Aakarsh, 4 Nov: "just do 30D, 6M, 1Y"): no border, the pick on a subtle fill. */}
          <div
            role="radiogroup"
            aria-label="Period"
            data-control-check="skip"
            className={css({ display: "flex", gap: "0.5" })}
          >
            {(
              [
                ["30d", "30D"],
                ["6m", "6M"],
                ["1y", "1Y"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={period === value}
                className={periodStyle}
                onClick={() => {
                  setPeriod(value);
                  setHover(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <span className={css({ textStyle: "xs", color: "neutral.fg.subtle" })}>
          {name} · {range}
        </span>
      </div>
      {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- leaving the chart hides its tooltip */}
      <div
        ref={boxRef}
        data-runs-chart
        className={css({
          position: "relative",
          height: "[192px]",
          display: "flex",
          gap: "[2px]",
          paddingRight: "6",
          paddingTop: "[48px]",
        })}
        onMouseLeave={() => setHover(null)}
      >
        {hovered && hovered.runs.length > 0 ? (
          <div ref={tipRef} className={tipStyle} data-chart-tip>
            {tipText(hovered)}
          </div>
        ) : null}
        {ticks.map((tick) => (
          <span
            key={tick}
            className={css({
              position: "absolute",
              right: "[0]",
              textStyle: "xxs",
              color: "neutral.fg.muted",
            })}
            style={{ bottom: 20 + (tick / max) * chartHeight - 6 }}
          >
            {tick}
          </span>
        ))}
        {buckets.map((bucket) => (
          // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- hover shows the bucket's counts
          <div
            key={bucket.label}
            data-hovered={hover?.label === bucket.label || undefined}
            className={css({
              flex: "1",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "1",
              justifyContent: "flex-end",
              borderRadius: "sm",
              "&[data-hovered]": {
                backgroundColor: "neutral.bg.surface.active",
              },
            })}
            onMouseEnter={(event) => {
              const box = boxRef.current?.getBoundingClientRect();
              const stack = event.currentTarget.firstElementChild;
              const bar = stack?.getBoundingClientRect();
              if (!box || !bar) {
                return;
              }
              setHover({
                label: bucket.label,
                x: bar.left - box.left + bar.width / 2,
                top: (bar.height > 0 ? bar.top : bar.bottom) - box.top,
              });
            }}
          >
            <div
              className={css({
                display: "flex",
                flexDirection: "column-reverse",
                gap: "[1.5px]",
                width: "[100%]",
                maxWidth: "[24px]",
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
                      height: (count / max) * chartHeight - 1.5,
                      backgroundColor: chartColour[outcome],
                      borderRadius: 2,
                    }}
                  />
                ) : null;
              })}
              {bucket.runs.length === 0 ? (
                <span
                  style={{
                    height: 2,
                    backgroundColor: statusColor.track,
                    borderRadius: 1,
                  }}
                />
              ) : null}
            </div>
            <span className={css({ height: "[16px]" })} />
          </div>
        ))}
        {/* X labels thin out to the start, the middle and today (Figma X4). */}
        <div
          aria-hidden
          className={css({
            position: "absolute",
            left: "[0]",
            right: "6",
            bottom: "[0]",
            display: "flex",
            justifyContent: "space-between",
            textStyle: "xxs",
            color: "neutral.fg.subtle",
          })}
        >
          {axis.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      </div>
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
