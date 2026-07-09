import { css } from "@hashintel/ds-helpers/css";

import { formatNumber } from "./cost";
import { VendorCard, WorstEventsTable } from "./vendor-cards";

import type { ProcurementSupplierBlock } from "./types";

const emptyState = css({ p: "6", textStyle: "sm", color: "fg.subtle" });
const headerStrip = css({
  px: "6",
  py: "4",
  borderBottomWidth: "1px",
  borderBottomStyle: "solid",
  borderBottomColor: "bd.subtle",
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  columnGap: "6",
  rowGap: "2",
  textStyle: "xs",
});
const muted = css({ color: "fg.subtle" });
const strong = css({ fontWeight: "medium", color: "fg.heading" });
const strongNum = css({
  fontWeight: "medium",
  color: "fg.heading",
  fontVariantNumeric: "tabular-nums",
});
const vendorList = css({
  "& > * + *": {
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: "bd.subtle",
  },
});
const lateSection = css({
  borderTopWidth: "1px",
  borderTopStyle: "solid",
  borderTopColor: "bd.subtle",
  p: "6",
  display: "flex",
  flexDirection: "column",
  gap: "3",
});
const lateHead = css({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
});
const lateTitle = css({
  textStyle: "base",
  fontWeight: "medium",
  color: "fg.heading",
});
const lateCount = css({ textStyle: "xs", color: "fg.subtle" });

const emptyStrip = css({
  textStyle: "xs",
  color: "fg.subtle",
  fontStyle: "italic",
});
const singleBox = css({
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  borderRadius: "md",
  bg: "bgSolid.min",
  p: "3",
  textStyle: "xs",
  color: "fg.heading",
});
const singleDash = css({ color: "fg.subtle" });
const singleLate = css({
  fontWeight: "medium",
  color: "status.error.fg.body",
  fontVariantNumeric: "tabular-nums",
});
const singleMeta = css({
  color: "fg.subtle",
  fontVariantNumeric: "tabular-nums",
});
const stripBox = css({
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  borderRadius: "md",
  bg: "bgSolid.min",
  p: "3",
});
const stripInner = css({ display: "flex", flexDirection: "column", gap: "2" });
const laneRow = css({ display: "flex", alignItems: "center", gap: "3" });
const laneLabel = css({
  width: "[7rem]",
  flexShrink: "0",
  textStyle: "xs",
  fontWeight: "medium",
  color: "fg.heading",
  textAlign: "right",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});
const laneTrack = css({ position: "relative", flex: "1", height: "6" });
const laneBaseline = css({
  position: "absolute",
  insetX: "0",
  top: "[50%]",
  height: "[1px]",
  bg: "bg.subtle",
});
const laneDot = css({
  position: "absolute",
  top: "[50%]",
  width: "2.5",
  height: "2.5",
  borderRadius: "full",
  bg: "status.error.bg.shaded",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "status.error.fg.body",
});
const axisRow = css({ display: "flex", alignItems: "center", gap: "3" });
const axisSpacer = css({ width: "[7rem]", flexShrink: "0" });
const axisTrack = css({ position: "relative", flex: "1", height: "4" });
const axisLine = css({
  position: "absolute",
  insetX: "0",
  top: "0",
  height: "[1px]",
  bg: "bd.subtle",
});
const axisTick = css({
  position: "absolute",
  top: "0",
  textStyle: "xxs",
  color: "fg.subtle",
  fontVariantNumeric: "tabular-nums",
});
const axisTickMark = css({
  display: "block",
  width: "[1px]",
  height: "1",
  bg: "fg.subtle",
  mx: "auto",
});
const axisTickLabel = css({ mt: "0.5", display: "block" });
const footnote = css({
  textStyle: "xs",
  color: "fg.subtle",
  mt: "2",
  fontStyle: "italic",
});

interface Props {
  block: ProcurementSupplierBlock;
  windowLabel?: string;
}

