import { useRouter } from "next/router";
import { useState } from "react";

import { Icon, SortMenu, Tabs } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  countRunsByTab,
  defaultRunSort,
  filterRuns,
  getRunDuration,
  isInTab,
  sortRuns,
} from "./run-list";
import { formatDuration, formatEndTime, formatRunTime } from "./run-times";
import { IdCell, StatusCell } from "./runs-table/run-cells";
import { AddRunFilter, RunFilterBar } from "./runs-table/run-filters";

import type { RunFilters, RunRow, RunSort, RunSortKey } from "./run-list";
import type { RunTab } from "./run-state";
import type { RunFilterProperty } from "./runs-table/run-filters";
import type { EntityId } from "@blockprotocol/type-system";
import type { SortDirection, Sorter } from "@hashintel/ds-components";

const tabs: { id: RunTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "running", label: "Running" },
  { id: "completed", label: "Done" },
  { id: "failed", label: "Failed" },
];

type Column = Sorter<RunSortKey> & {
  /** The direction the column sorts in when picked, in its header or in Sort. */
  defaultDirection: SortDirection;
  align?: "right";
};

/**
 * The table's columns, in order, each also a choice in Sort. Times and durations start newest or longest first,
 * statuses with those that need a look, and text A to Z.
 */
const columns: Column[] = [
  { name: "ID", sortKey: "id", defaultDirection: "ASCENDING" },
  {
    name: "Status",
    sortKey: "status",
    sortIcon: "generic",
    defaultDirection: "ASCENDING",
  },
  {
    name: "Started",
    sortKey: "started",
    sortIcon: "numeric",
    defaultDirection: "DESCENDING",
  },
  {
    name: "Ended",
    sortKey: "ended",
    sortIcon: "numeric",
    defaultDirection: "DESCENDING",
  },
  { name: "Web", sortKey: "web", defaultDirection: "ASCENDING" },
  {
    name: "Duration",
    sortKey: "duration",
    sortIcon: "numeric",
    defaultDirection: "DESCENDING",
    align: "right",
  },
];

const noFilters: RunFilters = { states: [], trigger: null };

const tabCount = css({ color: "fg.subtle", ml: "1.5" });
const filterBar = css({ mt: "3" });
const table = css({
  width: "full",
  mt: "3",
  borderCollapse: "collapse",
  textStyle: "sm",
  "& th": {
    height: "8",
    px: "4",
    textAlign: "left",
    textStyle: "xs",
    fontWeight: "medium",
    color: "fg.muted",
    whiteSpace: "nowrap",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "bd.subtle",
  },
  "& td": {
    height: "12",
    px: "4",
    color: "fg.body",
    whiteSpace: "nowrap",
    fontVariantNumeric: "tabular-nums",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "bd.subtle",
  },
  "& [data-align=right]": { textAlign: "right" },
});
const openableRow = css({
  cursor: "pointer",
  _hover: { backgroundColor: "bg.subtle" },
});
const sortButton = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  cursor: "pointer",
  "& [data-sort-arrow]": { opacity: "0" },
  "&:hover [data-sort-arrow]": { opacity: "0.5" },
  "&[data-active]": { color: "fg.heading" },
  "&[data-active] [data-sort-arrow]": { opacity: "1" },
});
const muted = css({ color: "fg.subtle" });
const noMatches = css({ color: "fg.muted" });

/** A column's header, which sorts the table by it, or flips the order when it already does. */
const SortHeader = ({
  column,
  sort,
  onSort,
}: {
  column: Column;
  sort: RunSort;
  onSort: (sort: RunSort) => void;
}) => {
  const active = sort.key === column.sortKey;
  const ascending = active && sort.direction === "ASCENDING";

  return (
    <th
      data-align={column.align}
      aria-sort={active ? (ascending ? "ascending" : "descending") : undefined}
    >
      <button
        type="button"
        className={sortButton}
        data-active={active || undefined}
        onClick={() =>
          onSort({
            key: column.sortKey,
            direction: active
              ? ascending
                ? "DESCENDING"
                : "ASCENDING"
              : column.defaultDirection,
          })
        }
      >
        {column.name}
        <span data-sort-arrow>
          <Icon name={ascending ? "sortUp" : "sortDown"} size="xs" />
        </span>
      </button>
    </th>
  );
};

