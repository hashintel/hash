import { Tooltip } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { formatNumber } from "./cost";

import type { VendorOtifStats } from "./types";

const cardWrap = css({
  px: "6",
  py: "5",
  display: "flex",
  flexDirection: "column",
  gap: "4",
});
const cardHead = css({
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "6",
});
const headMain = css({ minWidth: "0" });
const vendorName = css({
  textStyle: "sm",
  fontWeight: "medium",
  color: "fg.heading",
});
const vendorId = css({
  textStyle: "xs",
  color: "fg.subtle",
  fontVariantNumeric: "tabular-nums",
});
const vendorLines = css({ textStyle: "xs", color: "fg.subtle", mt: "0.5" });
const headRight = css({ textAlign: "right", flexShrink: "0" });
const otifValue = css({
  textStyle: "3xl",
  fontWeight: "semibold",
  fontVariantNumeric: "tabular-nums",
  lineHeight: "none",
});
const otifNeutral = css({ color: "fg.muted" });
const otifGood = css({ color: "status.success.fg.body" });
const otifWarn = css({ color: "status.warning.fg.body" });
const otifBad = css({ color: "status.error.fg.body" });
const otifLabel = css({ textStyle: "xs", color: "fg.subtle", mt: "1" });
const metricGrid = css({
  display: "grid",
  gridTemplateColumns: "[repeat(4, minmax(0, 1fr))]",
  columnGap: "6",
  rowGap: "2",
  textStyle: "xs",
});
const metricStack = css({
  display: "flex",
  flexDirection: "column",
  gap: "0.5",
});
const metricValue = css({
  textStyle: "sm",
  fontWeight: "medium",
  fontVariantNumeric: "tabular-nums",
});
const metricValueStrong = css({ color: "fg.heading" });
const metricValueMuted = css({ color: "fg.muted" });
const metricLabel = css({
  textStyle: "xxs",
  color: "fg.subtle",
  textTransform: "uppercase",
  letterSpacing: "[0.025em]",
});
const cursorHelp = css({ cursor: "help" });

const tableShell = css({
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  borderRadius: "md",
  overflow: "hidden",
});
const tableEl = css({ width: "full", textStyle: "xs", lineHeight: "normal" });
const headRow = css({
  textAlign: "left",
  color: "fg.subtle",
  bg: "bg.surface",
  borderBottomWidth: "1px",
  borderBottomStyle: "solid",
  borderBottomColor: "bd.subtle",
});
const th = css({ px: "3", py: "2", fontWeight: "medium" });
const thRight = css({
  px: "3",
  py: "2",
  fontWeight: "medium",
  textAlign: "right",
});
const bodyRow = css({
  borderTopWidth: "1px",
  borderTopStyle: "solid",
  borderTopColor: "bd.subtle",
  _hover: { bg: "bg.surface" },
});
const tdName = css({ px: "3", py: "1.5", color: "fg.heading" });
const tdMuted = css({
  px: "3",
  py: "1.5",
  fontVariantNumeric: "tabular-nums",
  color: "fg.muted",
});
const tdMutedRight = css({
  px: "3",
  py: "1.5",
  fontVariantNumeric: "tabular-nums",
  color: "fg.muted",
  textAlign: "right",
});
const tdLate = css({
  px: "3",
  py: "1.5",
  fontVariantNumeric: "tabular-nums",
  fontWeight: "medium",
  color: "status.error.fg.body",
  textAlign: "right",
});

const Metric = ({
  label,
  value,
  tooltip,
  muted,
}: {
  label: string;
  value: string;
  tooltip?: string;
  muted?: boolean;
}) => {
  const content = (
    <div className={metricStack}>
      <div
        className={cx(
          metricValue,
          muted ? metricValueMuted : metricValueStrong,
        )}
      >
        {value}
      </div>
      <div className={metricLabel}>{label}</div>
    </div>
  );

  if (!tooltip) {
    return content;
  }
  return (
    <Tooltip content={tooltip} openDelay="fast">
      <div className={cursorHelp}>{content}</div>
    </Tooltip>
  );
};

function fmtPct(value: number | null | undefined): string {
  if (value == null) {
    return "–";
  }
  return `${formatNumber(value, { maximumFractionDigits: 0 })}%`;
}

