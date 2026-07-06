import { css, cx } from "@hashintel/ds-helpers/css";

import { BriefLink, StatusActionButton } from "../../shared/action-buttons";
import { getCategoryColor } from "../../shared/categories";
import { formatNumber } from "../../shared/cost";
import {
  MEASURE_LABELS,
  selectStat,
  useBaseMeasure,
} from "../../shared/measure-context";
import { siteNodeKey } from "../../shared/site-node-key";
import { deriveStatusActionState, statusKey } from "../../shared/status";
import { trackSupplyChainInteraction } from "../../shared/telemetry";
import { TrendIndicator } from "../../shared/trend-indicator";
import { siteNodeDisplayLabel } from "./shared/helpers";
import { LowSampleBadge } from "./shared/low-sample-badge";
import { ProductTags } from "./shared/product-tags";
import {
  LOW_SAMPLE_N,
  type PlanningRow,
  type SortKey,
  type SortDir,
} from "./shared/row-types";
import { SortHeader } from "./shared/sort-header";
import * as threshold from "./shared/table-styles";

import type { StatusStore } from "../../shared/status";
import type { SiteNode } from "../../shared/types";

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
  briefHref,
  statusHistory = {},
  onStatus,
}: {
  rows: PlanningRow[];
  /** Route site slug; scopes status keys to the global store. */
  siteId: string;
  sort: { key: SortKey; dir: SortDir };
  onSort: (s: { key: SortKey; dir: SortDir }) => void;
  onRowClick: (node: SiteNode) => void;
  briefHref: (node: SiteNode) => string;
  statusHistory?: StatusStore;
  onStatus: (node: SiteNode, title: string) => void;
}) => {
  const { measure } = useBaseMeasure();
  const measureLabel = MEASURE_LABELS[measure];
  const toggleSort = (key: SortKey) => {
    trackSupplyChainInteraction({
      interaction: "table_sort_changed",
      siteId: rows[0]?.plant ?? "",
      source: "planning_table",
    });
    if (sort.key === key) {
      onSort({ key, dir: sort.dir === "desc" ? "asc" : "desc" });
    } else {
      onSort({ key, dir: "desc" });
    }
  };
  return (
    <div
      className={threshold.tableContainer}
      style={{ maxHeight: threshold.TABLE_MAX_HEIGHT }}
    >
      <table className={threshold.table}>
        <thead>
          <tr className={threshold.theadRow}>
            <th className={threshold.th}>
              <SortHeader
                label="Step"
                sortKey="material"
                current={sort}
                onToggle={toggleSort}
              />
            </th>
            <th className={threshold.th}>Products</th>
            <th className={threshold.thRight}>Planned</th>
            <th className={threshold.thRight}>
              <SortHeader
                label={measureLabel}
                sortKey="median"
                current={sort}
                onToggle={toggleSort}
              />
            </th>
            <th className={threshold.thRight}>
              <SortHeader
                label="Deviation"
                sortKey="deviation"
                current={sort}
                onToggle={toggleSort}
              />
            </th>
            <th className={threshold.thRight}>
              <SortHeader
                label="Trend"
                sortKey="trend"
                current={sort}
                onToggle={toggleSort}
              />
            </th>
            <th className={threshold.thRight}>
              <SortHeader
                label="% Exceeding"
                sortKey="exceeding"
                current={sort}
                onToggle={toggleSort}
              />
            </th>
            <th className={threshold.thRight}>Brief</th>
          </tr>
        </thead>
        <tbody className={threshold.tbodyDivide}>
          {rows.map((row) => {
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
                      ? `Previous period ${measureLabel}: ${formatNumber(row.previousValue, { maximumFractionDigits: 1 })}d`
                      : undefined
                  }
                >
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
                </td>
                <td className={cx(threshold.tdRight, threshold.valueMuted)}>
                  {row.pct_exceeding_plan != null
                    ? `${formatNumber(row.pct_exceeding_plan, { maximumFractionDigits: 0 })}%`
                    : "–"}
                </td>
                <td className={cx(threshold.td, threshold.tdRight)}>
                  <div className={threshold.briefActionStack}>
                    <BriefLink
                      href={briefHref(row)}
                      onClick={(event) => event.stopPropagation()}
                    />

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
          {rows.length === 0 && (
            <tr>
              <td colSpan={8} className={threshold.emptyCell}>
                No planning parameter data in the selected period
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