/** The flow's runs, by status tab, with Sort and Filter. A row opens its run. */
export const RunsTable = ({
  rows,
  now,
  getRunPath,
}: {
  rows: RunRow[];
  now: Date;
  getRunPath: (flowRunEntityId: EntityId) => string;
}) => {
  const router = useRouter();
  const [tab, setTab] = useState<RunTab>("all");
  const [sort, setSort] = useState<RunSort>(defaultRunSort);
  const [filters, setFilters] = useState<RunFilters>(noFilters);
  const [shownFilters, setShownFilters] = useState<RunFilterProperty[]>([]);
  const [addedFilter, setAddedFilter] = useState<RunFilterProperty | null>(
    null,
  );

  const filtered = filterRuns(rows, filters);
  const counts = countRunsByTab(filtered);
  const shown = sortRuns(
    filtered.filter((row) => isInTab(row, tab)),
    sort,
    now,
  );
  const appliedFilterCount =
    (filters.states.length > 0 ? 1 : 0) + (filters.trigger ? 1 : 0);

  return (
    <>
      <Tabs value={tab} onChange={setTab} variant="pill" size="sm">
        <Tabs.TabList
          items={tabs.map(({ id, label }) => ({
            id,
            children: (
              <>
                {label}
                <span className={tabCount}>{counts[id]}</span>
              </>
            ),
          }))}
          actions={
            <>
              <SortMenu
                items={columns}
                value={{ sortKey: sort.key, direction: sort.direction }}
                onChange={(key, direction) => setSort({ key, direction })}
                position="bottom-end"
              />
              <AddRunFilter
                shown={shownFilters}
                appliedCount={appliedFilterCount}
                onAdd={(property) => {
                  setShownFilters((current) => [...current, property]);
                  setAddedFilter(property);
                }}
              />
            </>
          }
        />
      </Tabs>
      {shownFilters.length > 0 && (
        <div className={filterBar}>
          <RunFilterBar
            shown={shownFilters}
            added={addedFilter}
            filters={filters}
            onChange={setFilters}
            onRemove={(property) => {
              setShownFilters((current) =>
                current.filter((each) => each !== property),
              );
              setFilters((current) =>
                property === "status"
                  ? { ...current, states: [] }
                  : { ...current, trigger: null },
              );
            }}
            onClear={() => {
              setShownFilters([]);
              setFilters(noFilters);
            }}
          />
        </div>
      )}
      <table className={table}>
        <thead>
          <tr>
            {columns.map((column) => (
              <SortHeader
                key={column.sortKey}
                column={column}
                sort={sort}
                onSort={setSort}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => {
            const runPath = getRunPath(row.flowRunEntityId);
            const duration = getRunDuration(row, now);

            return (
              <tr
                key={row.flowRunEntityId}
                className={openableRow}
                onClick={(event) => {
                  /* A click that ends selecting text isn't a click on the row. */
                  if (window.getSelection()?.toString()) {
                    return;
                  }

                  /* A click with a modifier opens the run in a new tab, as one on the ID's link does. */
                  if (event.metaKey || event.ctrlKey || event.shiftKey) {
                    window.open(runPath, "_blank", "noopener");
                    return;
                  }

                  void router.push(runPath, undefined, { shallow: true });
                }}
              >
                <td>
                  <IdCell row={row} href={runPath} />
                </td>
                <td>
                  <StatusCell state={row.state} />
                </td>
                <td>{formatRunTime(row.startedAt, now)}</td>
                <td>
                  {row.endedAt ? (
                    formatEndTime(row.endedAt, row.startedAt, now)
                  ) : (
                    <span className={muted}>–</span>
                  )}
                </td>
                <td className={muted}>
                  {row.webShortname ? `@${row.webShortname}` : "–"}
                </td>
                <td data-align="right">
                  {duration === null ? (
                    <span className={muted}>–</span>
                  ) : (
                    formatDuration(duration)
                  )}
                </td>
              </tr>
            );
          })}
          {shown.length === 0 && (
            <tr>
              <td colSpan={columns.length} className={noMatches}>
                No runs match
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
};
