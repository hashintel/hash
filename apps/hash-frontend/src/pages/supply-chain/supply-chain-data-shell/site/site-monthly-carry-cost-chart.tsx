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
  TOOLTIP_CONTENT_STYLE,
  TOOLTIP_ITEM_STYLE,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_WRAPPER_STYLE,
} from "../../shared/chart-format";
import { chartTheme } from "../../shared/chart-theme";
import { formatCost } from "../../shared/cost";

import type { SiteMonthlyCostPoint } from "./shared/helpers";

const wrap = css({
  borderRadius: "lg",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  bg: "bgSolid.min",
  p: "4",
  display: "flex",
  flexDirection: "column",
  gap: "3",
});
const title = css({
  textStyle: "sm",
  fontWeight: "medium",
  color: "fg.heading",
});
const subtitle = css({ textStyle: "xs", color: "fg.subtle" });

export const SiteMonthlyCarryCostChart = ({
  data,
  currency,
}: {
  data: SiteMonthlyCostPoint[];
  currency: string | null;
}) => {
  if (data.length === 0) {
    return null;
  }
  return (
    <div className={wrap}>
      <div>
        <h3 className={title}>Monthly Carry Cost</h3>
        <p className={subtitle}>
          Deduplicated by shared material/intermediate inventory across products
        </p>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart
          data={data}
          margin={{ top: 10, right: 10, bottom: 5, left: 5 }}
        >
          <XAxis
            dataKey="monthLabel"
            tick={{
              fontSize: 10,
              fill: chartTheme.axis.tickStrong,
              letterSpacing: 0.2,
            }}
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
            wrapperStyle={TOOLTIP_WRAPPER_STYLE}
            contentStyle={TOOLTIP_CONTENT_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
            labelFormatter={(label) => String(label)}
            formatter={(value) => [
              formatCost(Number(value), currency),
              "Total carry cost",
            ]}
          />

          <Bar
            dataKey="totalCost"
            fill={chartTheme.series.warning}
            radius={[4, 4, 0, 0]}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};
