import { Icon } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import type {
  FlowTriggerRow,
  FlowTriggerSort,
  FlowTriggerSortKey,
} from "./flow-trigger-rows";
import type { Sorter } from "@hashintel/ds-components";

export type TriggerColumn = Sorter<FlowTriggerSortKey> & {
  /** Its width. The column without one takes the rest. */
  className?: string;
};

/* The design's header fill has no semantic token, so the palette's is used. */
const table = css({
  width: "full",
  /* So that the columns keep their widths as tabs and filters change the rows. */
  tableLayout: "fixed",
  borderCollapse: "collapse",
  textStyle: "sm",
  "& th": {
    height: "8",
    px: "3",
    textAlign: "left",
    textStyle: "xs",
    fontWeight: "medium",
    color: "fg.body",
    bg: "neutral.s20",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "bd.subtle",
  },
  "& td": {
    height: "12",
    px: "3",
    py: "3",
    color: "fg.subtle",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "bd.subtle",
  },
  "& th:first-child, & td:first-child": { pl: "6" },
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
const flowName = css({ fontWeight: "medium", color: "fg.body" });
const trigger = css({ display: "flex", alignItems: "center", gap: "2" });
const triggerIcon = css({ display: "flex", flexShrink: "0" });
const truncated = css({ minWidth: "0", truncate: true });
const lines = css({ display: "flex", flexDirection: "column", minWidth: "0" });
const triggerName = css({ color: "fg.body" });

/** A column's header, which sorts the table by it, or flips the order when it already does. */
const SortHeader = ({
  column,
  sort,
  onSort,
}: {
  column: TriggerColumn;
  sort: FlowTriggerSort;
  onSort: (sort: FlowTriggerSort) => void;
}) => {
  const active = sort.key === column.sortKey;
  const ascending = active && sort.direction === "ASCENDING";

  return (
    <th
      className={column.className}
      aria-sort={active ? (ascending ? "ascending" : "descending") : undefined}
    >
      <button
        type="button"
        className={sortButton}
        data-active={active || undefined}
        onClick={() =>
          onSort({
            key: column.sortKey,
            direction: ascending ? "DESCENDING" : "ASCENDING",
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

/** The columns' cells follow `columns`, which leaves Web out when it's hidden. */
export const TriggersTable = ({
  rows,
  columns,
  sort,
  onSort,
}: {
  rows: FlowTriggerRow[];
  columns: TriggerColumn[];
  sort: FlowTriggerSort;
  onSort: (sort: FlowTriggerSort) => void;
}) => {
  const showWeb = columns.some(({ sortKey }) => sortKey === "web");

  return (
    <table className={table}>
      <thead>
        <tr>
          {columns.map((column) => (
            <SortHeader
              key={column.sortKey}
              column={column}
              sort={sort}
              onSort={onSort}
            />
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.entityId}>
            <td>
              <div
                className={cx(flowName, truncated)}
                title={row.flowName ?? undefined}
              >
                {row.flowName ?? "Unknown flow"}
              </div>
            </td>
            <td>
              <div className={trigger}>
                <span className={triggerIcon}>
                  <Icon name="calendarClock" size="sm" />
                </span>
                <span className={lines}>
                  <span className={cx(triggerName, truncated)} title={row.text}>
                    {row.text}
                  </span>
                  {row.scheduleText !== null && (
                    <span className={truncated} title={row.scheduleText}>
                      {row.scheduleText}
                    </span>
                  )}
                </span>
              </div>
            </td>
            {showWeb && (
              <td>
                <div className={truncated}>{row.webName}</div>
              </td>
            )}
            <td>
              <div className={lines}>
                <span>{row.on ? "On" : "Paused"}</span>
                {row.pauseNote !== null && <span>{row.pauseNote}</span>}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};
