export type MonteCarloActiveRunPlaceCountsVisitor = (
  runIndex: number,
  /**
   * Dense place-count view indexed by `placeIds`.
   *
   * Metric implementations must treat this as read-only.
   */
  placeCounts: Uint32Array,
) => void;

export type MonteCarloFrameMetricContext = {
  frameNumber: number;
  time: number;
  runCount: number;
  activeRunCount: number;
  completedRunCount: number;
  erroredRunCount: number;
  placeIds: readonly string[];
  placeNames: readonly string[];
  forEachActiveRunPlaceCounts: (
    visitor: MonteCarloActiveRunPlaceCountsVisitor,
  ) => void;
};

export type MonteCarloFrameMetric = {
  observeFrame: (context: MonteCarloFrameMetricContext) => void;
};

export type PlaceTokenCountDistributionBin = readonly [
  tokenCount: number,
  frequency: number,
];

export type PlaceTokenCountDistributionPlace = {
  placeId: string;
  placeName: string;
  sampleCount: number;
  bins: readonly PlaceTokenCountDistributionBin[];
};

export type PlaceTokenCountDistributionFrame = {
  frameNumber: number;
  time: number;
  runCount: number;
  activeRunCount: number;
  completedRunCount: number;
  erroredRunCount: number;
  places: readonly PlaceTokenCountDistributionPlace[];
};

export type PlaceTokenCountDistributionMetric = MonteCarloFrameMetric & {
  readonly frames: readonly PlaceTokenCountDistributionFrame[];
  getLatestFrame: () => PlaceTokenCountDistributionFrame | null;
  clear: () => void;
};
