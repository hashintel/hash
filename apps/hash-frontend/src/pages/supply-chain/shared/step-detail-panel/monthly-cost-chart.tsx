import {
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
} from "recharts";

import { css } from "@hashintel/ds-helpers/css";

import {
  formatMonth,
  TOOLTIP_CONTENT_STYLE,
  TOOLTIP_ITEM_STYLE,
  TOOLTIP_LABEL_STYLE,
} from "../chart-format";
import { ClickableMonthTick } from "../chart-kit";
import { chartTheme } from "../chart-theme";
import { useCostParams, computeMonthlyCost, formatCost } from "../cost";

import type { StepDetail } from "../types";

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

interface MonthlyCostChartProps {
  step: StepDetail;
  onMonthClick?: (month: string) => void;
}

export const MonthlyCostChart = ({
  step,
  onMonthClick,
}: MonthlyCostChartProps) => {
  const { waccRate, storageCost } = useCostParams();
  const cost = step.cost;
  const monthlyCost = step.monthly.filter(
    (month) => month.total_kg_days != null,
  );

  if (!cost || monthlyCost.length === 0) {
    return null;
  }

  const currency = cost.currency;
  const unitPrice = cost.unit_price;

  const data = monthlyCost.map((month) => {
    const totalCost = computeMonthlyCost(
      month.total_kg_days,
      unitPrice,
      waccRate,
      storageCost,
    );
    return {
      month: month.month,
      monthLabel: formatMonth(month.month),
      totalCost,
      nEvents: month.n,
      avgPerEvent:
        totalCost != null && month.n > 0 ? totalCost / month.n : null,
    };
  });

  const handleBarClick = onMonthClick
    ? (entry: unknown) => {
        const month = (entry as { month?: string }).month;
        if (month) {
          onMonthClick(month);
        }
      }
    : undefined;

  return (
    <div className={chartWrap}>
      <h3 className={chartTitle}>Monthly carrying cost</h3>
      <ResponsiveContainer width="100%" height={280}>
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
            interval={data.length > 12 ? Math.floor(data.length / 8) : 0}
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
            wrapperStyle={{ pointerEvents: "none", zIndex: 9999 }}
            contentStyle={TOOLTIP_CONTENT_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
            labelFormatter={(_label, payload) => {
              const count = (
                payload as unknown as { payload?: { nEvents?: number } }[]
              )[0]?.payload?.nEvents;
              const base =
                count != null ? `${_label} (${count} batches)` : String(_label);
              return onMonthClick ? `${base} · Click to view rows` : base;
            }}
            formatter={(value, name) => {
              const labels: Record<string, string> = {
                totalCost: "Total",
              };
              return [
                formatCost(Number(value), currency),
                labels[String(name)] ?? String(name),
              ];
            }}
          />

          <Bar
            dataKey="totalCost"
            fill={chartTheme.series.warning}
            radius={[4, 4, 0, 0]}
            name="totalCost"
            onClick={handleBarClick}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};
