/**
 * J6.0 (Figma 1205:16): History opens on the full run list (layout 1, decided 4 Nov). Status tabs with counts, Sort
 * and Filter with search, the runs table, and a right panel (direction only): tiles, runs over time, recent failures
 * and the next scheduled run. Clicking a run opens it on the canvas.
 *
 * DS gaps: ds-components has no Tabs (the status tabs are a local tablist with DS Badge-like counts), no table, and
 * no stacked bar chart. Sort is a DS Menu (the DS SortMenu marks the active sort in brand blue, which here means
 * running, so it has ticks instead). Filter opens "Filter by…" and the DS Filter ribbon under the tabs (B, inbox
 * run-filter; ledger 4 Nov: status tabs, plus the DS Filter, plus sorting): `runs-filter.tsx`.
 */
import { useLayoutEffect, useRef, useState } from "react";

import {
  Button,
  Icon,
  Menu,
  TextInput,
  Tooltip,
} from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import {
  factsOf,
  minutes,
  outcomeOf,
  outcomeState,
  type RunOutcome,
  type RunRecord,
  runClock,
  runProgress,
  statusText,
  triggerLabel,
  warningsOf,
  warningsText,
} from "./run-history";
import { RunOutputsCell } from "./run-outputs";
import {
  RunItemsCell,
  runStatusTake,
  RunStatusTakeCell,
} from "./run-status-takes";
import {
  appliedChips,
  durationSeconds,
  FilterByMenu,
  newChip,
  passesChips,
  type RunFilterChip,
  RunsFilterRibbon,
} from "./runs-filter";
import { StatusCell } from "./status-cell";
import { chartColor, statusColor } from "./status-colors";
import { Toast } from "./ui";

import type { HistoryValue } from "./history-view";

/**
 * A run ends in success or failure, with warnings counted apart (Ciarán 4 Nov, Dei 5 Nov): a run with warnings is
 * Completed, and an abandoned run is one way of Failed (its cell still says "Abandoned").
 */
type Tab = "all" | "running" | "completed" | "failed";

const tabOf: Record<RunOutcome, Exclude<Tab, "all">> = {
  running: "running",
  needsReview: "running",
  completed: "completed",
  warnings: "completed",
  error: "failed",
  abandoned: "failed",
};

const tabs: { value: Tab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "running", label: "Running" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
];

/** "… timed out after 48 h" → "Timed out after 48 h". */
const timeoutReason = (run: RunRecord) => {
  const after = /timed out (after .+)$/i.exec(run.ending ?? "")?.[1];
  return after ? `Timed out ${after}` : "Timed out";
};

/**
 * The Status column, one status cell per run: the glyph, and text only where it adds something ("18", "6 of 20",
 * "Timed out", "Needs review"). The glyph's tooltip names the state and its detail.
 */
