import type { SimulationFrameReader } from "../../../../../../../react/simulation/context";

/** Frame reader consumed by timeline series extractors. */
export type TimelineFrame = SimulationFrameReader;

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
  frame: TimelineFrame,
  seriesIdx: number,
  time: number,
) => number;

/** Series metadata and extractor for the active timeline view. */
export interface TimelineSeriesConfig {
  series: TimelineSeriesMeta[];
  extract: TimelineSeriesExtractor;
}

/**
 * Streaming data store that builds uPlot columnar arrays directly.
 * New frames are pushed in O(k) where k = new frames, no full-array copies.
 */
export interface StreamingStore {
  /** Series metadata (stable) */
  series: TimelineSeriesMeta[];
  /** Columnar arrays: [times, ...seriesValues], mutated in place */
  columns: number[][];
  /** Current frame count in the columns */
  length: number;
  /** Revision counter, incremented on every append to trigger React updates */
  revision: number;
}
