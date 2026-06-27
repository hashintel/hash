import { css, cx } from "@hashintel/ds-helpers/css";

import { formatNumber } from "../cost";
import { DeltaIcon } from "./step-detail-primitives";

import type { PeriodComparison } from "../period-trends";
import type {
  StepDetail as StepDetailType,
  StepStats,
  ConsumptionData,
} from "../types";

const wrap = css({ display: "flex", flexDirection: "column", gap: "3" });
const card = css({
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  borderRadius: "lg",
  overflow: "hidden",
  bg: "bgSolid.min",
});
const cardRow = css({ display: "flex" });
const cell = css({
  flex: "1",
  p: "3",
  borderRightWidth: "1px",
  borderRightStyle: "solid",
  borderRightColor: "bd.subtle",
});
const cellEnd = css({
  flex: "1",
  p: "3",
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
});
const label = css({
  textStyle: "xs",
  fontWeight: "medium",
  color: "fg.muted",
  letterSpacing: "[0.12px]",
  mb: "2.5",
});
const valueRow = css({ display: "flex", alignItems: "center", gap: "1.5" });
const valueRowRel = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  position: "relative",
});
const valueBase = css({
  textStyle: "base",
  fontWeight: "medium",
  fontVariantNumeric: "tabular-nums",
  lineHeight: "[20px]",
});
const valueDanger = css({ color: "status.error.fg.body" });
const valueMutedStrong = css({ color: "fg.muted" });
const valueStrong = css({ color: "fg.max" });
const valueTeal = css({ color: "[#12a594]" });
const valueMuted = css({
  textStyle: "base",
  fontWeight: "medium",
  color: "fg.subtle",
});
const footNote = css({
  textStyle: "xs",
  fontWeight: "medium",
  color: "fg.muted",
  letterSpacing: "[0.12px]",
});

const badgeBase = css({
  position: "absolute",
  right: "0",
  bottom: "0",
  display: "inline-flex",
  alignItems: "center",
  textStyle: "xs",
  fontWeight: "medium",
  borderRadius: "sm",
  px: "1.5",
  h: "4",
  lineHeight: "[11px]",
  borderWidth: "1px",
  borderStyle: "solid",
});
const badgeDanger = css({
  bg: "status.error.bg.subtle",
  color: "status.error.fg.body",
  borderColor: "status.error.bd.subtle",
});
const badgeNeutral = css({
  bg: "bg.subtle",
  color: "fg.muted",
  borderColor: "bd.subtle",
});
const badgeSuccess = css({
  bg: "status.success.bg.subtle",
  color: "status.success.fg.body",
  borderColor: "status.success.bd.subtle",
});

const callout = css({
  borderRadius: "lg",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "status.warning.bd.subtle",
  bg: "status.warning.bg.subtle",
  p: "3",
});
const calloutText = css({
  textStyle: "xs",
  fontWeight: "medium",
  color: "status.warning.fg.body",
  mb: "1.5",
});
const chipRow = css({ display: "flex", flexWrap: "wrap", gap: "1.5" });
const chip = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  borderRadius: "sm",
  px: "1.5",
  h: "5",
  textStyle: "xs",
  fontWeight: "medium",
  bg: "bgSolid.min",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "status.warning.bd.subtle",
  color: "status.warning.fg.body",
});
const chipCount = css({ color: "status.warning.fg.body", opacity: "0.75" });

const pickerRow = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  flexWrap: "wrap",
});
const pill = css({
  px: "2.5",
  py: "1",
  textStyle: "xs",
  fontWeight: "medium",
  borderRadius: "md",
  transition: "colors",
  cursor: "pointer",
});
const pillIcon = css({
  px: "2.5",
  py: "1",
  textStyle: "xs",
  fontWeight: "medium",
  borderRadius: "md",
  transition: "colors",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
});
const pillActive = css({ bg: "neutral.s120", color: "neutral.s00" });
const pillInactive = css({
  bg: "bg.subtle",
  color: "fg.muted",
  _hover: { color: "fg.heading" },
});
const dot = css({ width: "1.5", height: "1.5", borderRadius: "full" });
const dotActive = css({ bg: "status.warning.bg.solid" });
const dotInactive = css({ bg: "status.warning.fg.body" });

