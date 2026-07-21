import { useMemo } from "react";

import { css, cx } from "@hashintel/ds-helpers/css";

import { isDwellType } from "../categories";
import {
  useCostParams,
  computePeriodCost,
  formatCost,
  formatNumber,
} from "../cost";
import { useBaseMeasure, selectStat, MEASURE_LABELS } from "../measure-context";
import { type PeriodComparison, computeCostComparison } from "../period-trends";
import { planSourceLabel } from "../planning-param";
import { useProcurementBasis } from "../procurement-basis-context";
import { procurementPlanningTooltipLines } from "../procurement-planning-ui";
import { previousPeriodLabel } from "./step-detail-format";
import {
  PlanningAssumptionCell,
  DeltaWithTooltip,
} from "./step-detail-primitives";

import type { BaseMeasure } from "../measure-context";
import type { TimeRange } from "../time-range";
import type { StepDetail as StepDetailType } from "../types";

const card = css({
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  borderRadius: "lg",
  overflow: "hidden",
  bg: "bgSolid.min",
});
const cardRow = css({ display: "flex" });
// All cells top-align with the same label margin so the value rows line up
// across the row regardless of which cells carry badges/deltas.
const cellCenter = css({
  flex: "1",
  p: "3",
  borderRightWidth: "1px",
  borderRightStyle: "solid",
  borderRightColor: "bd.subtle",
  display: "flex",
  flexDirection: "column",
});
const cellPlain = css({ flex: "1", p: "3" });
const label = css({
  textStyle: "xs",
  fontWeight: "medium",
  color: "fg.muted",
  letterSpacing: "[0.12px]",
  mb: "2.5",
});
const labelWide = css({
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
const valueStrong = css({ color: "fg.max" });
const valueMuted = css({
  textStyle: "base",
  fontWeight: "medium",
  color: "fg.subtle",
});
const badge = css({
  textStyle: "xs",
  fontWeight: "medium",
  color: "status.error.fg.body",
  bg: "status.error.bg.subtle",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "status.error.bd.subtle",
  borderRadius: "sm",
  px: "1.5",
  h: "4",
  lineHeight: "[11px]",
  display: "inline-flex",
  alignItems: "center",
});
const absDelta = css({ position: "absolute", right: "0", bottom: "0" });
const badgeNeutral = css({
  textStyle: "xs",
  fontWeight: "medium",
  color: "fg.subtle",
  bg: "bgSolid.min",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  borderRadius: "sm",
  px: "1.5",
  h: "4",
  lineHeight: "[11px]",
  display: "inline-flex",
  alignItems: "center",
});
const policyCard = css({
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  borderRadius: "lg",
  overflow: "hidden",
  bg: "bgSolid.min",
});
const policyRow = css({ display: "flex" });
const policyCell = css({
  flex: "1",
  p: "3",
  borderRightWidth: "1px",
  borderRightStyle: "solid",
  borderRightColor: "bd.subtle",
  _last: { borderRightWidth: "0" },
});
const policyWarnings = css({
  borderTopWidth: "1px",
  borderTopStyle: "solid",
  borderTopColor: "bd.subtle",
  px: "3",
  py: "2",
  textStyle: "xs",
  color: "status.warning.fg.body",
});

const policyQuantity = (value: number, uom: string | null): string => {
  const quantity = formatNumber(value, { maximumFractionDigits: 3 });
  return uom ? `${quantity} ${uom}` : quantity;
};

export const InventoryPolicyRow = ({ step }: { step: StepDetailType }) => {
  const policy = step.inventory_policy;
  if (!policy) {
    return null;
  }

  const cells = [
    policy.minimum_order_qty != null
      ? {
          label: "Minimum order quantity",
          value: policyQuantity(policy.minimum_order_qty, policy.order_uom),
        }
      : null,
    policy.order_multiple_qty != null
      ? {
          label: "Order multiple",
          value: policyQuantity(policy.order_multiple_qty, policy.order_uom),
        }
      : null,
    policy.safety_stock_qty != null
      ? {
          label: "Safety stock",
          value: policyQuantity(
            policy.safety_stock_qty,
            policy.safety_stock_uom,
          ),
        }
      : null,
  ].filter((cell): cell is NonNullable<typeof cell> => cell != null);

  if (cells.length === 0) {
    return null;
  }

  return (
    <div className={policyCard}>
      <div className={policyRow}>
        {cells.map((cell) => (
          <div key={cell.label} className={policyCell}>
            <div className={label}>{cell.label}</div>
            <div className={cx(valueBase, valueStrong)}>{cell.value}</div>
          </div>
        ))}
      </div>
      {policy.warnings.length > 0 && (
        <div className={policyWarnings}>
          {policy.warnings.map((warning) => warning.text).join(" ")}
        </div>
      )}
    </div>
  );
};

export const KeyMetricsRow = ({
  step,
  unfilteredStep,
  comparison,
  timeRange,
  measureOverride,
}: {
  step: StepDetailType;
  unfilteredStep: StepDetailType;
  comparison: PeriodComparison | null;
  timeRange: TimeRange;
  measureOverride?: BaseMeasure;
}) => {
  const plan = step.plan;
  const hasPlan = plan != null;
  const pep = step.pct_exceeding_plan;
  const { waccRate, storageCost } = useCostParams();
  const { measure } = useBaseMeasure();
  const effectiveMeasure = measureOverride ?? measure;
  const { basis } = useProcurementBasis();

  // Secondary procurement lead-time figure. `complete_timing` carries the other
  // basis after load-time row derivation (full-receipt when the headline is
  // first, and vice-versa once the basis swap runs), so this cell shows the
  // counterpart and its gap vs the headline.
  const secondaryStats = step.complete_timing?.stats;
  const secondaryValue = secondaryStats
    ? selectStat(secondaryStats, effectiveMeasure)
    : null;
  const headlineValue = selectStat(step.stats, effectiveMeasure);
  const secondaryGap =
    secondaryValue != null && headlineValue != null
      ? secondaryValue - headlineValue
      : null;
  const secondaryLabel =
    basis === "complete" ? "First receipt" : "Full receipt";

  const showCost = isDwellType(step.type) && step.cost != null;
  const costComparison = useMemo(() => {
    if (!showCost) {
      return { delta: null, previousTotal: null };
    }
    return computeCostComparison(
      unfilteredStep.monthly,
      unfilteredStep.cost?.unit_price,
      waccRate,
      storageCost,
      timeRange,
    );
  }, [
    showCost,
    unfilteredStep.cost,
    unfilteredStep.monthly,
    waccRate,
    storageCost,
    timeRange,
  ]);

  const costDelta = costComparison.delta;
  const previousCost = costComparison.previousTotal;
  const periodCost = showCost
    ? computePeriodCost(
        step.monthly,
        step.cost?.unit_price,
        waccRate,
        storageCost,
      )
    : null;

  const planNote = step.plan_note;
  const planLabel = planNote ? planSourceLabel(planNote) : null;
  const planningTooltipLines =
    step.type === "procurement"
      ? procurementPlanningTooltipLines(
          step.planning_source,
          step.planning_alternatives,
        )
      : [planLabel ?? planNote].filter((line): line is string => Boolean(line));

  return (
    <div className={card}>
      <div className={cardRow}>
        <PlanningAssumptionCell
          plan={plan}
          hasPlan={hasPlan}
          measureMeetsPlan={
            headlineValue == null || plan == null || headlineValue <= plan
          }
          tooltipLines={planningTooltipLines}
        />

        <div className={cellCenter}>
          <div className={label}>Exceeded plan</div>
          <div className={valueRow}>
            <span
              className={cx(
                valueBase,
                pep != null && pep > 30 ? valueDanger : valueStrong,
              )}
            >
              {pep != null
                ? `${formatNumber(pep, { maximumFractionDigits: 0 })}%`
                : "–"}
            </span>
            {pep != null && <span className={badge}>of batches</span>}
          </div>
        </div>

        <div className={cellCenter}>
          <div className={label}>Median vs previous period</div>
          <div className={valueRow}>
            {comparison?.medianPctChange != null ? (
              <DeltaWithTooltip
                delta={comparison.medianPctChange}
                previousValue={
                  comparison.previousStats?.median != null
                    ? `${formatNumber(comparison.previousStats.median, { maximumFractionDigits: 1 })}`
                    : null
                }
                unit="d"
                previousRange={previousPeriodLabel(comparison.previousRange)}
              />
            ) : (
              <span className={valueMuted}>–</span>
            )}
          </div>
        </div>

        {secondaryValue != null && (
          <div className={cellPlain}>
            <div className={labelWide}>
              {secondaryLabel} ({MEASURE_LABELS[effectiveMeasure]})
            </div>
            <div className={valueRow}>
              <span className={cx(valueBase, valueStrong)}>
                {`${formatNumber(secondaryValue, { maximumFractionDigits: 1 })}d`}
              </span>
              {secondaryGap != null && Math.abs(secondaryGap) >= 0.5 && (
                <span className={badgeNeutral}>
                  {`${secondaryGap > 0 ? "+" : "\u2212"}${formatNumber(Math.abs(secondaryGap), { maximumFractionDigits: 0 })}d vs headline`}
                </span>
              )}
            </div>
          </div>
        )}

        {showCost && (
          <div className={cellPlain}>
            <div className={labelWide}>Period dwell cost</div>
            <div className={valueRowRel}>
              <span className={cx(valueBase, valueStrong)}>
                {periodCost != null && periodCost > 0
                  ? formatCost(periodCost, step.cost?.currency ?? null, {
                      compact: true,
                    })
                  : "–"}
              </span>
              {costDelta != null && (
                <span className={absDelta}>
                  <DeltaWithTooltip
                    delta={costDelta}
                    previousValue={
                      previousCost != null
                        ? formatCost(
                            previousCost,
                            step.cost?.currency ?? null,
                            { compact: true },
                          )
                        : null
                    }
                    previousRange={previousPeriodLabel(
                      comparison?.previousRange,
                    )}
                  />
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
