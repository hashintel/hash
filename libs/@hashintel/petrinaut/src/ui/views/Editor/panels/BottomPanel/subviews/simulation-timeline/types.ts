/** Metadata for each plotted series, stable across streaming updates. */
export interface TimelineSeriesMeta {
  seriesId: string;
  seriesName: string;
  color: string;
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