export const ConsumptionMetricsRow = ({
  stats,
  components,
  weightedVariance,
  aggregate,
  selectedComponent,
  onSelectComponent,
  comparison,
}: {
  stats: StepStats;
  components: StepDetailType["consumption_data"] extends infer T
    ? T extends { components: infer C }
      ? C
      : never[]
    : never[];
  weightedVariance: number | null;
  aggregate: ConsumptionData["aggregate"] | null;
  selectedComponent: string | null;
  onSelectComponent: (mat: string | null) => void;
  comparison: PeriodComparison | null;
}) => {
  const primaryValue = selectedComponent ? stats.median : weightedVariance;
  const overConsuming = primaryValue != null && primaryValue > 0;
  const belowExpected = primaryValue != null && primaryValue < 0;
  const metricLabel = selectedComponent
    ? "Median in-range variance vs plan"
    : "Weighted consumption vs plan";
  const selectedComponentData = selectedComponent
    ? components.find((column) => column.material === selectedComponent)
    : null;
  const reconciliationEvents =
    selectedComponentData?.n_reconciliation_events ?? 0;
  const varianceOutliers = selectedComponentData?.n_variance_outliers ?? 0;

  const offBomMaterials = new Set(
    components
      .filter((column) => column.in_current_bom === false)
      .map((column) => column.material),
  );

  const nOrders = aggregate?.n_orders ?? 0;
  const nOffBom = aggregate?.n_orders_off_bom ?? 0;
  const nPnc = aggregate?.n_orders_planned_not_consumed ?? 0;
  const nSub = aggregate?.n_orders_substitution ?? 0;
  const offBomComponents = aggregate?.off_bom_components ?? [];
  const showOffBomCallout = !selectedComponent && nOffBom > 0;

  return (
    <div className={wrap}>
      <div className={card}>
        <div className={cardRow}>
          <div className={cell}>
            <div className={label}>{metricLabel}</div>
            <div className={valueRowRel}>
              <span
                className={cx(
                  valueBase,
                  overConsuming
                    ? valueDanger
                    : belowExpected
                      ? valueMutedStrong
                      : valueStrong,
                )}
              >
                {primaryValue != null
                  ? `${primaryValue > 0 ? "+" : ""}${formatNumber(primaryValue, { maximumFractionDigits: 1 })}%`
                  : "–"}
              </span>
              {primaryValue != null && (
                <span
                  className={cx(
                    badgeBase,
                    overConsuming
                      ? badgeDanger
                      : belowExpected
                        ? badgeNeutral
                        : badgeSuccess,
                  )}
                >
                  {overConsuming
                    ? "over expected"
                    : belowExpected
                      ? "below expected"
                      : "on expected"}
                </span>
              )}
            </div>
          </div>

          <div className={cell}>
            <div className={label}>vs Previous period</div>
            <div className={valueRow}>
              {comparison?.medianPctChange != null ? (
                <>
                  <DeltaIcon value={comparison.medianPctChange} />
                  <span
                    className={cx(
                      valueBase,
                      comparison.medianPctChange > 0 ? valueDanger : valueTeal,
                    )}
                  >
                    {comparison.medianPctChange > 0 ? "+" : ""}
                    {formatNumber(comparison.medianPctChange, {
                      maximumFractionDigits: 0,
                    })}
                    %
                  </span>
                </>
              ) : (
                <span className={valueMuted}>–</span>
              )}
            </div>
          </div>

          <div className={cellEnd}>
            <span className={footNote}>
              {selectedComponentData ? (
                <>
                  {formatNumber(stats.n)} variance events
                  {" · "}
                  {formatNumber(reconciliationEvents)} reconciliation rows
                  {varianceOutliers > 0 && (
                    <>
                      {" · "}
                      {formatNumber(varianceOutliers)} variance outlier
                      {varianceOutliers === 1 ? "" : "s"}
                    </>
                  )}
                </>
              ) : (
                <>
                  {formatNumber(components.length)} components &middot;{" "}
                  {formatNumber(stats.n)} events
                </>
              )}
            </span>
          </div>
        </div>
      </div>

      {selectedComponentData && stats.n === 0 && reconciliationEvents > 0 && (
        <div className={callout}>
          <div className={calloutText}>
            {formatNumber(reconciliationEvents)} reconciliation row
            {reconciliationEvents === 1 ? "" : "s"} found, but no in-range
            matched variance events. Planned-not-consumed, off-BOM, unplanned,
            or outlier rows are shown in the data table instead.
          </div>
        </div>
      )}

      {/* Off-BOM / substitution callout. The headline above is plan-adherence
           (planned vs actual over matched components); off-BOM usage,
           substitutions and planned-not-consumed are surfaced separately. */}
      {showOffBomCallout && (
        <div className={callout}>
          <div className={calloutText}>
            {formatNumber(nOffBom)} of {formatNumber(nOrders)} orders used
            components outside the current BOM
            {nSub > 0 && (
              <>
                {" "}
                &middot; {formatNumber(nSub)} likely substitution
                {nSub === 1 ? "" : "s"}
              </>
            )}
            {nPnc > 0 && (
              <> &middot; {formatNumber(nPnc)} with planned-not-consumed</>
            )}
          </div>
          {offBomComponents.length > 0 && (
            <div className={chipRow}>
              {offBomComponents.slice(0, 6).map((oc) => (
                <span key={oc.material} className={chip}>
                  {oc.name}
                  <span className={chipCount}>
                    &times;{formatNumber(oc.n_orders)}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Component selector */}
      {components.length > 0 && (
        <div className={pickerRow}>
          <button
            type="button"
            onClick={() => onSelectComponent(null)}
            className={cx(
              pill,
              selectedComponent === null ? pillActive : pillInactive,
            )}
          >
            All components
          </button>
          {components.map((column) => {
            const isOffBom = offBomMaterials.has(column.material);
            return (
              <button
                key={column.material}
                type="button"
                onClick={() => onSelectComponent(column.material)}
                title={
                  isOffBom ? "Consumed outside the current BOM" : undefined
                }
                className={cx(
                  pillIcon,
                  selectedComponent === column.material
                    ? pillActive
                    : pillInactive,
                )}
              >
                {isOffBom && (
                  <span
                    className={cx(
                      dot,
                      selectedComponent === column.material
                        ? dotActive
                        : dotInactive,
                    )}
                  />
                )}
                {column.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
