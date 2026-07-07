import { cx } from "@hashintel/ds-helpers/css";

import { BriefLink, StatusActionButton } from "../../shared/action-buttons";
import { getCategoryColor } from "../../shared/categories";
import { formatCost, formatNumber } from "../../shared/cost";
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
  type DwellRow,
  type SortKey,
  type SortDir,
} from "./shared/row-types";
import { SortHeader } from "./shared/sort-header";
import * as threshold from "./shared/table-styles";

import type { StatusStore } from "../../shared/status";
import type { SiteNode } from "../../shared/types";

export const DwellTable = ({
  rows,
  siteId,
  sort,
  onSort,
  onRowClick,
  briefHref,
  statusHistory = {},
  onStatus,
  timeRange,
  currency,
}: {
  rows: DwellRow[];
  /** Route site slug; scopes status keys to the global store. */
  siteId: string;
  sort: { key: SortKey; dir: SortDir };
  onSort: (s: { key: SortKey; dir: SortDir }) => void;
  onRowClick: (node: SiteNode) => void;
  briefHref: (node: SiteNode) => string;
  statusHistory?: StatusStore;
  onStatus: (node: SiteNode, title: string) => void;
  timeRange: string;
  currency: string | null;
}) => {
  const { measure } = useBaseMeasure();
  const toggleSort = (key: SortKey) => {
    trackSupplyChainInteraction({
      interaction: "table_sort_changed",
      siteId: rows[0]?.plant ?? "",
      source: "dwell_table",
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
            <th className={threshold.thRight}>
              <SortHeader
                label={MEASURE_LABELS[measure]}
                sortKey="median"
                current={sort}
                onToggle={toggleSort}
              />
            </th>
            <th className={threshold.thRight}>
              <SortHeader
                label={`Cost (${timeRange})`}
                sortKey="cost"
                current={sort}
                onToggle={toggleSort}
              />
            </th>
            <th className={threshold.thRight}>Samples</th>
            <th className={threshold.thRight}>Brief</th>
          </tr>
        </thead>
        <tbody className={threshold.tbodyDivide}>
          {rows.map((row) => (
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
              </td>
              <td className={threshold.td}>
                <ProductTags products={row.products} />
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
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className={threshold.emptyCell}>
                No dwell steps in the selected period
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
