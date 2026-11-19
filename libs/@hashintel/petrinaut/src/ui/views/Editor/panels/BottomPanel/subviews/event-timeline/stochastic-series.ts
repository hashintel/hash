import type { TimelineSeriesMeta } from "../simulation-timeline/types";
import type { EventTimelineData } from "./series";
import type {
  ExperimentReader,
  MonteCarloUserDefinedMetricFrame,
} from "@hashintel/petrinaut-core";
import type uPlot from "uplot";

/**
 * The timeline of a Stochastic simulation: per place, the mean token count
 * across runs at every sample.
 *
 * `frames` is the experiment's current frames. The reader reads through to
 * them on its own; they are passed so that a caller that keeps the result
 * knows to read again when they change.
 */
export const placeMeanTimeline = (
  reader: ExperimentReader,
  series: TimelineSeriesMeta[],
  metricIdOf: (seriesId: string) => string,
  frames: readonly MonteCarloUserDefinedMetricFrame[],
): Extract<EventTimelineData, { kind: "sampled" }> | null => {
  if (frames.length === 0 || series.length === 0) {
    return null;
  }
  const columns = series.map((entry) =>
    reader.metricFrames(metricIdOf(entry.seriesId)),
  );
  // Every metric is sampled on one grid; the shortest column is how far all
  // of them reach.
  const length = Math.min(...columns.map((column) => column.length));
  const times = new Array<number>(length);
  const first = columns[0]!;
  for (let sample = 0; sample < length; sample++) {
    times[sample] = first[sample]?.time ?? 0;
  }
  return {
    kind: "sampled",
    series,
    data: [
      times,
      ...columns.map((column) => {
        const means = new Array<number | null>(length);
        for (let sample = 0; sample < length; sample++) {
          const frame = column[sample];
          means[sample] = frame
            ? (reader.statisticsOf(frame)?.mean ?? null)
            : null;
        }
        return means;
      }),
    ] as uPlot.AlignedData,
  };
};
