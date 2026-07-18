import { useMemo } from "react";

import { cx } from "@hashintel/ds-helpers/css";

import { StatusActionButton } from "../../shared/action-buttons";
import { getCategoryColor } from "../../shared/categories";
import { formatNumber } from "../../shared/cost";
import {
  MEASURE_LABELS,
  selectStat,
  useBaseMeasure,
} from "../../shared/measure-context";
import { PlanningWarningIndicator } from "../../shared/planning-warning-indicator";
import { procurementStepDisplayLabel } from "../../shared/procurement-planning-ui";
import { siteNodeKey } from "../../shared/site-node-key";
import {
  deriveStatusActionState,
  statusKey,
  type StatusActionLabel,
  type StatusStore,
} from "../../shared/status";
import { TrendIndicator } from "../../shared/trend-indicator";
import { buildColumnFilter, countBy } from "./shared/column-filter";
import { ColumnHeader } from "./shared/column-header";
import { siteNodeDisplayLabel, sortPlanningRows } from "./shared/helpers";
import { LowSampleBadge } from "./shared/low-sample-badge";
import { ProductTags } from "./shared/product-tags";
import {
  LOW_SAMPLE_N,
  type PlanningRow,
  type SortKey,
  type SortDir,
} from "./shared/row-types";
import * as threshold from "./shared/table-styles";
import { useStepTableView } from "./shared/use-step-table-view";

import type { SiteNode, StepType } from "../../shared/types";

function basisLabel(row: PlanningRow): string {
  if (row.type !== "procurement") {
    return "–";
  }
  return {
    ordinary: "Buy",
    consignment: "Consignment",
    subcontract: "Subcontract",
    mixed: "Mixed",
    unknown: "Unknown",
  }[row.receipt_basis ?? "unknown"];
}

function supplierLabel(row: PlanningRow): string {
  return row.type === "procurement"
    ? (row.supplier_name ?? row.supplier_id ?? "Unknown")
    : "–";
}

function planningStepLabel(row: PlanningRow): string {
  const label = siteNodeDisplayLabel(row);
  return row.type === "procurement"
    ? procurementStepDisplayLabel(label, "compact")
    : label;
}

function isLowSample(row: PlanningRow): boolean {
  return (
    (row.stats.n > 0 && row.stats.n < LOW_SAMPLE_N) ||
    (row.previousTrendN > 0 && row.previousTrendN < LOW_SAMPLE_N)
  );
}

