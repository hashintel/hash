/**
 * A drawer's metric charts: one tile per metric, each resizable between a
 * half-width and a full-width slot. Before any frame has arrived the tiles
 * are stable shells per configured metric, so the first data causes no
 * layout shift.
 */
import { useState } from "react";

import { css, cx } from "@hashintel/ds-helpers/css";

import {
  ExperimentMetricTimeline,
  type MetricSize,
} from "../experiments/experiment-metric-timeline";

import type { MonteCarloUserDefinedMetricFrame } from "@hashintel/petrinaut-core";

export type MetricTile = {
  id: string;
  label: string;
  frames: readonly MonteCarloUserDefinedMetricFrame[];
  outputType: MonteCarloUserDefinedMetricFrame["outputType"];
};

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

export const MetricTiles = ({
  tiles,
  timeDomain,
  contentEpoch,
  defaultSize = "small",
}: {
  tiles: readonly MetricTile[];
  timeDomain: readonly [number, number];
  /**
   * Identity of what the frames represent (a selection key). A change fades
   * the previous picture out inside each plot instead of cutting to the
   * sparse new stream.
   */
  contentEpoch: string;
  defaultSize?: MetricSize;
}) => {
  const [sizes, setSizes] = useState<Record<string, MetricSize>>({});

  return (
    <div className={gridStyle}>
      {tiles.map((tile) => {
        const size = sizes[tile.id] ?? defaultSize;
        return (
          <div
            key={tile.id}
            className={cx(tileStyle, size === "large" && largeTileStyle)}
          >
            <ExperimentMetricTimeline
              frames={tile.frames}
              label={tile.label}
              expectedOutputType={tile.outputType}
              timeDomain={timeDomain}
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
