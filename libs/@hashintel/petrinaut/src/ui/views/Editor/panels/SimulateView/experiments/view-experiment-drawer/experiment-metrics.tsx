/**
 * The experiment drawer's metric charts: one tile per configured metric,
 * fed the record's frames.
 */
import { MetricTiles, type MetricTile } from "../../shared/metric-tiles";

import type { ExperimentRecord } from "../../../../../../../react/experiments/context";

const metricTiles = (experiment: ExperimentRecord): MetricTile[] => {
  const framesById = new Map<string, MetricTile["frames"][number][]>();
  for (const frame of experiment.metricFrames) {
    const frames = framesById.get(frame.metricId) ?? [];
    frames.push(frame);
    framesById.set(frame.metricId, frames);
  }
  return experiment.metricSpecs.map((spec) => ({
    id: spec.id,
    label: spec.label,
    frames: framesById.get(spec.id) ?? [],
    outputType:
      spec.runOutput?.type === "distribution" ? "distribution" : "scalar",
  }));
};

export const ExperimentMetrics = ({
  experiment,
}: {
  experiment: ExperimentRecord;
}) => (
  <MetricTiles
    tiles={metricTiles(experiment)}
    timeDomain={[0, experiment.maxTime]}
    // What the frames represent: a selection change fades the previous picture
    // out inside each plot instead of cutting to the sparse new stream.
    contentEpoch={JSON.stringify(experiment.sweep?.selection ?? null)}
  />
);
