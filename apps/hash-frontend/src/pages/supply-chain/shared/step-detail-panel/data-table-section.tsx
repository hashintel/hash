import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type SortingState,
  type ColumnFiltersState,
  type ColumnDef,
  type FilterFn,
} from "@tanstack/react-table";
import {
  forwardRef,
  useState,
  useMemo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

import { Button, Icon, Tooltip } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { formatNumber, getUserLocale } from "../cost";
import { buildCsvContent, downloadCsv } from "../export-utils";
import { periodCutoffs } from "../period-trends";
import { trackSupplyChainInteraction } from "../telemetry";

import type { TimeRange } from "../time-range";
import type { DetailRows, DetailColumn } from "../types";

const modalLayer = css({
  position: "fixed",
  inset: "0",
  zIndex: "popover",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
});
const modalBackdrop = css({
  position: "absolute",
  inset: "0",
  bg: "neutral.a50",
});
const modalDialog = css({
  position: "relative",
  zIndex: "[10]",
  bg: "bgSolid.min",
  borderRadius: "xl",
  boxShadow: "2xl",
  width: "[calc(95vw-48px)]",
  maxWidth: "[1700px]",
  maxHeight: "[92vh]",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  mx: "6",
});
const modalHeader = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  px: "5",
  py: "3.5",
  borderBottomWidth: "1px",
  borderBottomStyle: "solid",
  borderBottomColor: "bd.subtle",
  flexShrink: "0",
});
const modalHeaderLeft = css({
  display: "flex",
  alignItems: "center",
  gap: "3",
});
const modalTitle = css({
  textStyle: "sm",
  fontWeight: "medium",
  color: "fg.heading",
});
const subtleText = css({ textStyle: "xs", color: "fg.subtle" });
const rowCountText = css({
  textStyle: "xs",
  color: "fg.subtle",
  fontVariantNumeric: "tabular-nums",
});
const modalHeaderRight = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
});
const filterBar = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  px: "5",
  py: "2",
  borderBottomWidth: "1px",
  borderBottomStyle: "solid",
  borderBottomColor: "bd.subtle",
  bg: "bg.surface",
  flexShrink: "0",
});
const filterBarLabel = css({
  textStyle: "xs",
  fontWeight: "medium",
  color: "fg.subtle",
});
const tableScroll = css({
  overflow: "auto",
  flex: "1",
  minHeight: "0",
  overscrollBehavior: "contain",
});
const tableEl = css({
  width: "full",
  textStyle: "xs",
  lineHeight: "normal",
  borderCollapse: "collapse",
});
const theadSticky = css({ position: "sticky", top: "0", zIndex: "[10]" });
const thStyles = css({
  px: "3",
  py: "2.5",
  borderBottomWidth: "1px",
  borderBottomStyle: "solid",
  borderBottomColor: "bd.subtle",
  bg: "bgSolid.surface",
  fontWeight: "medium",
  color: "fg.muted",
  whiteSpace: "nowrap",
  cursor: "pointer",
  userSelect: "none",
  transition: "colors",
  _hover: { bg: "bgSolid.subtle" },
});
const thRight = css({ textAlign: "right" });
const thInner = css({ display: "flex", alignItems: "center", gap: "1" });
const thInnerRight = css({ justifyContent: "flex-end" });
const sortIcon = css({ color: "fg.heading" });
const rowStyles = css({ transition: "colors", _hover: { bg: "bg.surface" } });
const tdStyles = css({
  px: "3",
  py: "1.5",
  borderBottomWidth: "1px",
  borderBottomStyle: "solid",
  borderBottomColor: "bd.subtle",
  color: "fg.body",
  whiteSpace: "nowrap",
});
const tdRight = css({ textAlign: "right", fontVariantNumeric: "tabular-nums" });
const emptyCell = css({
  px: "3",
  py: "8",
  textAlign: "center",
  color: "fg.subtle",
});
const chipStyles = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  borderRadius: "full",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  bg: "bgSolid.min",
  pl: "2.5",
  pr: "1.5",
  py: "1",
  textStyle: "xs",
  lineHeight: "none",
  color: "fg.body",
});
const chipClear = css({
  borderRadius: "full",
  p: "0.5",
  color: "fg.subtle",
  cursor: "pointer",
  _hover: { bg: "bg.subtle", color: "fg.heading" },
});
const headerUnit = css({ ml: "1", color: "fg.subtle", fontWeight: "normal" });
const headerDashed = css({
  borderBottomWidth: "1px",
  borderBottomStyle: "dashed",
  borderBottomColor: "bd.strong",
});
const headerBaseline = css({
  display: "inline-flex",
  alignItems: "baseline",
  gap: "0",
});
// Neutral/white trigger so the "Data" button matches the Status button in the
// slide-over header (Brief is the only coloured one).
const triggerButton = css({
  h: "7",
  borderColor: "bd.subtle",
  bg: "bgSolid.min",
  color: "fg.muted",
  _hover: { borderColor: "bd.strong", bg: "bg.subtle", color: "fg.heading" },
});

