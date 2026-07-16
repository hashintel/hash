import { useMemo } from "react";
import {
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  ComposedChart,
} from "recharts";

import { css } from "@hashintel/ds-helpers/css";

import {
  formatMonth,
  TOOLTIP_CONTENT_STYLE,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_ITEM_STYLE,
} from "../chart-format";
import { ClickableMonthTick, CustomDot, LegendLine } from "../chart-kit";
import { chartTheme } from "../chart-theme";
import { formatNumber } from "../cost";
import { countNoun } from "../observation-labels";

import type { StepDetail, MonthlyBucket } from "../types";
import type { Dimension } from "./distribution-chart";

const chartWrap = css({
  p: "6",
  display: "flex",
  flexDirection: "column",
  gap: "3",
});
const chartTitle = css({
  textStyle: "base",
  fontWeight: "medium",
  color: "fg.max",
  lineHeight: "[20px]",
});
const headerRow = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
});
const headerStack = css({
  display: "flex",
  flexDirection: "column",
  gap: "1.5",
});
const legendRow = css({ display: "flex", alignItems: "center", gap: "3.5" });

interface TimeSeriesChartProps {
  step: StepDetail;
  dimension?: Dimension;
  selectedComponent?: string | null;
  onMonthClick?: (month: string) => void;
}

export const TimeSeriesChart = ({
  step,
  dimension = "timing",
  selectedComponent,
  onMonthClick,
}: TimeSeriesChartProps) => {
  const { monthly, refValue, title, refLabel } = useMemo(() => {
    if (dimension === "yield" && step.yield_data) {
      return {
        monthly: step.yield_data.monthly,
        refValue: step.yield_data.reference,
        title: "Receipt ratio trend",
        refLabel: "Order quantity",
      };
    }
    if (dimension === "consumption" && step.consumption_data) {
      let month: MonthlyBucket[];
      if (selectedComponent) {
        const comp = step.consumption_data.components.find(
          (component) => component.material === selectedComponent,
        );
        month = comp?.monthly ?? [];
      } else {
        month = step.consumption_data.aggregate.monthly;
      }
      return {
        monthly: month,
        refValue: 0,
        title: selectedComponent
          ? "Component consumption variance trend"
          : "Aggregate consumption variance trend",
        refLabel: "Expected",
      };
    }
    return {
      monthly: step.monthly,
      refValue: step.plan,
      title: "Monthly trend",
      refLabel: "Planned",
    };
  }, [step, dimension, selectedComponent]);

  const data = monthly.map((month) => ({
    month: month.month,
    monthLabel: formatMonth(month.month),
    median: month.median,
    mean: month.mean,
    n: month.n,
  }));

  const yAxisFormatter =
    dimension === "timing"
      ? (value: number) => `${formatNumber(Math.round(value))}d`
      : (value: number) =>
          `${formatNumber(value, { maximumFractionDigits: 1 })}%`;

  const showRef = refValue != null && (dimension !== "timing" || refValue > 0);

  return (
    <div className={chartWrap}>
      <div className={headerRow}>
        <div className={headerStack}>
          <h3 className={chartTitle}>{title}</h3>
          <div className={legendRow}>
            <LegendLine color={chartTheme.series.mean} label="Mean" />
            <LegendLine color={chartTheme.series.info} label="Median" />
            {showRef && (
              <LegendLine
                color={chartTheme.reference}
                label={refLabel}
                dashed
              />
            )}
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={380}>
        <ComposedChart
          data={data}
          margin={{ top: 10, right: 10, bottom: 5, left: 5 }}
          accessibilityLayer={false}
        >
          <XAxis
            dataKey="monthLabel"
            tick={
              <ClickableMonthTick
                months={data.map((month) => ({
                  month: month.month,
                  label: month.monthLabel,
                }))}
                onMonthClick={onMonthClick}
              />
            }
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
            width={40}
            tickFormatter={yAxisFormatter}
          />

          <Tooltip
            wrapperStyle={{ pointerEvents: "none", zIndex: 9999 }}
            contentStyle={TOOLTIP_CONTENT_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            itemStyle={{ ...TOOLTIP_ITEM_STYLE, fontSize: 12 }}
            labelFormatter={(_label, payload) => {
              const count = (
                payload as unknown as { payload?: { n?: number } }[]
              )[0]?.payload?.n;
              const noun = countNoun({
                id: step.id,
                label: step.label,
                type: step.type,
                dimension,
                selectedComponent: selectedComponent != null,
              });
              const base =
                count != null ? `${_label}: ${count} ${noun}` : String(_label);
              return onMonthClick ? `${base} · Click to view rows` : base;
            }}
            formatter={(value, name) => {
              const val =
                dimension === "timing"
                  ? `${formatNumber(Number(value), { maximumFractionDigits: 1 })}d`
                  : `${formatNumber(Number(value), { maximumFractionDigits: 1 })}%`;
              return [val, name === "mean" ? "Mean" : "Median"];
            }}
          />

          <Line
            dataKey="mean"
            stroke={chartTheme.series.mean}
            strokeWidth={2}
            dot={
              <CustomDot
                color={chartTheme.series.mean}
                onMonthClick={onMonthClick}
              />
            }
            activeDot={
              <CustomDot
                color={chartTheme.series.mean}
                onMonthClick={onMonthClick}
              />
            }
            connectNulls
            name="mean"
          />

          <Line
            dataKey="median"
            stroke={chartTheme.series.info}
            strokeWidth={2}
            dot={
              <CustomDot
                color={chartTheme.series.info}
                onMonthClick={onMonthClick}
              />
            }
            activeDot={
              <CustomDot
                color={chartTheme.series.info}
                onMonthClick={onMonthClick}
              />
            }
            connectNulls
            name="median"
          />

          {showRef && (
            <ReferenceLine
              y={refValue}
              stroke={chartTheme.reference}
              strokeWidth={1.5}
              strokeDasharray="6 4"
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};
