import { useEffect, useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  ResponsiveContainer,
} from "recharts";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { chartTheme } from "../../shared/chart-theme";
import { formatNumber } from "../../shared/cost";
import { fetchSupplierPerformance } from "../../shared/data";
import { LoadingState } from "../../shared/load-state";
import { SlideOver, SlideOverClose } from "../../shared/slide-over";
import { recomputeSitePerformance } from "../../shared/supplier-otif";
import { VendorCard, WorstEventsTable } from "../../shared/vendor-cards";

import type { TimeRange } from "../../shared/time-range";
import type {
  SiteSupplierPerformance,
  VendorOtifStats,
} from "../../shared/types";

const header = css({
  borderBottomWidth: "1px",
  borderColor: "bd.subtle",
  p: "6",
});
const headerRow = css({
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
});
const headerMain = css({ flex: "1", minW: "0" });
// Bottom spacing only — the back control itself is now a ds `Button` (linkSubtle).
const backLink = css({ mb: "2" });
const title = css({
  fontFamily: "display",
  textStyle: "2xl",
  fontWeight: "medium",
  color: "fg.heading",
  lineHeight: "[30px]",
});
const subId = css({
  textStyle: "sm",
  color: "fg.subtle",
  mt: "1",
  fontVariantNumeric: "tabular-nums",
});
const subWindow = css({ ml: "2", color: "fg.subtle" });
const loadingH = css({ h: "32" });
const emptyMsg = css({ p: "6", textStyle: "sm", color: "fg.subtle" });
const section = css({
  borderTopWidth: "1px",
  borderColor: "bd.subtle",
  p: "6",
  display: "flex",
  flexDirection: "column",
  gap: "3",
});
const sectionTitle = css({
  textStyle: "base",
  fontWeight: "medium",
  color: "fg.heading",
});

const mbtContainer = css({
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  borderRadius: "md",
  overflow: "hidden",
});
const mbtTable = css({ w: "full", textStyle: "sm", lineHeight: "normal" });
const mbtHeadRow = css({
  textAlign: "left",
  color: "fg.subtle",
  bg: "bg.subtle",
  borderBottomWidth: "1px",
  borderColor: "bd.subtle",
});
const mbtTh = css({ px: "3", py: "2", fontWeight: "medium" });
const mbtThRight = css({
  px: "3",
  py: "2",
  fontWeight: "medium",
  textAlign: "right",
});
const mbtBody = css({
  "& > tr": { borderTopWidth: "1px", borderColor: "[#f0f0f0]" },
  "& > tr:first-child": { borderTopWidth: "0" },
});
const mbtRow = css({ _hover: { bg: "bg.subtle" } });
const mbtTdName = css({ px: "3", py: "2", color: "fg.heading" });
const mbtTdNum = css({
  px: "3",
  py: "2",
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
  color: "fg.muted",
});
const mbtTdStrong = css({
  px: "3",
  py: "2",
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
  fontWeight: "medium",
  color: "fg.heading",
});
const chartWrap = css({ h: "48" });

interface VendorDetailPanelProps {
  vendorId: string;
  onClose: () => void;
  dateRange?: TimeRange;
  windowLabel?: string;
}

