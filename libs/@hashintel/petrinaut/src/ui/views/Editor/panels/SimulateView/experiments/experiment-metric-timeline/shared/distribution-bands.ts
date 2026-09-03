/**
 * The "Percentile lines" view's band definitions: which statistics are
 * drawn, how each line is styled, and how the legend groups them. One
 * definition feeds the data builder, the uPlot series, and the legend so
 * the three can never disagree.
 */
import { meanFromBins, percentileFromBins } from "./distribution-math";

import type { DistributionBins } from "./metric-frames";

export const distributionBandSeries: {
  label: string;
  // `null` => arithmetic mean; otherwise the percentile fraction in [0, 1].
  fraction: number | null;
  stroke: string;
  width: number;
  dash?: number[];
}[] = [
  { label: "10th", fraction: 0.1, stroke: "#9ca3af", width: 1, dash: [3, 3] },
  { label: "25th", fraction: 0.25, stroke: "#6b7280", width: 1 },
  { label: "Median", fraction: 0.5, stroke: "#111827", width: 1.5 },
  { label: "Mean", fraction: null, stroke: "#d97706", width: 2 },
  { label: "75th", fraction: 0.75, stroke: "#6b7280", width: 1 },
  { label: "90th", fraction: 0.9, stroke: "#9ca3af", width: 1, dash: [3, 3] },
];

export const distributionBandLegend: {
  label: string;
  stroke: string;
  dash: boolean;
}[] = [
  { label: "Mean", stroke: "#d97706", dash: false },
  { label: "Median", stroke: "#111827", dash: false },
  { label: "25–75%", stroke: "#6b7280", dash: false },
  { label: "10–90%", stroke: "#9ca3af", dash: true },
];

export function bandValueFromBins(
  bins: DistributionBins,
  fraction: number | null,
): number | null {
  return fraction === null
    ? meanFromBins(bins)
    : percentileFromBins(bins, fraction);
}
