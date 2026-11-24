import { useRouter } from "next/router";
import { useRef, useState } from "react";

import { Icon, SortMenu, Tabs, TextInput } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { RunFlowDialog } from "../shared/run-flow";
import { getRunBlocker } from "../shared/run-form";
import {
  formatDuration,
  formatEndTime,
  formatRunTime,
  getRunDuration,
} from "../shared/run-times";
import { tableStyle } from "../shared/table";
import {
  countRunsByTab,
  defaultRunSort,
  filterRuns,
  isInTab,
  matchesSearch,
  sortRuns,
} from "./run-list";
import { IdCell, StatusCell } from "./runs-table/run-cells";
import { AddRunFilter, RunFilterBar } from "./runs-table/run-filters";
import { RunMenu } from "./runs-table/run-menu";

import type { FlowRunner } from "../shared/run-flow";
import type { RunTab } from "../shared/run-state";
import type { RunFilters, RunRow, RunSort, RunSortKey } from "./run-list";
import type { RunFilterProperty } from "./runs-table/run-filters";
import type { EntityId } from "@blockprotocol/type-system";
import type { SortDirection, Sorter } from "@hashintel/ds-components";
import type { FlowInputValues } from "@local/hash-isomorphic-utils/flows/types";

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
  /** Its width, which holds the longest value it shows. The column without one takes the rest. */
  className?: string;
};

/**
 * The table's columns, in order, each also a choice in Sort. Times and durations start newest or longest first,
 * statuses with those that need a look, and text A to Z.
 */
const columns: Column[] = [
  {
    name: "ID",
    sortKey: "id",
    defaultDirection: "ASCENDING",
    className: css({ width: "[128px]" }),
  },
  {
    name: "Status",
    sortKey: "status",
    sortIcon: "generic",
    defaultDirection: "ASCENDING",
    className: css({ width: "[160px]" }),
  },
  {
    name: "Started",
    sortKey: "started",
    sortIcon: "numeric",
    defaultDirection: "DESCENDING",
    className: css({ width: "[176px]" }),
  },
  {
    name: "Ended",
    sortKey: "ended",
    sortIcon: "numeric",
    defaultDirection: "DESCENDING",
    className: css({ width: "[176px]" }),
  },
  { name: "Web", sortKey: "web", defaultDirection: "ASCENDING" },
  {
    name: "Duration",
    sortKey: "duration",
    sortIcon: "numeric",
    defaultDirection: "DESCENDING",
    align: "right",
    className: css({ width: "[120px]" }),
  },
];

const noFilters: RunFilters = { states: [], trigger: null };

const tabCount = css({ color: "fg.subtle" });
const search = css({ width: "[200px]" });
const menuColumn = css({ width: "[48px]" });
const filterBar = css({ mt: "3" });
const table = css({
  mt: "3",
  /* So that the columns keep their widths as tabs and filters change the rows. */
  tableLayout: "fixed",
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
/* A long shortname is cut short, rather than widening the column. */
const webCell = css({ overflow: "hidden", textOverflow: "ellipsis" });
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
      className={column.className}
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

/** The flow's runs, by status tab, with Sort, Filter and Search. A row opens its run, and its ⋮ re-runs it. */
export const RunsTable = ({
  rows,
  now,
  getRunPath,
  runner,
}: {
  rows: RunRow[];
  now: Date;
  getRunPath: (flowRunEntityId: EntityId) => string;
  runner: FlowRunner;
}) => {
  const router = useRouter();
  const [tab, setTab] = useState<RunTab>("all");
  const [sort, setSort] = useState<RunSort>(defaultRunSort);
  const [filters, setFilters] = useState<RunFilters>(noFilters);
  const [searchText, setSearchText] = useState("");
  /* The inputs of the run Re-run was picked for, which open its form. Kept here, as its row may leave the table. */
  const [rerunInputs, setRerunInputs] = useState<FlowInputValues | null>(null);
  /* The run Re-run was last picked for, so a slower read of an earlier pick can't replace its inputs. */
  const rerunPick = useRef<EntityId | null>(null);
  const [shownFilters, setShownFilters] = useState<RunFilterProperty[]>([]);
  const [addedFilter, setAddedFilter] = useState<RunFilterProperty | null>(
    null,
  );

  const rerunBlocker = getRunBlocker(runner.editorState);
  const filtered = filterRuns(rows, filters).filter((row) =>
    matchesSearch(row, searchText, now),
  );
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
              <span className={search}>
                <TextInput
                  size="sm"
                  value={searchText}
                  onChange={setSearchText}
                  placeholder="Search runs…"
                  aria-label="Search runs"
                  prefix={{ iconName: "search", variant: "subtle" }}
                  clearable
                />
              </span>
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
      <table className={cx(tableStyle, table)}>
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
            <th className={menuColumn} aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => {
            const runPath = getRunPath(row.flowRunEntityId);
            const duration = getRunDuration(row, now);
            const openRun = () => {
              void router.push(runPath, undefined, { shallow: true });
            };

            return (
              <tr
                key={row.flowRunEntityId}
                className={openableRow}
                onClick={(event) => {
                  /*
                   * A click with a modifier opens the run in a new tab, as one on the ID's link does. It's checked
                   * first, as Shift-click extends the selection and the others leave it in place.
                   */
                  if (event.metaKey || event.ctrlKey || event.shiftKey) {
                    window.open(runPath, "_blank", "noopener");
                    return;
                  }

                  /* A click that ends selecting text isn't a click on the row. */
                  if (window.getSelection()?.toString()) {
                    return;
                  }

                  openRun();
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
                <td className={cx(muted, webCell)}>
                  {row.webShortname ? `@${row.webShortname}` : "–"}
                </td>
                <td data-align="right">
                  {duration === null ? (
                    <span className={muted}>–</span>
                  ) : (
                    formatDuration(duration)
                  )}
                </td>
                <td>
                  <span
                    role="presentation"
                    /* So the menu doesn't open the run. */
                    onClick={(event) => event.stopPropagation()}
                  >
                    <RunMenu
                      row={row}
                      rerunBlocker={rerunBlocker}
                      onOpen={openRun}
                      onRerunPick={() => {
                        rerunPick.current = row.flowRunEntityId;
                      }}
                      onRerun={(flowInputs) => {
                        if (rerunPick.current === row.flowRunEntityId) {
                          setRerunInputs(flowInputs);
                        }
                      }}
                    />
                  </span>
                </td>
              </tr>
            );
          })}
          {shown.length === 0 && (
            <tr>
              <td colSpan={columns.length + 1} className={noMatches}>
                No runs match
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {rerunInputs && (
        <RunFlowDialog
          webId={runner.webId}
          name={runner.editorState.flowDefinition.name}
          inputs={runner.editorState.flowDefinition.inputs}
          ranInputs={rerunInputs}
          saveRefusedReason={runner.saveRefusedReason}
          onRun={runner.onRun}
          onClose={() => setRerunInputs(null)}
        />
      )}
    </>
  );
};