const PlanningSampleTooltip = ({
  currentN,
  previousN,
}: {
  currentN: number;
  previousN: number;
}) => {
  return (
    <span>
      {currentN > 0 && currentN < LOW_SAMPLE_N
        ? `Current period has ${currentN} observations`
        : ""}
      {currentN > 0 &&
      currentN < LOW_SAMPLE_N &&
      previousN > 0 &&
      previousN < LOW_SAMPLE_N
        ? "; "
        : ""}
      {previousN > 0 && previousN < LOW_SAMPLE_N
        ? `Previous comparison period has ${previousN} observations`
        : ""}
    </span>
  );
};
export const PlanningTable = ({
  rows,
  siteId,
  sort,
  onSort,
  onRowClick,
  statusHistory = {},
  onStatus,
  typeHidden,
  onTypeHiddenChange,
  productHidden,
  onProductHiddenChange,
  supplierHidden,
  onSupplierHiddenChange,
  basisHidden,
  onBasisHiddenChange,
  statusHidden,
  onStatusHiddenChange,
}: {
  rows: PlanningRow[];
  /** Route site slug; scopes status keys to the global store. */
  siteId: string;
  sort: { key: SortKey; dir: SortDir };
  onSort: (s: { key: SortKey; dir: SortDir }) => void;
  onRowClick: (node: SiteNode) => void;
  statusHistory?: StatusStore;
  onStatus: (node: SiteNode, title: string) => void;
  typeHidden: Set<StepType>;
  onTypeHiddenChange: (next: Set<StepType>) => void;
  productHidden: Set<string>;
  onProductHiddenChange: (next: Set<string>) => void;
  supplierHidden: Set<string>;
  onSupplierHiddenChange: (next: Set<string>) => void;
  basisHidden: Set<string>;
  onBasisHiddenChange: (next: Set<string>) => void;
  statusHidden: Set<StatusActionLabel>;
  onStatusHiddenChange: (next: Set<StatusActionLabel>) => void;
}) => {
  const { measure } = useBaseMeasure();
  const measureLabel = MEASURE_LABELS[measure];

  const {
    typeFilter,
    productFilter,
    statusFilter,
    displayedRows: stepFilteredRows,
    toggleSort,
  } = useStepTableView<PlanningRow>({
    rows,
    siteId,
    sort,
    onSort,
    statusHistory,
    typeHidden,
    onTypeHiddenChange,
    productHidden,
    onProductHiddenChange,
    statusHidden,
    onStatusHiddenChange,
    sortRows: sortPlanningRows,
    source: "planning_table",
  });

  const supplierFilter = useMemo(() => {
    const values = [...new Set(rows.map(supplierLabel))].sort((left, right) =>
      left.localeCompare(right),
    );
    return buildColumnFilter<string>({
      header: "Supplier",
      values,
      labelOf: (supplier) => supplier,
      counts: countBy(rows, supplierLabel),
      hidden: supplierHidden,
      onHiddenChange: onSupplierHiddenChange,
    });
  }, [rows, supplierHidden, onSupplierHiddenChange]);

  const basisFilter = useMemo(() => {
    const values = [...new Set(rows.map(basisLabel))].sort((left, right) =>
      left.localeCompare(right),
    );
    return buildColumnFilter<string>({
      header: "Basis",
      values,
      labelOf: (basis) => basis,
      counts: countBy(rows, basisLabel),
      hidden: basisHidden,
      onHiddenChange: onBasisHiddenChange,
      searchable: false,
    });
  }, [rows, basisHidden, onBasisHiddenChange]);

  const displayedRows = useMemo(
    () =>
      stepFilteredRows.filter(
        (row) =>
          !supplierHidden.has(supplierLabel(row)) &&
          !basisHidden.has(basisLabel(row)),
      ),
    [stepFilteredRows, supplierHidden, basisHidden],
  );

  return (
    <div
      className={threshold.tableContainer}
      style={{ maxHeight: threshold.TABLE_MAX_HEIGHT }}
    >
      <table className={threshold.table}>
        <thead>
          <tr className={threshold.theadRow}>
            <th className={threshold.th}>
              <ColumnHeader
                label="Step"
                sort={{
                  active: sort.key === "material",
                  dir: sort.dir,
                  onToggle: () => toggleSort("material"),
                }}
                filter={typeFilter}
              />
            </th>
            <th className={threshold.th}>
              <ColumnHeader
                label="Supplier"
                sort={{
                  active: sort.key === "supplier",
                  dir: sort.dir,
                  onToggle: () => toggleSort("supplier"),
                }}
                filter={supplierFilter}
              />
            </th>
            <th className={threshold.th}>
              <ColumnHeader
                label="Basis"
                sort={{
                  active: sort.key === "basis",
                  dir: sort.dir,
                  onToggle: () => toggleSort("basis"),
                }}
                filter={basisFilter}
              />
            </th>
            <th className={threshold.th}>
              <ColumnHeader label="Products" filter={productFilter} />
            </th>
            <th className={threshold.thRight}>
              <ColumnHeader
                label="Planned"
                sort={{
                  active: sort.key === "planned",
                  dir: sort.dir,
                  onToggle: () => toggleSort("planned"),
                }}
              />
            </th>
            <th className={threshold.thRight}>
              <ColumnHeader
                label={measureLabel}
                sort={{
                  active: sort.key === "median",
                  dir: sort.dir,
                  onToggle: () => toggleSort("median"),
                }}
              />
            </th>
            <th className={threshold.thRight}>
              <ColumnHeader
                label="Deviation"
                sort={{
                  active: sort.key === "deviation",
                  dir: sort.dir,
                  onToggle: () => toggleSort("deviation"),
                }}
              />
            </th>
            <th className={threshold.thRight}>
              <ColumnHeader
                label="Trend"
                sort={{
                  active: sort.key === "trend",
                  dir: sort.dir,
                  onToggle: () => toggleSort("trend"),
                }}
              />
            </th>
            <th className={threshold.thRight}>
              <ColumnHeader
                label="Exceeding"
                sort={{
                  active: sort.key === "exceeding",
                  dir: sort.dir,
                  onToggle: () => toggleSort("exceeding"),
                }}
              />
            </th>
            <th className={threshold.thRight}>
              <ColumnHeader
                label="Status"
                sort={{
                  active: sort.key === "status",
                  dir: sort.dir,
                  onToggle: () => toggleSort("status"),
                }}
                filter={statusFilter}
              />
            </th>
          </tr>
        </thead>
        <tbody className={threshold.tbodyDivide}>
          {displayedRows.map((row) => {
            const deviationPct = row.deviationPct;
            const hasDeviation = deviationPct != null;
            const isOver = deviationPct != null && deviationPct > 0;
            return (
              <tr
                key={siteNodeKey(row)}
                onClick={() => onRowClick(row)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    onRowClick(row);
                  }
                }}
                tabIndex={0}
                className={threshold.bodyRow}
              >
                <td className={threshold.td}>
                  <div className={threshold.cellFlex}>
                    <span className={threshold.stepMarker}>
                      <span
                        className={cx(threshold.catDot, threshold.stepDot)}
                        style={{ backgroundColor: getCategoryColor(row.type) }}
                      />
                      {row.type === "procurement" && (
                        <PlanningWarningIndicator
                          warnings={row.planning_warnings}
                        />
                      )}
                    </span>
                    <span className={threshold.stepLabel}>
                      {planningStepLabel(row)}
                    </span>
                  </div>
                </td>
                <td className={threshold.td}>{supplierLabel(row)}</td>
                <td className={threshold.td}>{basisLabel(row)}</td>
                <td className={threshold.td}>
                  <ProductTags products={row.products} maxVisible={12} />
                </td>
                <td className={cx(threshold.tdRight, threshold.valueMuted)}>
                  {formatNumber(row.plan, { maximumFractionDigits: 0 })}d
                </td>
                <td className={cx(threshold.tdRight, threshold.valueStrong)}>
                  {formatNumber(selectStat(row.stats, measure) ?? 0, {
                    maximumFractionDigits: 1,
                  })}
                  d
                </td>
                <td
                  className={cx(
                    threshold.tdRight,
                    !hasDeviation
                      ? threshold.valueMuted
                      : isOver
                        ? threshold.trendDanger
                        : threshold.trendSuccess,
                  )}
                >
                  {hasDeviation ? (
                    <>
                      {isOver ? "+" : ""}
                      {formatNumber(deviationPct, {
                        maximumFractionDigits: 0,
                      })}
                      %
                    </>
                  ) : (
                    "–"
                  )}
                </td>
                <td
                  className={threshold.tdRight}
                  title={
                    row.previousValue != null
                      ? `Previous period ${measureLabel}: ${formatNumber(
                          row.previousValue,
                          { maximumFractionDigits: 1 },
                        )}d`
                      : undefined
                  }
                >
                  <span className={threshold.stackedCell}>
                    <TrendIndicator pctChange={row.trendPct} />
                    {isLowSample(row) && (
                      <span className={threshold.badgeWrap}>
                        <LowSampleBadge
                          label="low sample"
                          title={
                            <PlanningSampleTooltip
                              currentN={row.stats.n}
                              previousN={row.previousTrendN}
                            />
                          }
                        />
                      </span>
                    )}
                  </span>
                </td>
                <td className={cx(threshold.tdRight, threshold.valueMuted)}>
                  {row.pct_exceeding_plan != null
                    ? `${formatNumber(row.pct_exceeding_plan, {
                        maximumFractionDigits: 0,
                      })}%`
                    : "–"}
                </td>
                <td className={cx(threshold.td, threshold.tdRight)}>
                  <div className={threshold.briefActionStack}>
                    {/* Brief button commented out; still reachable via the step slide-over. */}
                    {/* <BriefLink href={briefHref(row)} onClick={(event) => event.stopPropagation()} /> */}
                    <StatusActionButton
                      state={deriveStatusActionState(
                        statusHistory[statusKey(siteId, row)],
                      )}
                      onClick={(event) => {
                        event.stopPropagation();
                        onStatus(row, row.label);
                      }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
          {displayedRows.length === 0 && (
            <tr>
              <td colSpan={10} className={threshold.emptyCell}>
                {rows.length === 0
                  ? "No planning parameter data for this site."
                  : "No planning parameter data matches the current filters."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
