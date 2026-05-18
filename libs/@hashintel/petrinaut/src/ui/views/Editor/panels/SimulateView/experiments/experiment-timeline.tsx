import { css } from "@hashintel/ds-helpers/css";
import { use, useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

import type { PlaceTokenCountDistributionBin } from "@hashintel/petrinaut-core";
import type { ExperimentRecord } from "../../../../../../react/experiments/context";
import { useElementSize } from "../../../../../../react/hooks/use-element-size";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { Select } from "../../../../../components/select";

const UPlot = uPlot;

const rootStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
  width: "full",
  minHeight: "[0]",
});

const headerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
});

const labelStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s100",
});

const selectStyle = css({
  width: "[220px]",
});

const chartStyle = css({
  height: "[320px]",
  minHeight: "[320px]",
  width: "full",
  minWidth: "[0]",
});

const legendStyle = css({
  display: "flex",
  flexWrap: "wrap",
  gap: "3",
  rowGap: "2",
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s100",
});

const legendItemStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
});

const legendSwatchStyle = css({
  width: "[18px]",
  height: "[0]",
  borderTopWidth: "[2px]",
  borderTopStyle: "solid",
});

const emptyStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "[220px]",
  fontSize: "sm",
  color: "neutral.s80",
});

function percentileFromBins(
  bins: readonly PlaceTokenCountDistributionBin[],
  sampleCount: number,
  percentile: number,
): number | null {
  if (sampleCount === 0) {
    return null;
  }

  const targetRank = Math.ceil(sampleCount * percentile);
  let cumulative = 0;

  for (const [tokenCount, frequency] of bins) {
    cumulative += frequency;
    if (cumulative >= targetRank) {
      return tokenCount;
    }
  }

  return null;
}

function meanFromBins(
  bins: readonly PlaceTokenCountDistributionBin[],
  sampleCount: number,
): number | null {
  if (sampleCount === 0) {
    return null;
  }

  return (
    bins.reduce(
      (sum, [tokenCount, frequency]) => sum + tokenCount * frequency,
      0,
    ) / sampleCount
  );
}

function buildTimelineData(
  experiment: ExperimentRecord,
  placeId: string,
): uPlot.AlignedData {
  const time: number[] = [];
  const median: (number | null)[] = [];
  const mean: (number | null)[] = [];
  const p10: (number | null)[] = [];
  const p90: (number | null)[] = [];

  for (const frame of experiment.distributionFrames) {
    const place = frame.places.find(
      (candidate) => candidate.placeId === placeId,
    );
    if (!place) {
      continue;
    }

    time.push(frame.time);
    median.push(percentileFromBins(place.bins, place.sampleCount, 0.5));
    mean.push(meanFromBins(place.bins, place.sampleCount));
    p10.push(percentileFromBins(place.bins, place.sampleCount, 0.1));
    p90.push(percentileFromBins(place.bins, place.sampleCount, 0.9));
  }

  return [time, median, mean, p10, p90] as uPlot.AlignedData;
}

function createEmptyTimelineData(): uPlot.AlignedData {
  return [[], [], [], [], []] as uPlot.AlignedData;
}

function chartOptions(width: number, height: number): uPlot.Options {
  return {
    width,
    height,
    pxAlign: false,
    padding: [0, 8, 4, null],
    cursor: {
      drag: { x: false, y: false, setScale: false },
    },
    legend: {
      show: false,
    },
    scales: {
      x: { time: false },
      y: { range: (_u, min, max) => [Math.min(0, min), Math.max(1, max)] },
    },
    axes: [
      {
        show: true,
        side: 0,
        size: 26,
        font: "10px system-ui",
        stroke: "#475569",
        grid: { stroke: "#f3f4f6", width: 1 },
        ticks: { stroke: "#cbd5e1", width: 1, size: 6 },
        values: (_u, vals) => vals.map((v) => `${v}s`),
      },
      {
        show: true,
        size: 54,
        font: "10px system-ui",
        stroke: "#999",
        grid: { stroke: "#f3f4f6", width: 1, dash: [4, 4] },
        ticks: { stroke: "#e5e7eb", width: 1 },
      },
    ],
    series: [
      {},
      {
        label: "median",
        stroke: "#111827",
        width: 2,
      },
      {
        label: "mean",
        stroke: "#d97706",
        width: 2,
        dash: [8, 6],
      },
      {
        label: "p10",
        stroke: "#94a3b8",
        width: 1,
      },
      {
        label: "p90",
        stroke: "#94a3b8",
        width: 1,
      },
    ],
  };
}

const legendItems = [
  { label: "median", color: "#111827", dash: "solid" },
  { label: "mean", color: "#d97706", dash: "dashed" },
  { label: "p10", color: "#94a3b8", dash: "solid" },
  { label: "p90", color: "#94a3b8", dash: "solid" },
] as const;

export const ExperimentTimeline = ({
  experiment,
  placeId,
  onPlaceIdChange,
}: {
  experiment: ExperimentRecord;
  placeId: string | null;
  onPlaceIdChange: (placeId: string) => void;
}) => {
  const {
    petriNetDefinition: { places },
  } = use(SDCPNContext);
  const rootRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const size = useElementSize(rootRef, { debounce: 50 });
  const distributionPlaceOptions =
    experiment.distributionFrames[0]?.places.map((place) => ({
      value: place.placeId,
      label:
        places.find((candidate) => candidate.id === place.placeId)?.name ??
        place.placeName,
    })) ?? [];
  const selectedPlaceId =
    placeId &&
    distributionPlaceOptions.some((option) => option.value === placeId)
      ? placeId
      : (distributionPlaceOptions[0]?.value ?? null);
  const data = selectedPlaceId
    ? buildTimelineData(experiment, selectedPlaceId)
    : null;
  const hasData = data ? data[0]!.length > 0 : false;

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !size || !selectedPlaceId || !hasData) {
      plotRef.current?.destroy();
      plotRef.current = null;
      root?.replaceChildren();
      return;
    }

    plotRef.current?.destroy();
    root.replaceChildren();
    const plot = new UPlot(
      chartOptions(size.width, Math.max(220, size.height)),
      createEmptyTimelineData(),
      root,
    );
    plotRef.current = plot;

    return () => {
      plotRef.current = null;
      plot.destroy();
    };
  }, [hasData, selectedPlaceId, size]);

  useEffect(() => {
    if (!data || !plotRef.current) {
      return;
    }

    plotRef.current.setData(data);
  }, [data]);

  if (experiment.distributionFrames.length === 0 || !selectedPlaceId) {
    return <div className={emptyStyle}>Waiting for experiment data</div>;
  }

  return (
    <div className={rootStyle}>
      <div className={headerStyle}>
        <span className={labelStyle}>Place</span>
        <Select
          size="xs"
          value={selectedPlaceId}
          options={distributionPlaceOptions}
          onValueChange={onPlaceIdChange}
          className={selectStyle}
        />
      </div>
      <div ref={rootRef} className={chartStyle} />
      <div className={legendStyle}>
        {legendItems.map((item) => (
          <span key={item.label} className={legendItemStyle}>
            <span
              className={legendSwatchStyle}
              style={{
                borderTopColor: item.color,
                borderTopStyle: item.dash,
              }}
            />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
};
