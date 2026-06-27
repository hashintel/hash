import { useState, useMemo } from "react";
import {
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
} from "recharts";

import { NumberInput } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  formatMonth,
  TOOLTIP_CONTENT_STYLE,
  TOOLTIP_ITEM_STYLE,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_WRAPPER_STYLE,
} from "../chart-format";
import { CustomDot, LegendLine } from "../chart-kit";
import { chartTheme } from "../chart-theme";
import {
  useCostParams,
  computeMonthlyCost,
  formatCost,
  formatNumber,
} from "../cost";

import type { StepDetail } from "../types";

const wrap = css({
  p: "6",
  display: "flex",
  flexDirection: "column",
  gap: "5",
});
const title = css({
  textStyle: "base",
  fontWeight: "medium",
  color: "fg.max",
  lineHeight: "[20px]",
});
const stack = css({ display: "flex", flexDirection: "column", gap: "5" });
const inputWrap = css({ maxWidth: "[240px]" });
const tileGrid = css({
  display: "grid",
  gridTemplateColumns: "[repeat(4, minmax(0, 1fr))]",
  gap: "2",
});
const chartStack = css({ display: "flex", flexDirection: "column", gap: "2" });
const chartLegend = css({ display: "flex", alignItems: "center", gap: "5" });

const fieldWrap = css({ display: "flex", flexDirection: "column", gap: "2" });
const fieldLabel = css({
  display: "block",
  textStyle: "xs",
  fontWeight: "medium",
  color: "fg.muted",
  letterSpacing: "[0.12px]",
});

const tile = css({
  bg: "bg.subtle",
  borderRadius: "lg",
  p: "3",
  display: "flex",
  flexDirection: "column",
  gap: "2.5",
});
const tileHead = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
});
const tileLabel = css({
  textStyle: "xs",
  fontWeight: "medium",
  color: "fg.muted",
  letterSpacing: "[0.12px]",
});
const tileLabelRight = css({
  textStyle: "xxs",
  color: "fg.subtle",
  letterSpacing: "[0.2px]",
});
const tileValueRow = css({ display: "flex", alignItems: "center", gap: "2" });
const tileValue = css({
  textStyle: "base",
  fontWeight: "medium",
  color: "fg.max",
  fontVariantNumeric: "tabular-nums",
  lineHeight: "[20px]",
  minW: "0",
});
const tileUnit = css({
  textStyle: "xxs",
  color: "fg.subtle",
  letterSpacing: "[0.2px]",
  flexShrink: "0",
});
// In-flow (pushed right via ml:auto) rather than absolutely positioned, so the
// badge can never overlap a wide value; flexShrink:0 keeps its own text intact.
const tileChip = css({
  ml: "auto",
  flexShrink: "0",
  display: "inline-flex",
  alignItems: "center",
  textStyle: "xs",
  fontWeight: "medium",
  color: "fg.muted",
  bg: "bgSolid.min",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  borderRadius: "sm",
  px: "2",
  py: "0.5",
  lineHeight: "none",
});

interface SavingsCalculatorProps {
  step: StepDetail;
  timeRange?: string;
}

