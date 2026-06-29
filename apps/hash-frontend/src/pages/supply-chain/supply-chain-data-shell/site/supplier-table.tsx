import { useMemo } from "react";

import { css, cx } from "@hashintel/ds-helpers/css";

import { formatNumber } from "../../shared/cost";
import { trackSupplyChainInteraction } from "../../shared/telemetry";
import { colorForOtif, sortSupplierRows } from "./shared/helpers";
import { SortHeader } from "./shared/sort-header";
import * as threshold from "./shared/table-styles";

import type { VendorOtifStats } from "../../shared/types";
import type { SortKey, SortDir } from "./shared/row-types";

const outerWrap = css({ display: "flex", flexDirection: "column", gap: "2" });
const vendorCell = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  minW: "0",
});
const vendorInner = css({ minW: "0" });
const vendorName = css({
  fontWeight: "medium",
  color: "fg.heading",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});
const vendorId = css({
  textStyle: "xxs",
  color: "fg.subtle",
  fontVariantNumeric: "tabular-nums",
});
const materials = css({ textStyle: "xs", color: "fg.subtle" });
const linesLate = css({
  ml: "1",
  textStyle: "xxs",
  color: "status.error.fg.body",
});

export const SupplierTable = ({
  rows,
  sort,
  onSort,
  onRowClick,
}: {
  rows: VendorOtifStats[];
  sort: { key: SortKey; dir: SortDir };
  onSort: (s: { key: SortKey; dir: SortDir }) => void;
  onRowClick: (vendor: VendorOtifStats) => void;
}) => {
  const sorted = useMemo(() => sortSupplierRows(rows, sort), [rows, sort]);
  const toggleSort = (key: SortKey) => {
    trackSupplyChainInteraction({
      interaction: "table_sort_changed",
      source: "supplier_table",
    });
    if (sort.key === key) {
      onSort({ key, dir: sort.dir === "desc" ? "asc" : "desc" });
    } else {
      onSort({ key, dir: key === "onTime" || key === "otif" ? "asc" : "desc" });
    }
  };
  return (
    <div className={outerWrap}>
      <div
        className={threshold.tableContainer}
        style={{ maxHeight: threshold.TABLE_MAX_HEIGHT }}
      >
        <table className={threshold.table}>
          <thead>
            <tr className={threshold.theadRow}>
              <th className={threshold.th}>
                <SortHeader
                  label="Vendor"
                  sortKey="vendor"
                  current={sort}
                  onToggle={toggleSort}
                />
              </th>
              <th className={threshold.th}>Materials</th>
              <th className={threshold.thRight}>
                <SortHeader
                  label="Lines"
                  sortKey="lines"
                  current={sort}
                  onToggle={toggleSort}
                />
              </th>
              <th className={threshold.thRight}>
                <SortHeader
                  label="On-time %"
                  sortKey="onTime"
                  current={sort}
                  onToggle={toggleSort}
                />
              </th>
              <th className={threshold.thRight}>
                <SortHeader
                  label="OTIF %"
                  sortKey="otif"
                  current={sort}
                  onToggle={toggleSort}
                />
              </th>
              <th className={threshold.thRight}>
                <SortHeader
                  label="Mean delay (all)"
                  sortKey="meanLate"
                  current={sort}
                  onToggle={toggleSort}
                />
              </th>
              <th className={threshold.thRight}>
                <SortHeader
                  label="Mean delay | late"
                  sortKey="meanLateWhenLate"
                  current={sort}
                  onToggle={toggleSort}
                />
              </th>
              <th className={threshold.thRight}>
                <SortHeader
                  label="Max delay"
                  sortKey="maxLate"
                  current={sort}
                  onToggle={toggleSort}
                />
              </th>
            </tr>
          </thead>
          <tbody className={threshold.tbodyDivide}>
            {sorted.map((value) => {
              const otifColor = colorForOtif(value.otif_pct);
              return (
                <tr
                  key={value.vendor_id ?? value.vendor_name ?? ""}
                  onClick={() => onRowClick(value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      onRowClick(value);
                    }
                  }}
                  tabIndex={0}
                  className={threshold.bodyRow}
                >
                  <td className={threshold.td}>
                    <div className={vendorCell}>
                      <span
                        className={threshold.catDot}
                        style={{ backgroundColor: otifColor }}
                      />

                      <div className={vendorInner}>
                        <div className={vendorName}>
                          {value.vendor_name ?? "—"}
                        </div>
                        {value.vendor_id && (
                          <div className={vendorId}>
                            Vendor {value.vendor_id}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className={threshold.td}>
                    <span className={materials}>
                      {value.materials?.length ?? 0}
                    </span>
                  </td>
                  <td className={cx(threshold.tdRight, threshold.valueStrong)}>
                    {formatNumber(value.n_lines)}
                    {value.n_late > 0 && (
                      <span className={linesLate}>({value.n_late} late)</span>
                    )}
                  </td>
                  <td className={cx(threshold.tdRight, threshold.valueDim)}>
                    {value.on_time_pct != null
                      ? `${formatNumber(value.on_time_pct, { maximumFractionDigits: 0 })}%`
                      : "–"}
                  </td>
                  <td
                    className={cx(threshold.tdRight, threshold.numMedium)}
                    style={{ color: otifColor }}
                  >
                    {value.otif_pct != null
                      ? `${formatNumber(value.otif_pct, { maximumFractionDigits: 0 })}%`
                      : "–"}
                  </td>
                  <td className={cx(threshold.tdRight, threshold.valueDim)}>
                    {value.mean_days_late_all != null
                      ? `${formatNumber(value.mean_days_late_all, { maximumFractionDigits: 1 })}d`
                      : "–"}
                  </td>
                  <td className={cx(threshold.tdRight, threshold.valueDim)}>
                    {value.mean_days_late_when_late != null
                      ? `${formatNumber(value.mean_days_late_when_late, { maximumFractionDigits: 1 })}d`
                      : "–"}
                  </td>
                  <td className={cx(threshold.tdRight, threshold.valueDim)}>
                    {value.max_days_late > 0 ? `${value.max_days_late}d` : "–"}
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className={threshold.emptyCell}>
                  No supplier performance data available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