function niceAxisMax(maxDays: number): number {
  // Bottom out at 8 so a single small late event still has a meaningful axis,
  // and force an even number so the midpoint label is an integer that matches
  // its physical position on the axis.
  const candidate = Math.max(Math.ceil(maxDays), 8);
  return candidate % 2 === 0 ? candidate : candidate + 1;
}
function truncate(step: string, count: number): string {
  if (step.length <= count) {
    return step;
  }
  return `${step.slice(0, count - 1)}…`;
}
const LateEventsStrip = ({ events }: { events: LateEvent[] }) => {
  const late = events.filter((event) => event.days_late > 0);
  if (late.length === 0) {
    return <p className={emptyStrip}>No late events.</p>;
  }
  const max = Math.max(...late.map((event) => event.days_late));
  const axisMax = niceAxisMax(max);
  const ticks = [0, axisMax / 2, axisMax]; // Single late event -> labelled one-liner; the strip plot only really
  // earns its space when there are multiple dots to compare.
  if (late.length === 1) {
    const event = late[0];
    if (!event) {
      return <p className={emptyStrip}>No late events.</p>;
    }
    return (
      <div className={singleBox}>
        <span className={css({ fontWeight: "medium" })}>
          {truncate(event.vendor_name ?? "—", 32)}
        </span>
        <span className={singleDash}> — </span>
        <span className={singleLate}>{event.days_late}d late</span>
        {(event.promised_date || event.first_gr_date) && (
          <span className={singleMeta}>
            {" "}
            (promised {event.promised_date ?? "?"}, GR{" "}
            {event.first_gr_date ?? "?"})
          </span>
        )}
      </div>
    );
  } // Group dots into vendor lanes (or a single lane).
  const vendorIds = Array.from(
    new Set(late.map((event) => event.vendor_id ?? "—")),
  );
  const lanes = vendorIds.map((vid) => ({
    vid,
    name:
      late.find((event) => (event.vendor_id ?? "—") === vid)?.vendor_name ??
      "—",
    events: late.filter((event) => (event.vendor_id ?? "—") === vid),
  }));
  return (
    <div
      className={stripBox}
      role="img"
      aria-label="Strip plot of late deliveries by vendor (x-axis: days late)"
    >
      <div className={stripInner}>
        {lanes.map((lane) => (
          <div key={lane.vid} className={laneRow}>
            <div className={laneLabel} title={lane.name}>
              {truncate(lane.name, 18)}
            </div>
            <div className={laneTrack}>
              {/* axis baseline */}
              <div className={laneBaseline} />
              {lane.events.map((event) => {
                const leftPct = (event.days_late / axisMax) * 100;
                const key = `${event.vendor_id ?? "-"}-${event.promised_date ?? ""}-${event.first_gr_date ?? ""}-${event.days_late}`;
                return (
                  <div
                    key={key}
                    className={laneDot}
                    style={{
                      left: `${leftPct}%`,
                      transform: "translate(-50%, -50%)",
                    }}
                    title={`${event.days_late}d late - promised ${event.promised_date ?? "?"}, GR ${event.first_gr_date ?? "?"}`}
                  />
                );
              })}
            </div>
          </div>
        ))}
        {/* axis labels row, aligned to the lane width */}
        <div className={axisRow}>
          <div className={axisSpacer} />
          <div className={axisTrack}>
            <div className={axisLine} />
            {ticks.map((tick) => (
              <div
                key={tick}
                className={axisTick}
                style={{
                  left: `${(tick / axisMax) * 100}%`,
                  transform: "translateX(-50%)",
                }}
              >
                <span className={axisTickMark} />
                <span className={axisTickLabel}>{tick}d</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className={footnote}>
        Each dot is one late schedule line; x-axis is days vs the
        supplier-promised date.
      </p>
    </div>
  );
};
export const SupplierDimensionView = ({ block, windowLabel }: Props) => {
  const vendors = block.vendors;
  const worstEvents = block.worst_events ?? [];
  if (!vendors.length || block.n_lines === 0) {
    return (
      <div className={emptyState}>
        {windowLabel
          ? `No measurable supplier OTIF lines for this material in the selected window (${windowLabel.toLowerCase()}).`
          : "No measurable supplier OTIF lines for this material."}
      </div>
    );
  }
  return (
    <div>
      {/* Header strip with primary vendor / coverage / caveat */}
      <div className={headerStrip}>
        {block.primary_vendor?.name && (
          <span>
            <span className={muted}>Primary vendor</span>{" "}
            <span className={strong}>{block.primary_vendor.name}</span>
            {block.primary_vendor.id && (
              <span className={muted}> ({block.primary_vendor.id})</span>
            )}
          </span>
        )}
        <span>
          <span className={muted}>Measured lines</span>{" "}
          <span className={strongNum}>{formatNumber(block.n_lines)}</span>
          {windowLabel && (
            <span className={muted}> ({windowLabel.toLowerCase()})</span>
          )}
        </span>
        {block.coverage_pct != null && (
          <span>
            <span className={muted}>Schedule coverage</span>{" "}
            <span className={strongNum}>
              {formatNumber(block.coverage_pct, { maximumFractionDigits: 0 })}%
            </span>
          </span>
        )}
        <span className={muted}>
          Tolerance:{" "}
          <span className={css({ color: "fg.heading" })}>
            0d on-time / 5% in-full
          </span>
        </span>
      </div>

      {/* Vendor cards */}
      <div className={vendorList}>
        {vendors.map((value) => (
          <VendorCard
            key={(value.vendor_id ?? "") + (value.vendor_name ?? "")}
            vendor={value}
          />
        ))}
      </div>

      {/* Strip plot of late events */}
      {worstEvents.length > 0 && (
        <div className={lateSection}>
          <div className={lateHead}>
            <h3 className={lateTitle}>Late events</h3>
            <span className={lateCount}>
              Top {worstEvents.length} by days late
            </span>
          </div>
          <LateEventsStrip events={worstEvents} />
          <WorstEventsTable events={worstEvents.slice(0, 5)} />
        </div>
      )}
    </div>
  );
};
interface LateEvent {
  days_late: number;
  vendor_name: string | null;
  vendor_id: string | null;
  promised_date: string | null;
  first_gr_date: string | null;
}