const OutputTile = ({
  label,
  labelRight,
  value,
  unit,
  chip,
}: {
  label: string;
  labelRight?: string;
  value: string;
  unit?: string;
  chip?: string;
}) => {
  return (
    <div className={tile}>
      <div className={tileHead}>
        <span className={tileLabel}>{label}</span>
        {labelRight && <span className={tileLabelRight}>{labelRight}</span>}
      </div>
      <div className={tileValueRow}>
        <span className={tileValue}>{value}</span>
        {unit && <span className={tileUnit}>{unit}</span>}
        {chip && <span className={tileChip}>{chip}</span>}
      </div>
    </div>
  );
};
export const SavingsCalculator = ({
  step,
  timeRange,
}: SavingsCalculatorProps) => {
  const { waccRate, storageCost } = useCostParams();
  const cost = step.cost;
  const currency = cost?.currency ?? null;
  const unitPrice = cost?.unit_price ?? 0;
  const defaultReductionPct = useMemo(() => {
    const median = step.stats.median ?? 0;
    if (step.plan && median > step.plan) {
      return Math.min(100, Math.round(((median - step.plan) / median) * 100));
    }
    return 30;
  }, [step]);
  const [reductionPct, setReductionPct] = useState(defaultReductionPct); // Re-seed the slider when the step changes (the panel reuses one instance and
  // swaps the `step` prop). Adjusting state during render is React's recommended
  // pattern and avoids the set-state-in-effect rule this repo enforces.
  const [seededStepId, setSeededStepId] = useState(step.id);
  if (step.id !== seededStepId) {
    setSeededStepId(step.id);
    setReductionPct(defaultReductionPct);
  }
  const fraction = reductionPct / 100;
  const medianDwell = step.stats.median ?? 0;
  const reductionDays = Math.round(fraction * medianDwell);
  const newAvgDwell = Math.max(0, medianDwell - reductionDays);
  const monthlyCosts = step.monthly.filter(
    (month) => month.total_kg_days != null,
  );
  const totalEvents = monthlyCosts.reduce((acc, month) => acc + month.n, 0);
  const nMonths = monthlyCosts.length;
  const periodSaving = 0;
  const windowMonths = timeRange === "3m" ? 3 : timeRange === "6m" ? 6 : 12;
  const annualisedSaving = periodSaving * (12 / windowMonths);
  const chartData = useMemo(() => {
    return monthlyCosts.map((month) => {
      const actual =
        computeMonthlyCost(
          month.total_kg_days,
          unitPrice,
          waccRate,
          storageCost,
        ) ?? 0;
      return {
        month: formatMonth(month.month),
        actual,
        reduced: actual * (1 - fraction),
      };
    });
  }, [monthlyCosts, unitPrice, waccRate, storageCost, fraction]);
  return (
    <div className={wrap}>
      <h3 className={title}>Savings calculator</h3>

      <div className={stack}>
        {/* Input */}
        <div className={inputWrap}>
          <div className={fieldWrap}>
            <span className={fieldLabel}>Reduce dwell by</span>
            <NumberInput
              value={reductionPct}
              min={0}
              max={100}
              step={1}
              size="sm"
              suffix={{ text: "%" }}
              onChange={(value) =>
                setReductionPct(Math.max(0, Math.min(100, value ?? 0)))
              }
              aria-label="Reduce dwell by percent"
            />
          </div>
        </div>

        {/* Output tiles */}
        <div className={tileGrid}>
          <OutputTile
            label="New average dwell"
            value={formatNumber(newAvgDwell, { maximumFractionDigits: 0 })}
            unit="days"
            chip={`−${formatNumber(reductionDays, { maximumFractionDigits: 0 })}d`}
          />

          <OutputTile
            label="Period saving"
            labelRight={timeRange ? `over ${timeRange}` : `${nMonths} months`}
            value={formatCost(periodSaving, currency, { compact: true })}
            chip={
              fraction > 0
                ? `−${formatNumber(fraction * 100, { maximumFractionDigits: 0 })}%`
                : undefined
            }
          />

          <OutputTile
            label="Annualised saving"
            value={formatCost(annualisedSaving, currency, { compact: true })}
            chip={
              totalEvents > 0
                ? `${formatNumber(totalEvents)} events`
                : undefined
            }
          />

          <OutputTile
            label="Reduced total cost"
            labelRight={timeRange ? `over ${timeRange}` : `${nMonths} months`}
            value="–"
            chip={undefined}
          />
        </div>
      </div>

      {/* Cost comparison chart */}
      {chartData.length > 0 && (
        <div className={chartStack}>
          <div className={chartLegend}>
            <LegendLine
              color={chartTheme.series.critical}
              label="Actual cost"
              size="md"
            />

            <LegendLine
              color={chartTheme.series.success}
              label="Reduced cost"
              size="md"
            />
          </div>
          <ResponsiveContainer width="100%" height={400}>
            <ComposedChart
              data={chartData}
              margin={{ top: 10, right: 10, bottom: 5, left: 5 }}
            >
              <XAxis
                dataKey="month"
                tick={{
                  fontSize: 10,
                  fill: chartTheme.axis.tickStrong,
                  letterSpacing: 0.2,
                }}
                tickLine={false}
                axisLine={{ stroke: chartTheme.axis.line, strokeWidth: 0.5 }}
              />

              <YAxis
                tick={{
                  fontSize: 12,
                  fill: chartTheme.axis.tick,
                  letterSpacing: 0.12,
                }}
                tickLine={false}
                axisLine={false}
                width={45}
                tickFormatter={(value: number) =>
                  formatCost(value, currency, { compact: true })
                }
              />

              <Tooltip
                wrapperStyle={TOOLTIP_WRAPPER_STYLE}
                contentStyle={TOOLTIP_CONTENT_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
                formatter={(value, name) => [
                  formatCost(Number(value), currency),
                  String(name) === "actual" ? "Actual" : "Reduced",
                ]}
              />

              <Line
                dataKey="actual"
                stroke={chartTheme.series.critical}
                strokeWidth={2}
                dot={<CustomDot color={chartTheme.series.critical} />}
                connectNulls
                name="actual"
              />

              <Line
                dataKey="reduced"
                stroke={chartTheme.series.success}
                strokeWidth={2}
                dot={<CustomDot color={chartTheme.series.success} />}
                connectNulls
                name="reduced"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};