const statusCellOf = (
  run: RunRecord,
  now: number,
): React.ComponentProps<typeof StatusCell> => {
  const outcome = outcomeOf(run, now);
  const facts = factsOf(run, now);
  const progress = runProgress(run, now);
  const state = outcomeState[outcome];
  if (facts.find === "failed") {
    return {
      state,
      text: "Timed out",
      detail: `${timeoutReason(run)} at Find active suppliers`,
    };
  }
  switch (outcome) {
    case "running":
      return facts.find === "running"
        ? {
            state,
            text: "at Find active suppliers",
            detail: "at Find active suppliers",
          }
        : {
            state,
            progress,
            text: progress
              ? `${progress.done} of ${progress.total}`
              : undefined,
          };
    case "needsReview":
      return { state, text: "Needs review", detail: "Quality sign-off" };
    case "error":
      return {
        state,
        text: "Timed out",
        detail: `${timeoutReason(run)} at Quality sign-off`,
      };
    case "abandoned":
      return {
        state,
        progress,
        text: progress
          ? `Abandoned · ${progress.done} of ${progress.total}`
          : "Abandoned",
      };
    case "warnings": {
      // Success, so the tick; the warnings are a count beside it, not a partly done mark.
      const warnings = warningsText(warningsOf(run, now));
      return {
        state,
        warnings: true,
        text: progress ? `${progress.done} · ${warnings}` : warnings,
        detail: `${warnings} · ${facts.failures.length} of ${facts.n} certificates not fetched`,
      };
    }
    default:
      return { state, progress, text: String(facts.n) };
  }
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

/** Sort or Filter while it changes the table: the label reads dark, as a selected status tab does. */
const rowButtonActiveStyle = css({
  "&[class]": { color: "neutral.fg.heading" },
});

/**
 * `?runsort=old`: Sort and Filter as they were, buttons that open nothing. URL only, never remembered. Without it
 * Sort orders by start time, duration or status, and Filter opens the DS Filter ribbon.
 */
const oldRunsSort =
  new URLSearchParams(globalThis.location.search).get("runsort") === "old";

/**
 * `?logsfilter=old`: Filter as a plain checkbox menu (status, trigger, who ran it) instead of the picked ribbon B.
 * URL only, never remembered.
 */
const oldLogsFilter =
  new URLSearchParams(globalThis.location.search).get("logsfilter") === "old";

/** Filters saved with Save: the ribbon opens on them the next time Logs opens in this session. */
let savedChips: RunFilterChip[] = [];

type SortKey = "started" | "duration" | "status";

/** Each sort's two orders, first the one it starts in. */
const sortOrders: Record<SortKey, { label: string; orders: [string, string] }> =
  {
    started: { label: "Start time", orders: ["Newest first", "Oldest first"] },
    duration: {
      label: "Duration",
      orders: ["Longest first", "Shortest first"],
    },
    status: { label: "Status", orders: ["Failed first", "Completed first"] },
  };

/** Status order for sorting: what needs a look first. */
const statusRank: Record<RunOutcome, number> = {
  error: 0,
  abandoned: 1,
  needsReview: 2,
  running: 3,
  warnings: 4,
  completed: 5,
};

/** The Filter menu's status words, finer than the tabs (a run with warnings is one way of Completed). */
const statusFilterLabel: Record<RunOutcome, string> = {
  running: "Running",
  needsReview: "Needs review",
  completed: "Completed",
  warnings: "Completed with warnings",
  error: "Failed",
  abandoned: "Abandoned",
};

/** One Filter choice: "status:error", "trigger:manual", "by:Dora". */
const filterKeysOf = (run: RunRecord, now: number) => [
  `status:${outcomeOf(run, now)}`,
  `trigger:${run.trigger.kind}`,
  ...(run.trigger.kind === "manual" ? [`by:${run.trigger.by}`] : []),
];

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

/**
 * Takes for the runs table. P1 with Align is the default (Aakarsh's pick on inbox history-table, 5 Nov 15:57);
 * `?runspage=before` shows the table as it was (10 rows, then "Show N older runs"), and p2–p4 stay as takes.
 * 5 Nov, Aakarsh: the table's left edge sat 48 px in from the title, and "Show more" showed with room to spare.
 * - `?runsalign=1`: the table bleeds to the page padding, so the first column's text lines up with "Runs" and the
 *   first status chip. Every `?runspage` take includes it.
 * - `?runspage=p1`: rows fill the height the page has, up to 25; then a quiet "Show all N runs" row loads the rest
 *   in place. The header stays put as the list scrolls.
 * - `p2`: the same fill, then "Show 25 more" with "25 of 140", until all show.
 * - `p3`: a pager, 25 a page, "1–25 of 140 ‹ ›" at the bottom right.
 * - `p4`: 25 rows (past the fold), scrolling inside the page; 25 more load as you near the end; no button.
 */
type RunsPage = "none" | "p1" | "p2" | "p3" | "p4";

const statusTake = runStatusTake();

const runsPage: RunsPage = (() => {
  const value = new URLSearchParams(globalThis.location.search).get("runspage");
  if (value === "before") {
    return "none";
  }
  return value === "p2" || value === "p3" || value === "p4" ? value : "p1";
})();

const runsAligned =
  runsPage !== "none" ||
  new URLSearchParams(globalThis.location.search).get("runsalign") === "1";

const pageSize = 25;
const rowHeight = 48;
const headerHeight = 32;
const footerHeight = 40;

const footerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "3",
  height: "[40px]",
  paddingX: "6",
  textStyle: "sm",
  color: "neutral.fg.muted",
  fontVariantNumeric: "tabular-nums",
});

