/**
 * The drawer's metric charts: one tile per metric, each resizable between a
 * half-width and a full-width slot. Before any frame has arrived the tiles
 * are stable shells per configured metric, so the first data causes no
 * layout shift.
 */
import { useState } from "react";

import { css, cx } from "@hashintel/ds-helpers/css";

import {
  ExperimentMetricTimeline,
  type MetricSize,
} from "../experiment-metric-timeline";

import type { ExperimentRecord } from "../../../../../../../react/experiments/context";

const gridStyle = css({
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  alignItems: "start",
  gap: "3",
});

const tileStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  minWidth: "[0]",
  padding: "3",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "md",
  backgroundColor: "neutral.s00",
});

const largeTileStyle = css({
  gridColumn: "[1 / -1]",
});

type MetricFrame = ExperimentRecord["metricFrames"][number];

const metricTiles = (
  experiment: ExperimentRecord,
): { id: string; label: string | undefined; frames: MetricFrame[] }[] => {
  if (experiment.metricFrames.length === 0) {
    return experiment.metricSpecs.map((spec) => ({
      id: spec.id,
      label: spec.label,
      frames: [],
    }));
  }
  const labelById = new Map(
    experiment.metricSpecs.map((spec) => [spec.id, spec.label]),
  );
  const framesById = new Map<string, MetricFrame[]>();
  for (const frame of experiment.metricFrames) {
    const frames = framesById.get(frame.metricId) ?? [];
    frames.push(frame);
    framesById.set(frame.metricId, frames);
  }
  return [...framesById].map(([id, frames]) => ({
    id,
    label: labelById.get(id),
    frames,
  }));
};

export const ExperimentMetrics = ({
  experiment,
}: {
  experiment: ExperimentRecord;
}) => {
  const [sizes, setSizes] = useState<Record<string, MetricSize>>({});
  // What the frames represent: a selection change fades the previous picture
  // out inside each plot instead of cutting to the sparse new stream.
  const contentEpoch = JSON.stringify(experiment.sweep?.selection ?? null);

  return (
    <div className={gridStyle}>
      {metricTiles(experiment).map((tile) => {
        const size = sizes[tile.id] ?? "small";
        return (
          <div
            key={tile.id}
            className={cx(tileStyle, size === "large" && largeTileStyle)}
          >
            <ExperimentMetricTimeline
              frames={tile.frames}
              label={tile.label}
              timeDomain={[0, experiment.maxTime]}
              contentEpoch={contentEpoch}
              displaySize={size}
              onDisplaySizeChange={(nextSize) =>
                setSizes((previous) => ({ ...previous, [tile.id]: nextSize }))
              }
            />
          </div>
        );
      })}
    </div>
  );
};