function fmtDays(value: number | null | undefined): string {
  if (value == null) {
    return "–";
  }
  return `${formatNumber(value, { maximumFractionDigits: 1 })}d`;
}
export const VendorCard = ({ vendor }: { vendor: VendorOtifStats }) => {
  const otif = vendor.otif_pct;
  const otifColorClass =
    otif == null
      ? otifNeutral
      : otif >= 95
        ? otifGood
        : otif >= 80
          ? otifWarn
          : otifBad;
  return (
    <div className={cardWrap}>
      <div className={cardHead}>
        <div className={headMain}>
          <div className={vendorName}>{vendor.vendor_name ?? "—"}</div>
          {vendor.vendor_id && (
            <div className={vendorId}>Vendor {vendor.vendor_id}</div>
          )}
          <div className={vendorLines}>
            {formatNumber(vendor.n_lines)} lines · {formatNumber(vendor.n_late)}{" "}
            late
          </div>
        </div>
        <div className={headRight}>
          <div className={cx(otifValue, otifColorClass)}>
            {otif != null
              ? `${formatNumber(otif, { maximumFractionDigits: 0 })}%`
              : "–"}
          </div>
          <div className={otifLabel}>OTIF</div>
        </div>
      </div>

      <div className={metricGrid}>
        <Metric label="On-time" value={fmtPct(vendor.on_time_pct)} />
        <Metric
          label="In-full"
          value={fmtPct(vendor.in_full_pct)}
          tooltip="Computed against scheduled quantity with 5% under-tolerance. Read with caution: received quantity is often auto-stamped at goods receipt rather than measured."
          muted
        />

        <Metric
          label="Mean delay (all)"
          value={fmtDays(vendor.mean_days_late_all)}
          tooltip="Average days late across every delivery, treating on-time/early as 0. Reads as expected delay per delivery (frequency x severity)."
        />

        <Metric
          label="Mean delay | late"
          value={fmtDays(vendor.mean_days_late_when_late)}
          tooltip={`When this vendor is late, how late? Conditional on the ${vendor.n_late} late delivery(ies).`}
        />

        <Metric
          label="Median delay | late"
          value={fmtDays(vendor.median_days_late_when_late)}
        />

        <Metric label="Max delay" value={fmtDays(vendor.max_days_late)} />
        <Metric
          label="Fill rate"
          value={fmtPct(vendor.fill_rate_pct)}
          tooltip="GR qty / scheduled qty across all measured lines."
        />
      </div>
    </div>
  );
};
export const WorstEventsTable = ({
  events,
}: {
  events: Array<{
    po_number: string | null;
    po_item: string | null;
    po_date: string | null;
    promised_date: string | null;
    first_gr_date: string | null;
    days_late: number;
    vendor_name: string | null;
    sched_qty: number | null;
    gr_qty_to_date: number | null;
  }>;
}) => {
  if (events.length === 0) {
    return null;
  }
  return (
    <div className={tableShell}>
      <table className={tableEl}>
        <thead>
          <tr className={headRow}>
            <th className={th}>Vendor</th>
            <th className={th}>PO</th>
            <th className={th}>Promised</th>
            <th className={th}>First GR</th>
            <th className={thRight}>Days late</th>
            <th className={thRight}>Sched qty</th>
            <th className={thRight}>GR qty</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr
              key={`${event.po_number ?? ""}-${event.po_item ?? ""}-${event.first_gr_date ?? ""}-${event.days_late}`}
              className={bodyRow}
            >
              <td className={tdName}>{event.vendor_name ?? "—"}</td>
              <td className={tdMuted}>
                {event.po_number ?? "—"}
                {event.po_item ? `/${event.po_item}` : ""}
              </td>
              <td className={tdMuted}>{event.promised_date ?? "—"}</td>
              <td className={tdMuted}>{event.first_gr_date ?? "—"}</td>
              <td className={tdLate}>+{event.days_late}d</td>
              <td className={tdMutedRight}>
                {event.sched_qty != null
                  ? formatNumber(event.sched_qty, { maximumFractionDigits: 1 })
                  : "—"}
              </td>
              <td className={tdMutedRight}>
                {event.gr_qty_to_date != null
                  ? formatNumber(event.gr_qty_to_date, {
                      maximumFractionDigits: 1,
                    })
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