const footerLinkStyle = css({
  cursor: "pointer",
  color: "neutral.fg.body",
  _hover: { textDecoration: "underline", textUnderlineOffset: "[2px]" },
});

/** The paging takes keep the header row in view as the list scrolls (−24 px: above the page's top padding). */
const stickyHeadStyle = css({
  "& th": { position: "sticky", top: "[-24px]", zIndex: "[1]" },
});

const RunsTable = ({ history }: { history: HistoryValue }) => {
  const { runs, now } = history;
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [older, setOlder] = useState(false);
  const [extraRows, setExtraRows] = useState(0);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ key: SortKey; flipped: boolean }>({
    key: "started",
    flipped: false,
  });
  const [filters, setFilters] = useState<string[]>([]);
  const [chips, setChips] = useState<RunFilterChip[]>(savedChips);
  const [savedToast, setSavedToast] = useState(false);
  const applied = oldLogsFilter ? filters.length : appliedChips(chips);
  // How many rows fit in the height the page has, with and without the footer row under them.
  const [fits, setFits] = useState({ bare: pageSize, withFooter: pageSize });
  const scrollRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  useLayoutEffect(() => {
    const box = scrollRef.current;
    const table = tableRef.current;
    if (runsPage === "none" || !box || !table) {
      return;
    }
    const measure = () => {
      const top =
        table.getBoundingClientRect().top -
        box.getBoundingClientRect().top +
        box.scrollTop;
      const free = box.clientHeight - top - headerHeight - 32;
      setFits({
        bare: Math.max(1, Math.floor(free / rowHeight)),
        withFooter: Math.max(1, Math.floor((free - footerHeight) / rowHeight)),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);
  const counts = (value: Tab) =>
    value === "all"
      ? runs.length
      : runs.filter((run) => tabOf[outcomeOf(run, now)] === value).length;
  // Within a group a run matches any picked choice; across groups it matches every group with a pick.
  const filterGroups = ["status", "trigger", "by"].map((group) =>
    filters.filter((key) => key.startsWith(`${group}:`)),
  );
  const passesFilters = (run: RunRecord) => {
    const keys = filterKeysOf(run, now);
    return filterGroups.every(
      (picked) =>
        picked.length === 0 || picked.some((key) => keys.includes(key)),
    );
  };
  const sortValue = (run: RunRecord) =>
    sort.key === "started"
      ? run.id
      : sort.key === "duration"
        ? durationSeconds(run, now)
        : -statusRank[outcomeOf(run, now)];
  const matching = runs
    .filter(
      (run) =>
        (tab === "all" || tabOf[outcomeOf(run, now)] === tab) &&
        (oldLogsFilter ? passesFilters(run) : passesChips(chips, run, now)) &&
        `Run ${run.id} ${run.when} ${triggerLabel(run).row}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
    )
    // Newest, longest or failed first; a tie keeps the newest run on top.
    .toSorted(
      (a, b) =>
        (sortValue(b) - sortValue(a)) * (sort.flipped ? -1 : 1) || b.id - a.id,
    );
  const toggleFilter = (key: string) =>
    setFilters((current) =>
      current.includes(key)
        ? current.filter((picked) => picked !== key)
        : [...current, key],
    );
  // Only choices some run has, so no group is ever empty.
  const choices = (
    group: string,
    label: (value: string) => string,
  ): { id: string; text: string }[] =>
    [
      ...new Set(
        runs.flatMap((run) =>
          filterKeysOf(run, now).filter((key) => key.startsWith(`${group}:`)),
        ),
      ),
    ].map((key) => ({ id: key, text: label(key.slice(group.length + 1)) }));
  const filterItems = [
    {
      id: "status",
      label: "Status",
      items: choices(
        "status",
        (value) => statusFilterLabel[value as RunOutcome],
      ).toSorted(
        (a, b) =>
          statusRank[a.id.slice(7) as RunOutcome] -
          statusRank[b.id.slice(7) as RunOutcome],
      ),
    },
    {
      id: "trigger",
      label: "Trigger",
      items: choices("trigger", (value) =>
        value === "manual" ? "Manual" : "Schedule",
      ),
    },
    { id: "by", label: "Started by", items: choices("by", (value) => value) },
  ]
    .filter((group) => group.items.length > 0)
    .map((group) => ({
      ...group,
      items: group.items.map((item) => ({
        ...item,
        selected: filters.includes(item.id),
        selectedStyle: "checkbox" as const,
        keepOpenOnSelect: true,
        onClick: () => toggleFilter(item.id),
      })),
    }));
  const sortItems = [
    {
      id: "sort-by",
      label: "Sort by",
      items: (Object.keys(sortOrders) as SortKey[]).map((key) => ({
        id: `sort:${key}`,
        text: sortOrders[key].label,
        selected: sort.key === key,
        selectedStyle: "tick" as const,
        keepOpenOnSelect: true,
        onClick: () => setSort({ key, flipped: false }),
      })),
    },
    {
      id: "order",
      label: "Order",
      items: sortOrders[sort.key].orders.map((text, index) => ({
        id: `order:${index}`,
        text,
        selected: sort.flipped === (index === 1),
        selectedStyle: "tick" as const,
        keepOpenOnSelect: true,
        onClick: () =>
          setSort((current) => ({ ...current, flipped: index === 1 })),
      })),
    },
  ];
  const sorted = sort.key !== "started" || sort.flipped;
  const total = matching.length;
  const allFit = total <= fits.bare;
  const fill = Math.min(pageSize, fits.withFooter);
  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);
  const currentPage = Math.min(page, lastPage);
  const shownCount =
    runsPage === "none"
      ? older
        ? total
        : Math.min(10, total)
      : runsPage === "p3"
        ? total
        : allFit || (runsPage === "p1" && older)
          ? total
          : // p4 starts past the fold, so the list can scroll and fetch the next 25.
            Math.min(
              total,
              (runsPage === "p4" ? Math.max(fill, pageSize) : fill) + extraRows,
            );
  const shown =
    runsPage === "p3"
      ? matching.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
      : matching.slice(0, shownCount);
  const onScroll = (event: React.UIEvent<HTMLDivElement>) => {
    if (runsPage !== "p4" || shownCount >= total) {
      return;
    }
    const box = event.currentTarget;
    if (box.scrollTop + box.clientHeight >= box.scrollHeight - rowHeight * 2) {
      setExtraRows((current) => current + pageSize);
    }
  };
  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      data-runs-page={runsPage}
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
        {oldRunsSort ? (
          <>
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
          </>
        ) : (
          <>
            <Menu
              position="bottom-end"
              items={sortItems}
              trigger={
                <Button
                  size="sm"
                  variant="ghost"
                  tone="neutral"
                  iconName={sort.flipped ? "sortUp" : "sortDown"}
                  className={cx(rowButtonStyle, sorted && rowButtonActiveStyle)}
                >
                  {sorted ? sortOrders[sort.key].label : "Sort"}
                </Button>
              }
            />
            {oldLogsFilter ? (
              <Menu
                position="bottom-end"
                items={
                  filters.length > 0
                    ? [
                        ...filterItems,
                        {
                          id: "clear",
                          label: "",
                          items: [
                            {
                              id: "clear-filters",
                              text: "Clear filters",
                              onClick: () => setFilters([]),
                            },
                          ],
                        },
                      ]
                    : filterItems
                }
                trigger={
                  <Button
                    size="sm"
                    variant="ghost"
                    tone="neutral"
                    iconName="filter"
                    className={cx(
                      rowButtonStyle,
                      filters.length > 0 && rowButtonActiveStyle,
                    )}
                  >
                    {filters.length > 0
                      ? `Filter · ${filters.length}`
                      : "Filter"}
                  </Button>
                }
              />
            ) : (
              <FilterByMenu
                onPick={(property) => setChips(newChip(chips, property))}
                trigger={
                  <Button
                    size="sm"
                    variant="ghost"
                    tone="neutral"
                    iconName="filter"
                    className={cx(
                      rowButtonStyle,
                      applied > 0 && rowButtonActiveStyle,
                    )}
                  >
                    {applied > 0 ? `Filter · ${applied}` : "Filter"}
                  </Button>
                }
              />
            )}
          </>
        )}
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
      {!oldRunsSort && !oldLogsFilter && chips.length > 0 ? (
        <RunsFilterRibbon
          chips={chips}
          onChips={setChips}
          runs={runs}
          now={now}
          onSave={() => {
            savedChips = chips;
            setSavedToast(true);
          }}
        />
      ) : null}
      {savedToast ? (
        <Toast text="Filters saved" onDone={() => setSavedToast(false)} />
      ) : null}
      <div
        className={
          runsAligned ? css({ marginX: "[-24px]" }) : css({ paddingX: "6" })
        }
      >
        <table
          ref={tableRef}
          className={cx(tableStyle, runsPage !== "none" && stickyHeadStyle)}
        >
          <thead>
            <tr>
              <th>Run</th>
              <th>Status</th>
              {statusTake === "c" ? (
                <th className={css({ textAlign: "right" })}>Items</th>
              ) : null}
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
                  {statusTake ? (
                    <RunStatusTakeCell run={run} now={now} take={statusTake} />
                  ) : (
                    <StatusCell {...statusCellOf(run, now)} />
                  )}
                </td>
                {statusTake === "c" ? (
                  <td>
                    <RunItemsCell run={run} now={now} />
                  </td>
                ) : null}
                <td>
                  {run.trigger.kind === "manual"
                    ? `Manual · ${run.trigger.by}`
                    : "Schedule · monthly"}
                </td>
                <td>
                  {/* What the run produced; each count opens the outputs viewer (`run-outputs.tsx`). */}
                  <RunOutputsCell run={run} now={now} />
                </td>
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
            {shown.length === 0 && applied > 0 ? (
              <tr data-runs-empty>
                <td
                  colSpan={statusTake === "c" ? 7 : 6}
                  className={css({ color: "neutral.fg.muted" })}
                >
                  No runs match these filters
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        {runsPage === "p1" && !allFit && !older ? (
          <div className={footerStyle} data-runs-footer>
            <button
              type="button"
              className={footerLinkStyle}
              onClick={() => setOlder(true)}
            >
              Show all {total} runs
            </button>
          </div>
        ) : null}
        {runsPage === "p2" && shownCount < total ? (
          <div className={footerStyle} data-runs-footer>
            <button
              type="button"
              className={footerLinkStyle}
              onClick={() => setExtraRows((current) => current + pageSize)}
            >
              Show {Math.min(pageSize, total - shownCount)} more
            </button>
            <span>
              {shownCount} of {total}
            </span>
          </div>
        ) : null}
        {runsPage === "p3" && total > pageSize ? (
          <div
            className={cx(footerStyle, css({ justifyContent: "flex-end" }))}
            data-runs-footer
          >
            <span>
              {currentPage * pageSize + 1}–
              {Math.min(total, (currentPage + 1) * pageSize)} of {total}
            </span>
            <Button
              size="xs"
              variant="ghost"
              tone="neutral"
              iconName="chevronLeft"
              aria-label="Newer runs"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            />
            <Button
              size="xs"
              variant="ghost"
              tone="neutral"
              iconName="chevronRight"
              aria-label="Older runs"
              disabled={currentPage === lastPage}
              onClick={() => setPage(currentPage + 1)}
            />
          </div>
        ) : null}
        {runsPage === "none" && matching.length > shown.length ? (
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

/**
 * S4 (picked 4 Nov, inbox history-stats): what you act on, as label–value rows; the counts live in the chart.
 * Short labels, regular weight, Attio's 32 px rows. "Average run time" (5 Nov, was "Typical run"); the value is
 * still the median of completed runs, and its tooltip says so.
 */
const statRowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
  height: "[32px]",
  textStyle: "sm",
});

const statLabelStyle = css({ color: "neutral.fg.muted" });

const statValueStyle = css({
  color: "neutral.fg.body",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
});

const statLinkStyle = css({
  cursor: "pointer",
  borderRadius: "sm",
  _hover: { textDecoration: "underline", textUnderlineOffset: "[2px]" },
});

/**
 * The stats as tiles, for comparison with S4 (5 Nov, Aakarsh: "show a mock of this with the cards too"). Read from
 * ?stats=tiles1|tiles2 only; S4 rows are the default. M2's tile sizes (12 px padding, lg radius, 84 px min height,
 * lg value over an xs label) with a faint neutral border.
 * - `tiles1`: a 2×2 grid. `tiles2`: the four stacked.
 */
type StatsTake = "rows" | "tiles1" | "tiles2";

const statsTake: StatsTake = (() => {
  const value = new URLSearchParams(globalThis.location.search).get("stats");
  return value === "tiles1" || value === "tiles2" ? value : "rows";
})();

const statTileStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  minWidth: "[0]",
  minHeight: "[84px]",
  padding: "3",
  borderRadius: "lg",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  backgroundColor: "neutral.bgSolid.surface",
});

const statTileValueStyle = css({
  textStyle: "lg",
  color: "neutral.fg.heading",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  textAlign: "left",
  maxWidth: "[100%]",
});

type Stat = {
  label: string;
  text: string;
  color?: string;
  onOpen?: () => void;
  tooltip?: string;
};

const StatValue = ({ stat, className }: { stat: Stat; className: string }) => {
  const value = stat.onOpen ? (
    <button
      type="button"
      className={cx(className, statLinkStyle)}
      style={stat.color ? { color: stat.color } : undefined}
      onClick={stat.onOpen}
      data-stat-value
    >
      {stat.text}
    </button>
  ) : (
    <span
      className={className}
      style={stat.color ? { color: stat.color } : undefined}
      data-stat-value
    >
      {stat.text}
    </span>
  );
  return stat.tooltip ? (
    <Tooltip content={stat.tooltip} openDelay="fast">
      {value}
    </Tooltip>
  ) : (
    value
  );
};

const StatRow = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div className={statRowStyle} data-stat-row={label}>
    <span className={statLabelStyle}>{label}</span>
    {children}
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
  completed: chartColor.done,
  warnings: chartColor.warnings,
  error: chartColor.failed,
  abandoned: chartColor.quiet,
  running: chartColor.running,
  needsReview: chartColor.review,
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

/** The smallest 1, 2 or 5 × 10ⁿ at or above `value`, so the y axis reads in round numbers. */
const niceStep = (value: number) => {
  const power = 10 ** Math.floor(Math.log10(Math.max(1, value)));
  const step = [1, 2, 5, 10].find((factor) => factor * power >= value) ?? 10;
  return step * power;
};

/**
 * Below this many runs in the period, the chart shows one square per run instead of count bars (Aakarsh, 4 Nov:
 * "under about 30"). Set to 8 so the seed's 30D (5 runs) shows squares while 6M (11) and 1Y (16) show bars; the
 * seed has 17 runs in all, so a threshold of 30 would show squares in every period.
 */
const squaresBelow = 8;

const squareStyle = css({
  width: "[8px]",
  height: "[8px]",
  borderRadius: "[2px]",
  cursor: "pointer",
  outlineOffset: "[1px]",
  "&[data-hovered]": { outline: "[1.5px solid var(--flows-sel-border)]" },
});

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

/** What is hovered (a bucket's bar or a run's square), its tooltip, and where that anchors: the centre and top. */
type ChartHover = { key: string; text: string; x: number; top: number };

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
  const squares =
    buckets.reduce((total, bucket) => total + bucket.runs.length, 0) <
    squaresBelow;
  const most = Math.max(1, ...buckets.map((bucket) => bucket.runs.length));
  // Y1 (inbox history-xaxis, picked 5 Nov): a fixed 28 px right gutter with faint lines at 0, one nice step and two
  // nice steps (0 / 100 / 200 for the hourly flow), the step taken from the data. Squares keep no y axis.
  const step = niceStep(most / 2);
  const max = squares ? most : step * 2;
  const ticks = [max, step, 0];
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
        // Squares: the plot shrinks to the tallest stack (10 px a run) plus 16 px, over the 20 px axis row.
        style={
          squares ? { height: 20 + max * 10 + 16, paddingTop: 16 } : undefined
        }
        className={css({
          position: "relative",
          height: "[192px]",
          display: "flex",
          gap: "[2px]",
          paddingRight: "[28px]",
          paddingTop: "[48px]",
        })}
        onMouseLeave={() => setHover(null)}
      >
        {hover ? (
          <div ref={tipRef} className={tipStyle} data-chart-tip>
            {hover.text}
          </div>
        ) : null}
        {/* No y axis for squares: each one is a run. */}
        {(squares ? [] : ticks).map((tick) => (
          <span
            key={`line-${tick}`}
            aria-hidden="true"
            className={css({
              position: "absolute",
              left: "[0]",
              right: "[28px]",
              height: "[1px]",
              backgroundColor: "neutral.a05",
              pointerEvents: "none",
            })}
            style={{ bottom: 20 + (tick / max) * chartHeight }}
          />
        ))}
        {(squares ? [] : ticks).map((tick) => (
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
            data-hovered={
              (!squares && hover?.key === bucket.label) || undefined
            }
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
              if (squares) {
                return;
              }
              const box = boxRef.current?.getBoundingClientRect();
              const stack = event.currentTarget.firstElementChild;
              const bar = stack?.getBoundingClientRect();
              if (!box || !bar) {
                return;
              }
              setHover(
                bucket.runs.length > 0
                  ? {
                      key: bucket.label,
                      text: tipText(bucket),
                      x: bar.left - box.left + bar.width / 2,
                      top: (bar.height > 0 ? bar.top : bar.bottom) - box.top,
                    }
                  : null,
              );
            }}
          >
            {squares ? (
              <div
                className={css({
                  display: "flex",
                  flexDirection: "column-reverse",
                  alignItems: "center",
                  gap: "[2px]",
                  width: "[100%]",
                })}
              >
                {bucket.runs.length === 0 ? (
                  <span
                    style={{
                      width: "100%",
                      height: 2,
                      backgroundColor: statusColor.track,
                      borderRadius: 1,
                    }}
                  />
                ) : (
                  // Oldest at the bottom.
                  bucket.runs
                    .toSorted((first, second) => first.id - second.id)
                    .map((run) => {
                      const outcome = outcomeOf(run, now);
                      return (
                        <button
                          key={run.id}
                          type="button"
                          className={squareStyle}
                          style={{ backgroundColor: chartColour[outcome] }}
                          aria-label={`Run ${run.id}`}
                          data-run-square={run.id}
                          data-hovered={
                            hover?.key === `run:${run.id}` || undefined
                          }
                          onMouseEnter={(event) => {
                            const box = boxRef.current?.getBoundingClientRect();
                            const square =
                              event.currentTarget.getBoundingClientRect();
                            if (!box) {
                              return;
                            }
                            setHover({
                              key: `run:${run.id}`,
                              text: `Run ${run.id} · ${run.when.replace(", ", " ")} · ${statusText(run, now)}`,
                              x: square.left - box.left + square.width / 2,
                              top: square.top - box.top,
                            });
                          }}
                          onClick={() => history.open(run.id)}
                        />
                      );
                    })
                )}
              </div>
            ) : null}
            <div
              hidden={squares}
              className={css({
                "&[hidden]": { display: "none" },
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
  // The run line is neutral, underlined on hover; the whole row opens the run, so no link blue.
  "&:hover [data-run-line]": { textDecorationLine: "underline" },
});

const Overview = ({ history }: { history: HistoryValue }) => {
  const { runs, now } = history;
  const failed = runs.filter((run) => {
    const outcome = outcomeOf(run, now);
    return outcome === "error" || outcome === "abandoned";
  });
  const lastFailure = failed[0];
  const withWarnings = runs.filter((run) => outcomeOf(run, now) === "warnings");
  const onlyWarning = withWarnings.length === 1 ? withWarnings[0] : undefined;
  const stats: Stat[] = [
    lastFailure
      ? {
          label: "Last failure",
          text: `Run ${lastFailure.id} · ${lastFailure.when}`,
          // The status marks' s85 red, not the strong text red: one soft red for failure (flows-colours O2).
          color: "var(--flows-failed-mark)",
          onOpen: () => history.open(lastFailure.id),
        }
      : { label: "Last failure", text: "None" },
    ...(withWarnings.length === 0
      ? []
      : [
          onlyWarning
            ? {
                label: "With warnings",
                text: `Run ${onlyWarning.id} · ${onlyWarning.when}`,
                color: "var(--flows-warnings-text)",
                onOpen: () => history.open(onlyWarning.id),
              }
            : { label: "With warnings", text: `${withWarnings.length} runs` },
        ]),
    { label: "Next run", text: "1 Dec, 09:00" },
    // MOCK: a fixed median until runs carry real durations.
    {
      label: "Average run time",
      text: "1m 44s",
      tooltip: "Median of completed runs",
    },
  ];
  const failures: { runId: number; title: string; line: string }[] =
    runs.flatMap((run) => {
      const outcome = outcomeOf(run, now);
      const facts = factsOf(run, now);
      if (outcome === "warnings") {
        return [
          {
            runId: run.id,
            title: `Fetch certificate · ${facts.failures.length} of ${facts.n} failed`,
            line: `Run ${run.id} · ${run.when} · completed, ${warningsText(facts.failures.length)}`,
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
            line: `Run ${run.id} · ${run.when} · failed`,
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
        {statsTake === "rows" ? (
          <div className={css({ display: "flex", flexDirection: "column" })}>
            {stats.map((stat) => (
              <StatRow key={stat.label} label={stat.label}>
                <StatValue stat={stat} className={statValueStyle} />
              </StatRow>
            ))}
          </div>
        ) : (
          <div
            data-stats-take={statsTake}
            className={css({ display: "grid", gap: "2" })}
            style={{
              gridTemplateColumns: statsTake === "tiles1" ? "1fr 1fr" : "1fr",
            }}
          >
            {stats.map((stat) => (
              <div
                key={stat.label}
                className={statTileStyle}
                data-stat-tile={stat.label}
              >
                <StatValue stat={stat} className={statTileValueStyle} />
                <span
                  className={css({
                    textStyle: "xs",
                    color: "neutral.fg.muted",
                  })}
                >
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        )}
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
          Recent failures and warnings
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
              <span
                className={css({ textStyle: "xs", color: "neutral.fg.muted" })}
                data-run-line
              >
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
    </aside>
  );
};

export const AllRuns = ({ history }: { history: HistoryValue }) => (
  <div className={pageStyle} data-all-runs>
    <RunsTable history={history} />
    <Overview history={history} />
  </div>
);