export interface DataTableFilters {
  periodRange?: TimeRange | null;
  periodLabel?: string | null;
  month?: string | null;
}

export interface DataTableSectionHandle {
  openWithFilters: (filters?: DataTableFilters) => void;
}

interface DataTableSectionProps {
  detailRows: DetailRows | null | undefined;
  stepId: string;
  label?: string;
  title?: string;
  filename?: string;
  dateColumnKey?: string | null;
  defaultFilters?: DataTableFilters;
}

type DateFilterValue = {
  periodRange?: TimeRange | null;
  month?: string | null;
};

function isDateValue(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }
  return /^\d{4}-\d{2}-\d{2}/.test(value);
}

function formatDate(value: string): string {
  const day = new Date(value);
  if (Number.isNaN(day.getTime())) {
    return value;
  }
  return day.toLocaleDateString(getUserLocale(), {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatCell(value: unknown): string {
  if (value == null) {
    return "–";
  }
  if (typeof value === "number") {
    return formatNumber(value, {
      maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
    });
  }
  if (typeof value === "string" && isDateValue(value)) {
    return formatDate(value);
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  if (
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    typeof value === "symbol"
  ) {
    return String(value);
  }
  return "";
}

function isNumericColumn(
  rows: Record<string, unknown>[],
  key: string,
): boolean {
  for (const row of rows) {
    const value = row[key];
    if (value != null && typeof value === "number") {
      return true;
    }
  }
  return false;
}

function isDateColumn(rows: Record<string, unknown>[], key: string): boolean {
  for (const row of rows) {
    const value = row[key];
    if (value != null && typeof value === "string" && isDateValue(value)) {
      return true;
    }
  }
  return false;
}

function hasDateFilters(filters: DataTableFilters): boolean {
  return Boolean(filters.periodRange ?? filters.month);
}

function filterValueFromFilters(filters: DataTableFilters): DateFilterValue {
  return {
    periodRange: filters.periodRange ?? null,
    month: filters.month ?? null,
  };
}

function formatMonth(value: string): string {
  const [year, month] = value.split("-");
  const day = new Date(Number(year), Number(month) - 1, 1);
  if (Number.isNaN(day.getTime())) {
    return value;
  }
  return day.toLocaleDateString(getUserLocale(), {
    month: "short",
    year: "numeric",
  });
}

function periodLabel(filters: DataTableFilters): string | null {
  if (!filters.periodRange) {
    return null;
  }
  if (filters.periodLabel) {
    return filters.periodLabel;
  }
  // The window spans the current period plus the prior comparison period (the
  // rows behind the period-on-period trend), so label both.
  if (filters.periodRange === "3m") {
    return "Last & previous 3 months";
  }
  if (filters.periodRange === "6m") {
    return "Last & previous 6 months";
  }
  return "Last & previous 12 months";
}

const dateFilterFn: FilterFn<Record<string, unknown>> = (
  row,
  columnId,
  filterValue,
) => {
  const filters = filterValue as DateFilterValue | undefined;
  if (!filters?.periodRange && !filters?.month) {
    return true;
  }

  const value = row.getValue(columnId);
  if (typeof value !== "string") {
    return true;
  }

  const rowMonth = value.slice(0, 7);
  if (filters.periodRange) {
    // Window back to the START of the comparison period (≈ 2× the range), not
    // just the current period: the table should expose every row behind the
    // visible stats AND the period-on-period trend, which compares the current
    // window against the equal-length window immediately before it.
    const cutoff = periodCutoffs(filters.periodRange).previousFrom;
    if (rowMonth < cutoff) {
      return false;
    }
  }
  if (filters.month && rowMonth !== filters.month) {
    return false;
  }
  return true;
};

const HeaderCell = ({ column }: { column: DetailColumn }) => {
  const unitSuffix = column.unit ? (
    <span className={headerUnit}>({column.unit})</span>
  ) : null;
  if (column.source_table && column.source_field) {
    return (
      <span className={headerBaseline}>
        <Tooltip
          content={`${column.source_table}.${column.source_field}`}
          position="top"
          openDelay="fast"
        >
          <span className={headerDashed}>{column.label}</span>
        </Tooltip>
        {unitSuffix}
      </span>
    );
  }
  return (
    <span>
      {column.label}
      {unitSuffix}
    </span>
  );
};
const makeHeaderRenderer = (column: DetailColumn) => {
  const DataTableHeader = () => {
    return <HeaderCell column={column} />;
  };
  return DataTableHeader;
};

const FilterChip = ({
  label,
  onClear,
}: {
  label: string;
  onClear: () => void;
}) => {
  return (
    <span className={chipStyles}>
      {label}
      <button
        type="button"
        onClick={onClear}
        className={chipClear}
        aria-label={`Clear ${label}`}
      >
        <Icon name="close" size="xs" />
      </button>
    </span>
  );
};
export const DataTableSection = forwardRef<
  DataTableSectionHandle,
  DataTableSectionProps
>(
  (
    {
      detailRows,
      stepId,
      label = "Data",
      title,
      filename,
      dateColumnKey,
      defaultFilters = {},
    },
    ref,
  ) => {
    const layerRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);

    // Default to rows reading chronologically to the latest exit.
    const [sorting, setSorting] = useState<SortingState>(() =>
      dateColumnKey ? [{ id: dateColumnKey, desc: false }] : [],
    );

    // Re-apply the default when the active date column changes (e.g. switching
    // dimension); a manual re-sort persists until then.
    const defaultSortKeyRef = useRef(dateColumnKey);
    useEffect(() => {
      if (defaultSortKeyRef.current !== dateColumnKey) {
        defaultSortKeyRef.current = dateColumnKey;
        setSorting(dateColumnKey ? [{ id: dateColumnKey, desc: false }] : []);
      }
    }, [dateColumnKey]);

    const [activeFilters, setActiveFilters] = useState<DataTableFilters>({});
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
    const applyFilters = useCallback(
      (filters: DataTableFilters) => {
        setActiveFilters(filters);
        if (dateColumnKey && hasDateFilters(filters)) {
          setColumnFilters([
            { id: dateColumnKey, value: filterValueFromFilters(filters) },
          ]);
        } else {
          setColumnFilters([]);
        }
      },
      [dateColumnKey],
    );
    const openWithFilters = useCallback(
      (filters: DataTableFilters = defaultFilters) => {
        trackSupplyChainInteraction({
          interaction: "data_table_opened",
          source: "step_detail_panel",
          stepId,
        });
        applyFilters(filters);
        setOpen(true);
      },
      [applyFilters, defaultFilters, stepId],
    );
    useImperativeHandle(ref, () => ({ openWithFilters }), [openWithFilters]);
    const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
      if (!detailRows?.columns) {
        return [];
      }
      return detailRows.columns.map((col) => {
        const numeric = isNumericColumn(detailRows.rows, col.key);
        const dateCol = isDateColumn(detailRows.rows, col.key);
        return {
          id: col.key,
          accessorKey: col.key,
          header: makeHeaderRenderer(col),
          cell: (info: { getValue: () => unknown }) =>
            formatCell(info.getValue()),
          sortingFn: dateCol ? "datetime" : numeric ? "basic" : "alphanumeric",
          filterFn: col.key === dateColumnKey ? dateFilterFn : undefined,
          meta: { numeric, dateCol },
        };
      });
    }, [detailRows, dateColumnKey]);
    const data = useMemo(() => {
      if (!detailRows?.rows) {
        return [];
      }
      return detailRows.rows as Record<string, unknown>[];
    }, [detailRows]);
    const table = useReactTable({
      data,
      columns,
      state: { sorting, columnFilters },
      onSortingChange: setSorting,
      onColumnFiltersChange: setColumnFilters,
      getCoreRowModel: getCoreRowModel(),
      getFilteredRowModel: getFilteredRowModel(),
      getSortedRowModel: getSortedRowModel(),
    });
    const handleClose = useCallback(() => setOpen(false), []);
    const filteredRows = table.getFilteredRowModel().rows;
    const visibleRowCount = filteredRows.length;
    const totalRowCount = detailRows?.rows.length ?? 0;
    const filtersAvailable = Boolean(dateColumnKey);
    const activePeriodLabel = filtersAvailable
      ? periodLabel(activeFilters)
      : null;
    const activeMonthLabel =
      filtersAvailable && activeFilters.month
        ? formatMonth(activeFilters.month)
        : null;
    const hasActiveFilters = Boolean(activePeriodLabel ?? activeMonthLabel);
    const clearPeriodFilter = () =>
      applyFilters({ ...activeFilters, periodRange: null, periodLabel: null });
    const clearMonthFilter = () =>
      applyFilters({ ...activeFilters, month: null });
    useEffect(() => {
      if (!open) {
        return;
      }
      const handler = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          handleClose();
        }
      };
      document.addEventListener("keydown", handler);
      return () => document.removeEventListener("keydown", handler);
    }, [open, handleClose]); // Lock background scroll while the modal is open: the modal is a custom portal
    // (not an Ark dialog), so it doesn't auto scroll-lock the slide-over behind it.
    // Allow wheel/touch scrolling only inside the table's scroll container; block
    // it everywhere else (header, backdrop) so the slide-over can't scroll through.
    useEffect(() => {
      if (!open) {
        return;
      }
      const layer = layerRef.current;
      if (!layer) {
        return;
      }
      const block = (event: Event) => {
        const scroller = scrollRef.current;
        if (
          scroller &&
          event.target instanceof Node &&
          scroller.contains(event.target)
        ) {
          return;
        }
        event.preventDefault();
      };
      layer.addEventListener("wheel", block, { passive: false });
      layer.addEventListener("touchmove", block, { passive: false });
      return () => {
        layer.removeEventListener("wheel", block);
        layer.removeEventListener("touchmove", block);
      };
    }, [open]);
    if (!detailRows || !detailRows.rows.length) {
      return null;
    }
    const handleExport = () => {
      trackSupplyChainInteraction({
        interaction: "csv_exported",
        source: "step_detail_data_table",
        stepId,
      });
      const rows = filteredRows.map(
        (row) => row.original as Record<string, string | number | null>,
      );
      const csv = buildCsvContent(detailRows.columns, rows);
      downloadCsv(csv, filename ?? `${stepId}_data.csv`);
    };
    return (
      <>
        {/* Inline trigger */}
        <Button
          variant="subtle"
          tone="neutral"
          size="xs"
          iconName="table"
          className={triggerButton}
          onClick={() => openWithFilters(defaultFilters)}
        >
          Data
        </Button>

        {/* Modal — rendered inline (not portaled) inside the slide-over's Ark
               dialog content. The Ark dialog is modal, so it sets `pointer-events:
               none` on <body> and re-enables it only on its content subtree; keeping
               the modal inside that subtree keeps it interactive. It also means clicks
               here count as "inside" the dialog, so they don't trigger the
               slide-over's close-on-interact-outside. `position: fixed` still spans
               the viewport because the Ark content has no transform/containing block. */}
        {open && (
          <div ref={layerRef} className={modalLayer}>
            {/* Backdrop */}
            <div
              className={modalBackdrop}
              onClick={handleClose}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  handleClose();
                }
              }}
              role="button"
              tabIndex={-1}
              aria-label="Close data table"
            />

            {/* Dialog */}
            <div className={modalDialog}>
              {/* Modal header */}
              <div className={modalHeader}>
                <div className={modalHeaderLeft}>
                  <h3 className={modalTitle}>{title ?? label}</h3>
                  {title && label && label !== title && (
                    <span className={subtleText}>{label}</span>
                  )}
                  <span className={rowCountText}>
                    {hasActiveFilters
                      ? `${visibleRowCount} of ${totalRowCount}`
                      : totalRowCount}{" "}
                    rows
                  </span>
                </div>
                <div className={modalHeaderRight}>
                  <Button
                    variant="subtle"
                    tone="neutral"
                    size="xs"
                    iconName="download"
                    onClick={handleExport}
                  >
                    Export CSV
                  </Button>
                  <Button
                    variant="ghost"
                    tone="neutral"
                    size="sm"
                    iconName="close"
                    aria-label="Close"
                    onClick={handleClose}
                  />
                </div>
              </div>

              {hasActiveFilters && (
                <div className={filterBar}>
                  <span className={filterBarLabel}>Filters</span>
                  {activePeriodLabel && (
                    <FilterChip
                      label={`Period: ${activePeriodLabel}`}
                      onClear={clearPeriodFilter}
                    />
                  )}
                  {activeMonthLabel && (
                    <FilterChip
                      label={`Month: ${activeMonthLabel}`}
                      onClear={clearMonthFilter}
                    />
                  )}
                </div>
              )}

              {/* Scrollable table area */}
              <div ref={scrollRef} className={tableScroll}>
                <table className={tableEl}>
                  <thead className={theadSticky}>
                    {table.getHeaderGroups().map((headerGroup) => (
                      <tr key={headerGroup.id}>
                        {headerGroup.headers.map((header) => {
                          const meta = header.column.columnDef.meta as
                            | { numeric?: boolean }
                            | undefined;
                          return (
                            <th
                              key={header.id}
                              onClick={header.column.getToggleSortingHandler()}
                              onKeyDown={(event) => {
                                if (
                                  event.key === "Enter" ||
                                  event.key === " "
                                ) {
                                  header.column.getToggleSortingHandler()?.(
                                    event,
                                  );
                                }
                              }}
                              className={cx(thStyles, meta?.numeric && thRight)}
                            >
                              <div
                                className={cx(
                                  thInner,
                                  meta?.numeric && thInnerRight,
                                )}
                              >
                                {flexRender(
                                  header.column.columnDef.header,
                                  header.getContext(),
                                )}
                                {header.column.getIsSorted() === "asc" && (
                                  <Icon
                                    name="arrowUp"
                                    size="xs"
                                    className={sortIcon}
                                  />
                                )}
                                {header.column.getIsSorted() === "desc" && (
                                  <Icon
                                    name="arrowDown"
                                    size="xs"
                                    className={sortIcon}
                                  />
                                )}
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {table.getRowModel().rows.map((row) => (
                      <tr key={row.id} className={rowStyles}>
                        {row.getVisibleCells().map((cell) => {
                          const meta = cell.column.columnDef.meta as
                            | { numeric?: boolean }
                            | undefined;
                          return (
                            <td
                              key={cell.id}
                              className={cx(tdStyles, meta?.numeric && tdRight)}
                            >
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext(),
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {visibleRowCount === 0 && (
                      <tr>
                        <td
                          colSpan={detailRows.columns.length}
                          className={emptyCell}
                        >
                          No rows match the selected filters
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </>
    );
  },
);
