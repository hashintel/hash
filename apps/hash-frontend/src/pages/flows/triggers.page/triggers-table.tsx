import { Icon } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import type {
  FlowTriggerColumn,
  FlowTriggerRow,
  FlowTriggerSort,
} from "./flow-trigger-rows";

const table = css({
  width: "full",
  /* So that the columns keep their widths while a filter narrows the rows. */
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
    /* No semantic token has the designed fill; `bgSolid.surface` barely shows on white. */
    bg: "neutral.s20",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    /* As the fill: `bd.subtle` is a shade darker than the designed line. */
    borderBottomColor: "neutral.s30",
  },
  "& td": {
    height: "12",
    px: "3",
    py: "3",
    color: "fg.subtle",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "neutral.s30",
  },
  "& th:first-child, & td:first-child": { pl: "6" },
});
const sortButton = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.5",
  cursor: "pointer",
  _hover: { color: "fg.heading" },
  _focusVisible: { color: "fg.heading" },
});
/* An unsorted column's caret shows on hover, as the direction a click sorts it. */
const sortCaret = css({ display: "inline-flex", opacity: "0" });
const sortCaretShown = css({ opacity: "1" });
const sortCaretOnHover = css({ "button:hover > &": { opacity: "1" } });
const flowName = css({ fontWeight: "medium", color: "fg.body" });
const trigger = css({ display: "flex", alignItems: "center", gap: "2" });
const triggerIcon = css({ display: "flex", flexShrink: "0" });
const truncated = css({ minWidth: "0", truncate: true });
const lines = css({ display: "flex", flexDirection: "column", minWidth: "0" });
const triggerName = css({ color: "fg.body" });
/* Trigger takes the rest. */
const flowColumn = css({ width: "[24%]" });
const webColumn = css({ width: "[12%]" });
const statusColumn = css({ width: "[18%]" });

const columnLabels: Record<FlowTriggerColumn, string> = {
  flow: "Flow",
  trigger: "Trigger",
  web: "Web",
  status: "Status",
};

const SortableHeader = ({
  column,
  sort,
  onSortChange,
  className,
}: {
  column: FlowTriggerColumn;
  sort: FlowTriggerSort;
  onSortChange: (sort: FlowTriggerSort) => void;
  className?: string;
}) => {
  const sorted = sort.column === column;
  const direction = sorted ? sort.direction : "asc";

  return (
    <th
      className={className}
      aria-sort={
        sorted
          ? sort.direction === "asc"
            ? "ascending"
            : "descending"
          : undefined
      }
    >
      <button
        type="button"
        className={sortButton}
        onClick={() =>
          onSortChange({
            column,
            direction: sorted && sort.direction === "asc" ? "desc" : "asc",
          })
        }
      >
        {columnLabels[column]}
        <span
          className={cx(sortCaret, sorted ? sortCaretShown : sortCaretOnHover)}
        >
          <Icon
            name={direction === "asc" ? "arrowUp" : "arrowDown"}
            size="xs"
          />
        </span>
      </button>
    </th>
  );
};

/** The triggers, read-only: each one's flow, when it runs, its web unless that's left out, and whether it's on. */
export const TriggersTable = ({
  rows,
  showWeb,
  sort,
  onSortChange,
}: {
  rows: FlowTriggerRow[];
  showWeb: boolean;
  sort: FlowTriggerSort;
  onSortChange: (sort: FlowTriggerSort) => void;
}) => {
  const headerProps = { sort, onSortChange };

  return (
    <table className={table}>
      <thead>
        <tr>
          <SortableHeader
            column="flow"
            className={flowColumn}
            {...headerProps}
          />
          <SortableHeader column="trigger" {...headerProps} />
          {showWeb && (
            <SortableHeader
              column="web"
              className={webColumn}
              {...headerProps}
            />
          )}
          <SortableHeader
            column="status"
            className={statusColumn}
            {...headerProps}
          />
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