const MaterialBreakdownTable = ({
  materials,
}: {
  materials: NonNullable<VendorOtifStats["materials"]>;
}) => {
  return (
    <div className={mbtContainer}>
      <table className={mbtTable}>
        <thead>
          <tr className={mbtHeadRow}>
            <th className={mbtTh}>Material</th>
            <th className={mbtThRight}>Lines</th>
            <th className={mbtThRight}>On-time %</th>
            <th className={mbtThRight}>OTIF %</th>
          </tr>
        </thead>
        <tbody className={mbtBody}>
          {materials.map((month) => (
            <tr key={month.matnr} className={mbtRow}>
              <td className={mbtTdName}>{month.name}</td>
              <td className={mbtTdNum}>{formatNumber(month.n_lines)}</td>
              <td className={mbtTdNum}>
                {month.on_time_pct != null
                  ? `${formatNumber(month.on_time_pct, { maximumFractionDigits: 0 })}%`
                  : "—"}
              </td>
              <td className={mbtTdStrong}>
                {month.otif_pct != null
                  ? `${formatNumber(month.otif_pct, { maximumFractionDigits: 0 })}%`
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const MonthlyTrendChart = ({
  monthly,
}: {
  monthly: NonNullable<VendorOtifStats["monthly"]>;
}) => {
  const points = monthly.map((month) => ({
    month: month.month,
    on_time_pct: month.on_time_pct,
    n: month.n,
  }));
  return (
    <div className={chartWrap}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={points}
          margin={{ top: 8, right: 12, left: 0, bottom: 5 }}
        >
          <XAxis
            dataKey="month"
            tick={{ fontSize: 10, fill: chartTheme.axis.tick }}
            tickLine={false}
            axisLine={{ stroke: chartTheme.axis.line }}
          />

          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: chartTheme.axis.tick }}
            tickFormatter={(value: number) => `${value}%`}
            tickLine={false}
            axisLine={false}
            width={36}
          />

          <RTooltip
            wrapperStyle={{ zIndex: 9999 }}
            contentStyle={{
              fontSize: 12,
              border: `1px solid ${chartTheme.tooltip.border}`,
              borderRadius: 6,
            }}
            formatter={(value, _name, item) => {
              const value2 = typeof value === "number" ? value : Number(value);
              const count =
                (item as { payload?: { n?: number } } | undefined)?.payload
                  ?.n ?? 0;
              return [
                `${formatNumber(value2, { maximumFractionDigits: 0 })}% (n=${count})`,
                "On-time",
              ];
            }}
          />

          <Line
            type="monotone"
            dataKey="on_time_pct"
            stroke={chartTheme.series.success}
            strokeWidth={2}
            dot={{ r: 3, fill: chartTheme.series.success }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
export const VendorDetailPanel = ({
  vendorId,
  onClose,
  dateRange,
  windowLabel,
}: VendorDetailPanelProps) => {
  const [data, setData] = useState<SiteSupplierPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    void fetchSupplierPerformance()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);
  const windowed = useMemo<SiteSupplierPerformance | null>(() => {
    if (!data) {
      return null;
    }
    return recomputeSitePerformance(data, dateRange);
  }, [data, dateRange]);
  const vendor = useMemo<VendorOtifStats | null>(() => {
    if (!windowed) {
      return null;
    }
    return (
      windowed.vendors.find((value) => value.vendor_id === vendorId) ?? null
    );
  }, [windowed, vendorId]); // Fallback to the unfiltered vendor record so we can show the name even
  // when the windowed view has zero lines for this vendor.
  const fallbackVendor = useMemo<VendorOtifStats | null>(() => {
    if (!data) {
      return null;
    }
    return data.vendors.find((value) => value.vendor_id === vendorId) ?? null;
  }, [data, vendorId]);
  const headerVendor = vendor ?? fallbackVendor;
  const hasWindowedData = vendor !== null && vendor.n_lines > 0;
  return (
    <SlideOver onClose={onClose} label="Vendor detail">
      {/* Header */}
      <div className={header}>
        <div className={headerRow}>
          <div className={headerMain}>
            <SlideOverClose>
              {(close) => (
                <Button
                  variant="linkSubtle"
                  tone="neutral"
                  size="xs"
                  iconName="chevronLeft"
                  onClick={close}
                  className={backLink}
                >
                  Back to overview
                </Button>
              )}
            </SlideOverClose>
            <h2 className={title}>
              {headerVendor?.vendor_name ?? "Loading vendor..."}
            </h2>
            {headerVendor?.vendor_id && (
              <p className={subId}>
                Vendor {headerVendor.vendor_id}
                {windowLabel && (
                  <span className={subWindow}>
                    · {windowLabel.toLowerCase()}
                  </span>
                )}
              </p>
            )}
          </div>
          <SlideOverClose>
            {(close) => (
              <Button
                variant="ghost"
                tone="neutral"
                size="sm"
                iconName="close"
                aria-label="Close"
                onClick={close}
              />
            )}
          </SlideOverClose>
        </div>
      </div>

      {/* Body */}
      <div>
        {loading && (
          <LoadingState
            message="Loading vendor performance..."
            className={loadingH}
          />
        )}
        {!loading && !headerVendor && (
          <div className={emptyMsg}>
            Vendor not found in the supplier performance dataset.
          </div>
        )}
        {!loading && headerVendor && !hasWindowedData && (
          <div className={emptyMsg}>
            {windowLabel
              ? `No measurable lines for this vendor in the selected window (${windowLabel.toLowerCase()}).`
              : "No measurable lines for this vendor."}
          </div>
        )}
        {!loading && vendor && hasWindowedData && (
          <>
            {/* Vendor card (reused from SupplierDimensionView) */}
            <VendorCard vendor={vendor} />

            {/* Material breakdown */}
            {vendor.materials && vendor.materials.length > 0 && (
              <div className={section}>
                <h3 className={sectionTitle}>Materials supplied</h3>
                <MaterialBreakdownTable materials={vendor.materials} />
              </div>
            )}

            {/* Monthly on-time % */}
            {vendor.monthly && vendor.monthly.length > 0 && (
              <div className={section}>
                <h3 className={sectionTitle}>Monthly on-time %</h3>
                <MonthlyTrendChart monthly={vendor.monthly} />
              </div>
            )}

            {/* Worst events */}
            {vendor.worst_events && vendor.worst_events.length > 0 && (
              <div className={section}>
                <h3 className={sectionTitle}>Worst late events</h3>
                <WorstEventsTable events={vendor.worst_events} />
              </div>
            )}
          </>
        )}
      </div>
    </SlideOver>
  );
};
