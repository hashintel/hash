import { Fragment } from "react";

import { EllipsisMenu, Icon, Toggle } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import type {
  FlowTriggerRow,
  FlowTriggerSort,
  FlowTriggerSortKey,
} from "./flow-trigger-rows";
import type { Sorter } from "@hashintel/ds-components";
import type { ReactNode } from "react";

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
  /* A form row's cell holds the form, which sets its own padding. */
  "& td[data-form]": { height: "auto", p: "0" },
});
const triggerRow = css({
  cursor: "pointer",
  /* The designed hover fill is the header's, which no semantic token has. */
  _hover: { bg: "neutral.s20" },
});
/* The row being edited, above its form. */
const openRow = css({ bg: "neutral.s20" });
/* The design's lighter fill for the trigger being added. */
const newTriggerRow = css({ bg: "neutral.s10" });
const newTriggerText = css({ color: "fg.subtle" });
/* Shown on the row's hover or focus, as in the design, and while its menu is open. */
const rowActions = css({
  display: "flex",
  justifyContent: "flex-end",
  opacity: "0",
  "tr:hover &": { opacity: "1" },
  "tr:focus-within &": { opacity: "1" },
  "&:has([aria-expanded=true])": { opacity: "1" },
});
const actionsColumn = css({ width: "[56px]" });
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

/**
 * The columns' cells follow `columns`, which leaves Web out when it's hidden. Each row has a menu to edit, pause or
 * resume, and delete it, and a click on it edits it too, in a form under it. The form for adding a trigger, when open,
 * is at the top.
 */
export const TriggersTable = ({
  rows,
  columns,
  sort,
  onSort,
  newTriggerForm,
  editing,
  onEdit,
  onCloseEdit,
  switchingEntityId,
  onSetOn,
  onDelete,
}: {
  rows: FlowTriggerRow[];
  columns: TriggerColumn[];
  sort: FlowTriggerSort;
  onSort: (sort: FlowTriggerSort) => void;
  /** The form for adding a trigger, if it's open. */
  newTriggerForm: ReactNode | null;
  /** The trigger being edited, with its form, if one is. */
  editing: { entityId: FlowTriggerRow["entityId"]; form: ReactNode } | null;
  onEdit: (row: FlowTriggerRow) => void;
  onCloseEdit: () => void;
  /** The trigger being paused or resumed, which can't be again until it is. */
  switchingEntityId: FlowTriggerRow["entityId"] | null;
  /** Resumes a paused trigger, or pauses one that's on. */
  onSetOn: (row: FlowTriggerRow, on: boolean) => void;
  onDelete: (row: FlowTriggerRow) => void;
}) => {
  const showWeb = columns.some(({ sortKey }) => sortKey === "web");
  /* With the actions column. */
  const columnCount = columns.length + 1;

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
          <th className={actionsColumn} aria-label="Actions" />
        </tr>
      </thead>
      <tbody>
        {newTriggerForm !== null && (
          <>
            <tr className={newTriggerRow}>
              <td colSpan={columnCount}>
                <div className={trigger}>
                  <span className={triggerIcon}>
                    <Icon name="calendarClock" size="sm" />
                  </span>
                  <span className={newTriggerText}>New schedule</span>
                </div>
              </td>
            </tr>
            <tr>
              <td colSpan={columnCount} data-form="">
                {newTriggerForm}
              </td>
            </tr>
          </>
        )}
        {rows.map((row) => {
          const isEditing = editing?.entityId === row.entityId;
          const switching = switchingEntityId === row.entityId;

          return (
            <Fragment key={row.entityId}>
              <tr
                className={cx(triggerRow, isEditing && openRow)}
                onClick={() => (isEditing ? onCloseEdit() : onEdit(row))}
              >
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
                      <span
                        className={cx(triggerName, truncated)}
                        title={row.text}
                      >
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
                  {isEditing ? (
                    /* Not the row's click, which would close the form. */
                    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
                    <div onClick={(event) => event.stopPropagation()}>
                      <Toggle
                        size="sm"
                        value={row.on}
                        disabled={switching}
                        aria-label="On"
                        onChange={(on) => onSetOn(row, on)}
                      />
                    </div>
                  ) : (
                    <div className={lines}>
                      <span>{row.on ? "On" : "Paused"}</span>
                      {row.pauseNote !== null && <span>{row.pauseNote}</span>}
                    </div>
                  )}
                </td>
                <td>
                  {/* Not the row's click, which would open or close its form. */}
                  {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
                  <div
                    className={rowActions}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <EllipsisMenu
                      size="xs"
                      items={[
                        {
                          id: "edit",
                          text: "Edit",
                          onClick: () => onEdit(row),
                        },
                        row.on
                          ? {
                              id: "pause",
                              text: "Pause",
                              disabled: switching,
                              onClick: () => onSetOn(row, false),
                            }
                          : {
                              id: "resume",
                              text: "Resume",
                              disabled: switching,
                              onClick: () => onSetOn(row, true),
                            },
                        {
                          id: "delete",
                          text: "Delete",
                          onClick: () => onDelete(row),
                        },
                      ]}
                    />
                  </div>
                </td>
              </tr>
              {isEditing && (
                <tr>
                  <td colSpan={columnCount} data-form="">
                    {editing.form}
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
};
