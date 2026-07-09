import { Icon } from "@hashintel/ds-components";
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
import { trendToneFor } from "../../shared/trend-tone";
import { ColumnHeader } from "./shared/column-header";
import { siteNodeDisplayLabel, sortTrendRows } from "./shared/helpers";
import { LowSampleBadge } from "./shared/low-sample-badge";
import { ProductTags } from "./shared/product-tags";
import {
  LOW_SAMPLE_N,
  type SortDir,
  type SortKey,
  type TrendRow,
} from "./shared/row-types";
import * as threshold from "./shared/table-styles";
import { useStepTableView } from "./shared/use-step-table-view";

import type { SiteNode, StepType } from "../../shared/types";

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
  rows: TrendRow[];
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
    useStepTableView<TrendRow>({
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
      sortRows: sortTrendRows,
      source: "trend_table",
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
                label={`Current ${measureLabel}`}
                sort={{
                  active: sort.key === "median",
                  dir: sort.dir,
                  onToggle: () => toggleSort("median"),
                }}
              />
            </th>
            <th className={threshold.thRight}>
              <ColumnHeader
                label={`Previous ${measureLabel}`}
                sort={{
                  active: sort.key === "previous",
                  dir: sort.dir,
                  onToggle: () => toggleSort("previous"),
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
              <td className={cx(threshold.tdRight, threshold.valueStrong)}>
                {formatNumber(selectStat(row.stats, measure), {
                  maximumFractionDigits: 1,
                })}
                d
              </td>
              <td className={cx(threshold.tdRight, prevValue)}>
                {row.previousValue != null
                  ? `${formatNumber(row.previousValue, {
                      maximumFractionDigits: 1,
                    })}d`
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
                    statusHistory[statusKey(siteId, row)],
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    onStatus(row, row.label);
                  }}
                />
              </td>
            </tr>
          ))}
          {displayedRows.length === 0 && (
            <tr>
              <td colSpan={7} className={threshold.emptyCell}>
                {rows.length === 0
                  ? "No trend data for this site."
                  : "No trend data matches the current filters."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
