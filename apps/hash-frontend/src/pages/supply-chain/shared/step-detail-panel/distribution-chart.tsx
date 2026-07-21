import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from "recharts";

import { css } from "@hashintel/ds-helpers/css";

import { isDwellType } from "../categories";
import { chartTheme } from "../chart-theme";
import { formatCost, formatNumber, useCostParams } from "../cost";
import { countNoun } from "../observation-labels";
import { SegmentedControl } from "../segmented-control";
import { dwellCostDistributionValues } from "./distribution-chart/dwell-cost-distribution";

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
const chartHeader = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
});
const emptyText = css({ textStyle: "sm", color: "fg.subtle" });

export type Dimension = "timing" | "yield" | "consumption" | "supplier";

interface DistributionChartProps {
  step: StepDetail;
  dimension?: Dimension;
  selectedComponent?: string | null;
}

type Bin = {
  rangeStart: number;
  rangeEnd: number;
  isLast: boolean;
  count: number;
  label: string;
  axisLabel: string;
};

type DwellDistributionMeasure = "duration" | "value";

function niceStep(rawStep: number): number {
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const norm = rawStep / mag;
  if (norm <= 1) {
    return mag;
  }
  if (norm <= 2) {
    return 2 * mag;
  }
  if (norm <= 5) {
    return 5 * mag;
  }
  return 10 * mag;
}

function buildBins(
  values: number[],
  valueFormatter?: (value: number) => string,
): { bins: Bin[]; binCount: number } {
  const filtered = values.filter((day): day is number => Number.isFinite(day));
  if (filtered.length === 0) {
    return { bins: [], binCount: 0 };
  }

  const min = Math.min(...filtered);
  const max = Math.max(...filtered);
  const range = max - min;
  if (range === 0) {
    const label =
      valueFormatter?.(min) ?? formatNumber(min, { maximumFractionDigits: 0 });
    return {
      bins: [
        {
          rangeStart: min,
          rangeEnd: max,
          isLast: true,
          count: filtered.length,
          label,
          axisLabel: label,
        },
      ],

      binCount: 1,
    };
  }

  const targetCount = Math.min(
    Math.max(Math.ceil(Math.sqrt(filtered.length)), 7),
    20,
  );
  const rawStep = range / targetCount;
  const step = niceStep(rawStep);

  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const count = Math.round((niceMax - niceMin) / step);

  const useDecimals = step < 1;
  const fmt =
    valueFormatter ??
    ((value: number) =>
      formatNumber(value, { maximumFractionDigits: useDecimals ? 1 : 0 }));

  const histogram: Bin[] = [];
  for (let index = 0; index < count; index++) {
    const start = niceMin + index * step;
    const end = start + step;
    const isLast = index === count - 1;
    const column = filtered.filter(
      (day) => day >= start && (isLast ? day <= end : day < end),
    ).length;
    const label = `${fmt(start)}–${fmt(end)}`;
    histogram.push({
      rangeStart: start,
      rangeEnd: end,
      isLast,
      count: column,
      label,
      axisLabel: fmt(start),
    });
  }

  return { bins: histogram, binCount: count };
}

