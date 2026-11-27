import type { SimulationFrameReader } from "../../../../../../../../react/simulation/context";

/** Metadata for each plotted series, stable across streaming updates. */
export interface TimelineSeriesMeta {
  seriesId: string;
  seriesName: string;
  color: string;
}

/**
 * Returns the value for series `seriesIdx` at the given frame.
 * Returning NaN leaves a gap on the chart.
 */
export type TimelineSeriesExtractor = (
  frame: SimulationFrameReader,
  seriesIdx: number,
  time: number,
) => number;

/** Series metadata and extractor for the active timeline view. */
export interface TimelineSeriesConfig {
  series: TimelineSeriesMeta[];
  extract: TimelineSeriesExtractor;
}
