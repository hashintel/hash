import { flexRender, type Table } from "@tanstack/react-table";

import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import type { ReactNode } from "react";

/**
 * Panda-styled presentation wrapper around a `@tanstack/react-table` instance
 * (C4). The caller owns columns/data/sorting/filtering (`useReactTable`); this
 * renders the markup with C3 tokens + sortable-header affordances. Replaces the
 * hand-rolled table chrome in `data-table-section.tsx`.
 */
interface DataTableProps<T> {
  table: Table<T>;
  /** Shown when there are no rows. */
  emptyState?: ReactNode;
  className?: string;
}

const tableStyles = css({
  width: "full",
  borderCollapse: "collapse",
  textStyle: "sm",
  lineHeight: "normal",
});

const thStyles = css({
  paddingX: "3",
  paddingY: "2",
  textAlign: "left",
  textStyle: "xs",
  fontWeight: "medium",
  color: "fg.muted",
  whiteSpace: "nowrap",
  borderBottomWidth: "1px",
  borderBottomStyle: "solid",
  borderBottomColor: "bd.subtle",
});

const sortableStyles = css({
  cursor: "pointer",
  userSelect: "none",
  _hover: { color: "fg.body" },
});

const thInnerStyles = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
});

const sortIconStyles = css({ color: "fg.muted" });

const tdStyles = css({
  paddingX: "3",
  paddingY: "1.5",
  color: "fg.body",
  borderBottomWidth: "1px",
  borderBottomStyle: "solid",
  borderBottomColor: "bd.subtle",
});

const rowStyles = css({
  transition: "colors",
  _hover: { bg: "bg.subtle" },
});

const emptyStyles = css({
  paddingX: "3",
  paddingY: "6",
  textAlign: "center",
  textStyle: "sm",
  color: "fg.subtle",
});

export const DataTable = <T,>({
  table,
  emptyState,
  className,
}: DataTableProps<T>) => {
  const rows = table.getRowModel().rows;
  const columnCount = table.getAllLeafColumns().length;

  return (
    <table className={className ? `${tableStyles} ${className}` : tableStyles}>
      <thead>
        {table.getHeaderGroups().map((headerGroup) => (
          <tr key={headerGroup.id}>
            {headerGroup.headers.map((header) => {
              const canSort = header.column.getCanSort();
              const sorted = header.column.getIsSorted();
              const toggleSort = header.column.getToggleSortingHandler();
              return (
                <th
                  key={header.id}
                  className={
                    canSort ? `${thStyles} ${sortableStyles}` : thStyles
                  }
                  onClick={canSort ? toggleSort : undefined}
                  onKeyDown={canSort ? toggleSort : undefined}
                  role={canSort ? "button" : undefined}
                  tabIndex={canSort ? 0 : undefined}
                  aria-sort={
                    sorted === "asc"
                      ? "ascending"
                      : sorted === "desc"
                        ? "descending"
                        : undefined
                  }
                >
                  {header.isPlaceholder ? null : (
                    <span className={thInnerStyles}>
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                      {sorted === "asc" && (
                        <Icon
                          name="sortUp"
                          size="sm"
                          className={sortIconStyles}
                        />
                      )}
                      {sorted === "desc" && (
                        <Icon
                          name="sortDown"
                          size="sm"
                          className={sortIconStyles}
                        />
                      )}
                    </span>
                  )}
                </th>
              );
            })}
          </tr>
        ))}
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={columnCount} className={emptyStyles}>
              {emptyState ?? "No data"}
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={row.id} className={rowStyles}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className={tdStyles}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
};
