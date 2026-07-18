import { cx } from "@hashintel/ds-helpers/css";

import { StatusActionButton } from "../../shared/action-buttons";
import { getCategoryColor } from "../../shared/categories";
import { formatCost, formatNumber } from "../../shared/cost";
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
import { siteNodeDisplayLabel, sortRows } from "./shared/helpers";
import { LowSampleBadge } from "./shared/low-sample-badge";
import { ProductTags } from "./shared/product-tags";
import {
  LOW_SAMPLE_N,
  type DwellRow,
  type SortKey,
  type SortDir,
} from "./shared/row-types";
import * as threshold from "./shared/table-styles";
import { useStepTableView } from "./shared/use-step-table-view";

import type { SiteNode, StepType } from "../../shared/types";

const formatPolicyQuantity = (
  value: number | null | undefined,
  uom: string | null | undefined,
): string => {
  if (value == null) {
    return "–";
  }
  const quantity = formatNumber(value, { maximumFractionDigits: 3 });
  return uom ? `${quantity} ${uom}` : quantity;
};

export const DwellTable = ({
  rows,
  siteId,
  sort,
  onSort,
  onRowClick,
  statusHistory = {},
  onStatus,
  timeRange,
  currency,
  typeHidden,
  onTypeHiddenChange,
  productHidden,
  onProductHiddenChange,
  statusHidden,
  onStatusHiddenChange,
}: {
  rows: DwellRow[];
  /** Route site slug; scopes status keys to the global store. */
  siteId: string;
  sort: { key: SortKey; dir: SortDir };
  onSort: (s: { key: SortKey; dir: SortDir }) => void;
  onRowClick: (node: SiteNode) => void;
  statusHistory?: StatusStore;
  onStatus: (node: SiteNode, title: string) => void;
  timeRange: string;
  currency: string | null;
  typeHidden: Set<StepType>;
  onTypeHiddenChange: (next: Set<StepType>) => void;
  productHidden: Set<string>;
  onProductHiddenChange: (next: Set<string>) => void;
  statusHidden: Set<StatusActionLabel>;
  onStatusHiddenChange: (next: Set<StatusActionLabel>) => void;
}) => {
  const { measure } = useBaseMeasure();

  const { typeFilter, productFilter, statusFilter, displayedRows, toggleSort } =
    useStepTableView<DwellRow>({
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
      sortRows,
      source: "dwell_table",
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
                label={MEASURE_LABELS[measure]}
                sort={{
                  active: sort.key === "median",
                  dir: sort.dir,
                  onToggle: () => toggleSort("median"),
                }}
              />
            </th>
            <th className={threshold.thRight}>
              <ColumnHeader
                label="MOQ"
                sort={{
                  active: sort.key === "moq",
                  dir: sort.dir,
                  onToggle: () => toggleSort("moq"),
                }}
              />
            </th>
            <th className={threshold.thRight}>
              <ColumnHeader
                label="Safety stock"
                sort={{
                  active: sort.key === "safetyStock",
                  dir: sort.dir,
                  onToggle: () => toggleSort("safetyStock"),
                }}
              />
            </th>
            <th className={threshold.thRight}>
              <ColumnHeader
                label={`Cost (${timeRange})`}
                sort={{
                  active: sort.key === "cost",
                  dir: sort.dir,
                  onToggle: () => toggleSort("cost"),
                }}
              />
            </th>
            <th className={threshold.thRight}>
              <ColumnHeader
                label="Samples"
                sort={{
                  active: sort.key === "sample",
                  dir: sort.dir,
                  onToggle: () => toggleSort("sample"),
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
          {displayedRows.map((row) => (
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
                    className={cx(threshold.catDot, threshold.stepDot)}
                    style={{ backgroundColor: getCategoryColor(row.type) }}
                  />

                  <span className={threshold.stepLabel}>
                    {siteNodeDisplayLabel(row)}
                  </span>
                </div>
              </td>
              <td className={threshold.td}>
                <ProductTags products={row.products} maxVisible={12} />
              </td>
              <td className={threshold.tdRight}>
                <div className={threshold.stackedCell}>
                  <span className={threshold.valueStrong}>
                    {formatNumber(selectStat(row.stats, measure) ?? 0, {
                      maximumFractionDigits: 1,
                    })}
                    d
                  </span>
                  <TrendIndicator
                    pctChange={row.trendPct}
                    className={threshold.stackedTrend}
                  />
                </div>
              </td>
              <td className={threshold.tdRight}>
                <span
                  className={cx(
                    threshold.valueStrong,
                    threshold.policyQuantity,
                  )}
                >
                  {formatPolicyQuantity(
                    row.inventory_policy?.minimum_order_qty,
                    row.inventory_policy?.order_uom,
                  )}
                </span>
              </td>
              <td className={threshold.tdRight}>
                <span
                  className={cx(
                    threshold.valueStrong,
                    threshold.policyQuantity,
                  )}
                >
                  {formatPolicyQuantity(
                    row.inventory_policy?.safety_stock_qty,
                    row.inventory_policy?.safety_stock_uom,
                  )}
                </span>
              </td>
              <td className={threshold.tdRight}>
                <div className={threshold.stackedCell}>
                  <span className={threshold.valueDanger}>
                    {row.periodCost > 0
                      ? formatCost(row.periodCost, currency, { compact: true })
                      : "–"}
                  </span>
                  <TrendIndicator
                    pctChange={row.costTrendPct}
                    className={threshold.stackedTrend}
                  />
                </div>
              </td>
              <td className={cx(threshold.tdRight, threshold.valueMuted)}>
                <span className={threshold.sampleCell}>
                  {row.stats.n > 0 && row.stats.n < LOW_SAMPLE_N && (
                    <span className={threshold.badgeWrap}>
                      <LowSampleBadge
                        label="low"
                        title={`Current period has ${row.stats.n} observations`}
                      />
                    </span>
                  )}
                  <span>{formatNumber(row.stats.n)}</span>
                </span>
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
          ))}
          {displayedRows.length === 0 && (
            <tr>
              <td colSpan={8} className={threshold.emptyCell}>
                {rows.length === 0
                  ? "No dwell steps for this site."
                  : "No dwell steps match the current filters."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
