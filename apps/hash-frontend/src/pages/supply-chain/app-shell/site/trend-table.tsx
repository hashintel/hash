import { useMemo } from "react";

import { Icon } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { StatusActionButton } from "../../shared/action-buttons";
import { getCategoryColor } from "../../shared/categories";
import { formatNumber } from "../../shared/cost";
import { siteNodeKey } from "../../shared/site-node-key";
import { deriveStatusActionState, statusKey } from "../../shared/status";
import { trackSupplyChainInteraction } from "../../shared/telemetry";
import { trendToneFor } from "../../shared/trend-tone";
import { LowSampleBadge } from "./shared/low-sample-badge";
import { ProductTags } from "./shared/product-tags";
import {
  LOW_SAMPLE_N,
  type SortDir,
  type SortKey,
  type TrendRow,
} from "./shared/row-types";
import { SortHeader } from "./shared/sort-header";
import * as threshold from "./shared/table-styles";

import type { StatusStore } from "../../shared/status";
import type { SiteNode } from "../../shared/types";

const prevValue = css({ color: "fg.subtle" });
const trendWrap = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "1",
  fontVariantNumeric: "tabular-nums",
});
const trendUp = css({ color: "status.error.fg.body" });
const trendDown = css({ color: "status.success.fg.body" });
const trendFlat = css({ color: "fg.subtle" });
const sampleTooltip = css({
  display: "flex",
  flexDirection: "column",
  gap: "0.5",
  textAlign: "left",
});

function sortTrendRows(
  rows: TrendRow[],
  sort: { key: SortKey; dir: SortDir },
): TrendRow[] {
  return [...rows].sort((left, right) => {
    let va = 0;
    let vb = 0;
    if (sort.key === "median") {
      va = left.stats.median ?? 0;
      vb = right.stats.median ?? 0;
    } else if (sort.key === "trend") {
      va =
        left.trendPct ??
        (sort.dir === "desc"
          ? Number.NEGATIVE_INFINITY
          : Number.POSITIVE_INFINITY);
      vb =
        right.trendPct ??
        (sort.dir === "desc"
          ? Number.NEGATIVE_INFINITY
          : Number.POSITIVE_INFINITY);
    } else if (sort.key === "material") {
      return sort.dir === "desc"
        ? right.label.localeCompare(left.label)
        : left.label.localeCompare(right.label);
    }
    return sort.dir === "desc" ? vb - va : va - vb;
  });
}

const EqualsIcon = () => {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2.5 4.5h7M2.5 7.5h7"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
};
const TrendValue = ({
  pctChange,
}: {
  pctChange: number | null | undefined;
}) => {
  const tone = trendToneFor(pctChange);
  if (tone == null) {
    return <span className={cx(trendWrap, trendFlat)}>-</span>;
  }
  const toneClass =
    tone === "up" ? trendUp : tone === "down" ? trendDown : trendFlat;
  return (
    <span className={cx(trendWrap, toneClass)}>
      {tone === "flat" ? (
        <EqualsIcon />
      ) : (
        <Icon
          name={tone === "up" ? "arrowTrendUp" : "arrowTrendDown"}
          size="xs"
        />
      )}
      <span>
        {formatNumber(Math.abs(pctChange ?? 0), { maximumFractionDigits: 0 })}%
      </span>
    </span>
  );
};

function isLowSample(row: TrendRow): boolean {
  return (
    (row.stats.n > 0 && row.stats.n < LOW_SAMPLE_N) ||
    (row.previousTrendN > 0 && row.previousTrendN < LOW_SAMPLE_N)
  );
}

const TrendSampleTooltip = ({
  currentN,
  previousN,
}: {
  currentN: number;
  previousN: number;
}) => {
  return (
    <span className={sampleTooltip}>
      <span>This period: {formatNumber(currentN)}</span>
      <span>Last period: {formatNumber(previousN)}</span>
    </span>
  );
};
export const TrendTable = ({
  rows,
  sort,
  onSort,
  onRowClick,
  statusHistory = {},
  onStatus,
}: {
  rows: TrendRow[];
  sort: { key: SortKey; dir: SortDir };
  onSort: (s: { key: SortKey; dir: SortDir }) => void;
  onRowClick: (node: SiteNode) => void;
  statusHistory?: StatusStore;
  onStatus: (node: SiteNode, title: string) => void;
}) => {
  const sortedRows = useMemo(() => sortTrendRows(rows, sort), [rows, sort]);
  const toggleSort = (key: SortKey) => {
    trackSupplyChainInteraction({
      interaction: "table_sort_changed",
      siteId: rows[0]?.plant ?? "",
      source: "trend_table",
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
                label="Current median"
                sortKey="median"
                current={sort}
                onToggle={toggleSort}
              />
            </th>
            <th className={threshold.thRight}>Previous median</th>
            <th className={threshold.thRight}>
              <SortHeader
                label="Trend"
                sortKey="trend"
                current={sort}
                onToggle={toggleSort}
              />
            </th>
            <th className={threshold.thRight}>Samples</th>
            <th className={threshold.thRight}>Status</th>
          </tr>
        </thead>
        <tbody className={threshold.tbodyDivide}>
          {sortedRows.map((row) => (
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

                  <span className={threshold.stepLabel}>{row.label}</span>
                </div>
              </td>
              <td className={threshold.td}>
                <ProductTags products={row.products} />
              </td>
              <td className={cx(threshold.tdRight, threshold.valueStrong)}>
                {formatNumber(row.stats.median, { maximumFractionDigits: 1 })}d
              </td>
              <td className={cx(threshold.tdRight, prevValue)}>
                {row.previousValue != null
                  ? `${formatNumber(row.previousValue, { maximumFractionDigits: 1 })}d`
                  : "-"}
              </td>
              <td className={threshold.tdRight}>
                <TrendValue pctChange={row.trendPct} />
              </td>
              <td className={cx(threshold.tdRight, threshold.valueMuted)}>
                <span className={threshold.sampleCell}>
                  {isLowSample(row) && (
                    <span className={threshold.badgeWrap}>
                      <LowSampleBadge
                        label="low"
                        title={
                          <TrendSampleTooltip
                            currentN={row.stats.n}
                            previousN={row.previousTrendN}
                          />
                        }
                      />
                    </span>
                  )}
                  <span>{formatNumber(row.stats.n)}</span>
                </span>
              </td>
              <td className={cx(threshold.td, threshold.tdRight)}>
                <StatusActionButton
                  state={deriveStatusActionState(
                    statusHistory[statusKey(row.plant, row)],
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    onStatus(row, row.label);
                  }}
                />
              </td>
            </tr>
          ))}
          {sortedRows.length === 0 && (
            <tr>
              <td colSpan={7} className={threshold.emptyCell}>
                No trend data in the selected period
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
