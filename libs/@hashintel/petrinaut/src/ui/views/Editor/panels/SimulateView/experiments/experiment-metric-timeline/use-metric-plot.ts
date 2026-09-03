/**
 * The uPlot lifecycle behind the metric timeline: one chart per view shape
 * and size, content applied once per animation frame (latest wins), the
 * previous picture crossfaded out on a content change, and pointer
 * scrubbing turned into frame picks.
 */
import { useEffect, useRef } from "react";
import uPlot from "uplot";

import { createCrossfadeOverlay } from "./use-metric-plot/crossfade-overlay";
import { createDistributionHeatmapPlugin } from "./use-metric-plot/distribution-heatmap";
import { attachFrameScrubbing } from "./use-metric-plot/frame-scrubbing";
import {
  chartOptions,
  distributionBarChartOptions,
} from "./use-metric-plot/plot-options";

import type {
  DistributionView,
  MetricDisplayMode,
  RunAggregation,
  TimeTrace,
} from "./shared/distribution-math";
import type { MetricFrame } from "./shared/metric-frames";
import type { CrossfadeOverlay } from "./use-metric-plot/crossfade-overlay";
import type { FramePick } from "./use-metric-plot/frame-scrubbing";
import type { YCeiling } from "./use-metric-plot/plot-options";
import type { RefObject } from "react";

export type { FramePick } from "./use-metric-plot/frame-scrubbing";

const UPlot = uPlot;
/** Below this the axes and labels no longer fit. */
const MIN_PLOT_HEIGHT = 220;

type PlotContent = {
  frames: readonly MetricFrame[];
  plotData: uPlot.AlignedData;
  epoch: string | undefined;
};

type MountedPlot = { plot: uPlot; overlay: CrossfadeOverlay };

const applyContent = (
  { plot, overlay }: MountedPlot,
  content: PlotContent,
  hadEpochChange: boolean,
): void => {
  // Whether old content is still on screen is read from the plot itself: a
  // drag crosses several empty epochs before frames arrive, and those must
  // keep the frozen picture rather than freeze a blank one.
  if (hadEpochChange && plot.data[0]!.length > 0) {
    overlay.freeze();
  }
  plot.setData(content.plotData);
  if (content.plotData[0]!.length > 0) {
    overlay.fadeOut();
  }
};

export const useMetricPlot = ({
  chartRootRef,
  size,
  canPlot,
  displayMode,
  outputType,
  aggregateRuns,
  runAggregation,
  distributionView,
  timeTrace,
  timeDomainStart,
  timeDomainEnd,
  frames,
  plotData,
  contentEpoch,
  onFrameSelect,
}: {
  chartRootRef: RefObject<HTMLDivElement | null>;
  size: { width: number; height: number } | null;
  canPlot: boolean;
  displayMode: MetricDisplayMode;
  outputType: MetricFrame["outputType"];
  aggregateRuns: boolean;
  runAggregation: RunAggregation;
  distributionView: DistributionView;
  timeTrace: TimeTrace;
  timeDomainStart: number | undefined;
  timeDomainEnd: number | undefined;
  frames: readonly MetricFrame[];
  plotData: uPlot.AlignedData;
  /**
   * Identity of what the frames represent (a sweep's selection key). When it
   * changes, the previous picture crossfades out instead of cutting.
   */
  contentEpoch: string | undefined;
  /** Called as the pointer picks (or scrubs across) timeline frames. */
  onFrameSelect: (pick: FramePick) => void;
}): void => {
  const mountedRef = useRef<MountedPlot | null>(null);
  /** What the plot shows; uPlot callbacks read it at draw and pointer time. */
  const contentRef = useRef<PlotContent>({
    frames,
    plotData,
    epoch: contentEpoch,
  });
  const yCeilingRef = useRef<{ viewKey: string; ceiling: YCeiling }>({
    viewKey: "",
    ceiling: { value: 0 },
  });
  /**
   * The animation frame that applies the latest content, and whether an
   * epoch change waits for it. The change is latched apart from the frame:
   * a same-epoch tick cancels the frame scheduled for the change, and the
   * overlay freeze must survive into whichever frame finally runs.
   */
  const pendingRef = useRef<{ frame: number | null; epochChange: boolean }>({
    frame: null,
    epochChange: false,
  });

  // Content is tracked at once, so a plot created in the same commit shows
  // it, and applied once per animation frame, latest wins: a streaming batch
  // can tick faster than the screen refreshes, and every `setData` redraws
  // the whole chart, heatmap raster included.
  useEffect(() => {
    const pending = pendingRef.current;
    pending.epochChange ||= contentEpoch !== contentRef.current.epoch;
    contentRef.current = { frames, plotData, epoch: contentEpoch };
    if (pending.frame !== null) {
      cancelAnimationFrame(pending.frame);
    }
    pending.frame = requestAnimationFrame(() => {
      pending.frame = null;
      const hadEpochChange = pending.epochChange;
      pending.epochChange = false;
      const mounted = mountedRef.current;
      if (mounted) {
        applyContent(mounted, contentRef.current, hadEpochChange);
      }
    });
    return () => {
      if (pending.frame !== null) {
        cancelAnimationFrame(pending.frame);
        pending.frame = null;
      }
    };
  }, [contentEpoch, frames, plotData]);

  useEffect(() => {
    const viewKey = `${displayMode}|${aggregateRuns}|${runAggregation}|${distributionView}|${timeTrace}`;
    if (yCeilingRef.current.viewKey !== viewKey) {
      yCeilingRef.current = { viewKey, ceiling: { value: 0 } };
    }
    const root = chartRootRef.current;
    if (!root || !size || !canPlot) {
      return;
    }
    const height = Math.max(MIN_PLOT_HEIGHT, size.height);
    const isHeatmap =
      displayMode === "chart" &&
      outputType === "distribution" &&
      !aggregateRuns &&
      distributionView === "heatmap";
    const options =
      displayMode === "distribution"
        ? distributionBarChartOptions(size.width, height)
        : chartOptions({
            width: size.width,
            height,
            shape: {
              outputType,
              aggregateRuns,
              runAggregation,
              distributionView,
              timeTrace,
              timeDomain:
                timeDomainStart !== undefined && timeDomainEnd !== undefined
                  ? [timeDomainStart, timeDomainEnd]
                  : undefined,
            },
            getFrames: () => contentRef.current.frames,
            yCeiling: yCeilingRef.current.ceiling,
            plugins: isHeatmap
              ? [createDistributionHeatmapPlugin(() => contentRef.current)]
              : [],
          });
    const plot = new UPlot(options, [[], []] as uPlot.AlignedData, root);
    plot.setData(contentRef.current.plotData);
    mountedRef.current = { plot, overlay: createCrossfadeOverlay(plot) };
    // The bar chart has no time axis, so no frame sits under the pointer.
    const detachScrubbing =
      displayMode === "chart"
        ? attachFrameScrubbing(
            plot,
            () => contentRef.current.frames,
            onFrameSelect,
          )
        : null;

    return () => {
      detachScrubbing?.();
      mountedRef.current = null;
      plot.destroy();
    };
  }, [
    aggregateRuns,
    canPlot,
    chartRootRef,
    displayMode,
    distributionView,
    onFrameSelect,
    outputType,
    runAggregation,
    size,
    timeDomainEnd,
    timeDomainStart,
    timeTrace,
  ]);
};
