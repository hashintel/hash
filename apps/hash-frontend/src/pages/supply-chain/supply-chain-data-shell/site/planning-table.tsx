import { css, cx } from "@hashintel/ds-helpers/css";

import { StatusActionButton } from "../../shared/action-buttons";
import { getCategoryColor } from "../../shared/categories";
import { formatNumber } from "../../shared/cost";
import {
  MEASURE_LABELS,
  selectStat,
  useBaseMeasure,
} from "../../shared/measure-context";
import { siteNodeKey } from "../../shared/site-node-key";
import {
  deriveStatusActionState,
  statusKey,
  type StatusActionLabel,
  type StatusStore,
} from "../../shared/status";
import { TrendIndicator } from "../../shared/trend-indicator";
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

const planNote = css({ textStyle: "xxs", color: "fg.subtle", ml: "4" });

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
  statusHidden: Set<StatusActionLabel>;
  onStatusHiddenChange: (next: Set<StatusActionLabel>) => void;
}) => {
  const { measure } = useBaseMeasure();
  const measureLabel = MEASURE_LABELS[measure];

  const { typeFilter, productFilter, statusFilter, displayedRows, toggleSort } =
    useStepTableView<PlanningRow>({
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
            const isOver = row.deviationPct > 0;
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
                    <span
                      className={threshold.catDot}
                      style={{ backgroundColor: getCategoryColor(row.type) }}
                    />

                    <span className={threshold.stepLabel}>
                      {siteNodeDisplayLabel(row)}
                    </span>
                  </div>
                  {row.plan_note &&
                    row.plan_note !== "No planning parameter set" && (
                      <span className={planNote}>{row.plan_note}</span>
                    )}
                </td>
                <td className={threshold.td}>
                  <ProductTags products={row.products} />
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
                    isOver ? threshold.trendDanger : threshold.trendSuccess,
                  )}
                >
                  {isOver ? "+" : ""}
                  {formatNumber(row.deviationPct, { maximumFractionDigits: 0 })}
                  %
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
                  <span className={threshold.sampleCell}>
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
                    <TrendIndicator pctChange={row.trendPct} />
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
              <td colSpan={8} className={threshold.emptyCell}>
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