export const DistributionChart = ({
  step,
  dimension = "timing",
  selectedComponent,
}: DistributionChartProps) => {
  const { waccRate, storageCost } = useCostParams();
  const [dwellMeasure, setDwellMeasure] =
    useState<DwellDistributionMeasure>("duration");
  const isDwellTiming = dimension === "timing" && isDwellType(step.type);
  const { bins, binCount, refValue, title } = useMemo(() => {
    if (dimension === "yield" && step.yield_data) {
      const { bins: right2, binCount: bc } = buildBins(step.yield_data.values);
      return {
        bins: right2,
        binCount: bc,
        refValue: step.yield_data.reference,
        title: "Receipt ratio distribution",
      };
    }
    if (dimension === "consumption" && step.consumption_data) {
      let values: number[];
      if (selectedComponent) {
        const comp = step.consumption_data.components.find(
          (column) => column.material === selectedComponent,
        );
        values = comp?.values ?? [];
      } else {
        values = step.consumption_data.aggregate.values;
      }
      const { bins: right2, binCount: bc } = buildBins(values);
      return {
        bins: right2,
        binCount: bc,
        refValue: 0,
        title: selectedComponent
          ? "Component consumption variance distribution"
          : "Aggregate consumption variance distribution",
      };
    }
    const values =
      isDwellTiming && dwellMeasure === "value"
        ? dwellCostDistributionValues(step, waccRate, storageCost)
        : step.durations;
    const isValueDistribution = isDwellTiming && dwellMeasure === "value";
    const { bins: right, binCount: bc } = buildBins(
      values,
      isValueDistribution
        ? (value) =>
            formatCost(value, step.cost?.currency ?? null, { compact: true })
        : undefined,
    );
    return {
      bins: right,
      binCount: bc,
      refValue: isValueDistribution ? null : step.plan,
      title: isDwellTiming ? "Distribution" : "Duration distribution",
    };
  }, [
    step,
    dimension,
    selectedComponent,
    isDwellTiming,
    dwellMeasure,
    waccRate,
    storageCost,
  ]);

  if (bins.length === 0) {
    return (
      <div className={chartWrap}>
        <div className={chartHeader}>
          <h3 className={chartTitle}>{title}</h3>
          {isDwellTiming && (
            <SegmentedControl
              value={dwellMeasure}
              onChange={setDwellMeasure}
              options={[
                { value: "duration", label: "Duration" },
                { value: "value", label: "Value" },
              ]}
            />
          )}
        </div>
        <p className={emptyText}>
          {isDwellTiming && dwellMeasure === "value"
            ? "No cost data available"
            : dimension === "consumption" && selectedComponent
              ? "No in-range matched variance data available"
              : "No data available"}
        </p>
      </div>
    );
  }

  const hasRef = refValue != null && (dimension !== "timing" || refValue > 0);
  const isValueDistribution = isDwellTiming && dwellMeasure === "value";
  const rv = refValue ?? 0;
  const refIdx = hasRef
    ? bins.findIndex(
        (bin) =>
          rv >= bin.rangeStart &&
          (bin.isLast ? rv <= bin.rangeEnd : rv < bin.rangeEnd),
      )
    : -1;

  const getBarColor = (idx: number) => {
    if (dimension === "yield") {
      if (refIdx >= 0) {
        return idx >= refIdx
          ? chartTheme.series.info
          : chartTheme.series.warning;
      }
      const ratio = idx / (binCount - 1);
      return ratio >= 0.5 ? chartTheme.series.info : chartTheme.series.warning;
    }
    if (dimension === "consumption") {
      const bin = bins[idx];
      if (!bin) {
        return chartTheme.series.info;
      }
      if (bin.rangeEnd <= 0) {
        return chartTheme.series.info;
      }
      if (bin.rangeStart >= 0 && bin.rangeStart <= 5) {
        return chartTheme.series.warning;
      }
      if (bin.rangeStart > 5) {
        return chartTheme.series.critical;
      }
      return chartTheme.series.info;
    }
    if (refIdx >= 0) {
      if (idx <= refIdx) {
        return chartTheme.series.info;
      }
      if (idx <= refIdx + 2) {
        return chartTheme.series.warning;
      }
      return chartTheme.series.critical;
    }
    const ratio = idx / (binCount - 1);
    if (ratio <= 0.45) {
      return chartTheme.series.info;
    }
    if (ratio <= 0.7) {
      return chartTheme.series.warning;
    }
    return chartTheme.series.critical;
  };

  return (
    <div className={chartWrap}>
      <div className={chartHeader}>
        <h3 className={chartTitle}>{title}</h3>
        {isDwellTiming && (
          <SegmentedControl
            value={dwellMeasure}
            onChange={setDwellMeasure}
            options={[
              { value: "duration", label: "Duration" },
              { value: "value", label: "Value" },
            ]}
          />
        )}
      </div>
      <ResponsiveContainer
        width="100%"
        height={isValueDistribution ? 440 : 380}
      >
        <BarChart
          data={bins}
          margin={{ top: 10, right: 10, bottom: 5, left: 5 }}
        >
          <XAxis
            dataKey="label"
            tick={{
              fontSize: 10,
              fill: chartTheme.axis.tickStrong,
              letterSpacing: 0.2,
              ...(isValueDistribution
                ? { angle: -90, textAnchor: "end" as const }
                : {}),
            }}
            tickFormatter={(label: string) =>
              isValueDistribution
                ? (bins.find((bin) => bin.label === label)?.axisLabel ?? label)
                : label
            }
            tickLine={false}
            axisLine={{ stroke: chartTheme.axis.line, strokeWidth: 0.5 }}
            interval={isValueDistribution ? 0 : undefined}
            height={isValueDistribution ? 110 : 30}
            label={
              isValueDistribution
                ? {
                    value: `Dwell cost (${step.cost?.currency ?? "USD"})`,
                    position: "insideBottom",
                    offset: -2,
                    fontSize: 11,
                    fill: chartTheme.axis.tick,
                  }
                : undefined
            }
          />

          <YAxis
            tick={{
              fontSize: 12,
              fill: chartTheme.axis.tick,
              letterSpacing: 0.12,
            }}
            tickLine={false}
            axisLine={false}
            width={25}
          />

          <Tooltip
            wrapperStyle={{ zIndex: 9999 }}
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              backgroundColor: chartTheme.tooltip.bg,
              border: `1px solid ${chartTheme.tooltip.border}`,
              color: chartTheme.tooltip.text,
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              fontFamily: "inherit",
            }}
            formatter={(value) => [
              `${value} ${countNoun({
                id: step.id,
                label: step.label,
                type: step.type,
                dimension,
                selectedComponent: selectedComponent != null,
              })}`,
              "Count",
            ]}
          />

          {hasRef && dimension !== "timing" && (
            <ReferenceLine
              x={
                bins.find(
                  (bin) =>
                    rv >= bin.rangeStart &&
                    (bin.isLast ? rv <= bin.rangeEnd : rv < bin.rangeEnd),
                )?.label
              }
              stroke={chartTheme.reference}
              strokeWidth={1.5}
              strokeDasharray="6 4"
              label={{
                value:
                  dimension === "yield"
                    ? `${formatNumber(rv, { maximumFractionDigits: 0 })}%`
                    : "Expected",
                position: "top",
                fontSize: 10,
                fill: chartTheme.axis.tick,
              }}
            />
          )}
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {bins.map((bin, idx) => (
              <Cell key={bin.label} fill={getBarColor(idx)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
