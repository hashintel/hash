/**
 * The uPlot lifecycle behind the metric timeline: creates the right chart
 * for the current view (time series with an optional heatmap backdrop, or
 * the aggregated-distribution bar chart), streams data into it, and turns
 * pointer scrubbing into frame selections.
 */
import { useEffect, useRef } from "react";
import uPlot from "uplot";

import { createDistributionHeatmapPlugin } from "./use-metric-plot/distribution-heatmap";
import {
  chartOptions,
  distributionBarChartOptions,
} from "./use-metric-plot/plot-options";

import type {
  DistributionView,
  RunAggregation,
  TimeTrace,
} from "./shared/distribution-math";
import type { MetricFrame } from "./shared/metric-frames";
import type { RefObject } from "react";

const UPlot = uPlot;

/** Where on screen a frame was picked, in viewport coordinates. */
export type FrameSelectPointer = { clientX: number; clientY: number };

/** "number" renders no plot; the other two share one uPlot instance. */
export type MetricDisplayMode = "chart" | "distribution" | "number";

export function useMetricPlot({
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
  /** Called as the pointer picks (or scrubs across) timeline frames. */
  onFrameSelect: (frame: MetricFrame, pointer: FrameSelectPointer) => void;
}): void {
  const plotRef = useRef<uPlot | null>(null);
  const latestDataRef = useRef(plotData);
  const latestFramesRef = useRef(frames);
  /** Highest y ceiling shown by the current view; reset when the view changes. */
  const yFloorRef = useRef(0);
  const viewKeyRef = useRef("");

  useEffect(() => {
    latestDataRef.current = plotData;
  }, [plotData]);

  useEffect(() => {
    latestFramesRef.current = frames;
  }, [frames]);

  useEffect(() => {
    const viewKey = `${displayMode}|${aggregateRuns}|${runAggregation}|${distributionView}|${timeTrace}`;
    if (viewKeyRef.current !== viewKey) {
      viewKeyRef.current = viewKey;
      yFloorRef.current = 0;
    }
    const root = chartRootRef.current;
    if (!root || !size || !canPlot) {
      plotRef.current?.destroy();
      plotRef.current = null;
      root?.replaceChildren();
      return;
    }

    const isHeatmap =
      displayMode === "chart" &&
      outputType === "distribution" &&
      !aggregateRuns &&
      distributionView === "heatmap";

    plotRef.current?.destroy();
    root.replaceChildren();
    const plot = new UPlot(
      displayMode === "distribution"
        ? distributionBarChartOptions(size.width, Math.max(220, size.height))
        : chartOptions(
            size.width,
            Math.max(220, size.height),
            outputType,
            aggregateRuns,
            runAggregation,
            distributionView,
            timeTrace,
            latestFramesRef,
            timeDomainStart !== undefined && timeDomainEnd !== undefined
              ? [timeDomainStart, timeDomainEnd]
              : undefined,
            yFloorRef,
            isHeatmap ? [createDistributionHeatmapPlugin(latestFramesRef)] : [],
          ),
      [[], []] as uPlot.AlignedData,
      root,
    );
    plot.setData(latestDataRef.current);
    plotRef.current = plot;

    // Click-to-inspect only applies to the per-frame timeline, not the
    // aggregated-distribution bar chart (which has no time axis).
    if (displayMode !== "chart") {
      return () => {
        plotRef.current = null;
        plot.destroy();
      };
    }

    const selectFrameAtPointer = (event: PointerEvent) => {
      const overRect = plot.over.getBoundingClientRect();
      const x = Math.min(
        Math.max(event.clientX - overRect.left, 0),
        overRect.width,
      );
      const idx = plot.posToIdx(x, false);
      const frame = latestFramesRef.current[idx];

      if (frame) {
        onFrameSelect(frame, {
          clientX: event.clientX,
          clientY: event.clientY,
        });
      }
    };
    let dragging = false;

    const handlePointerDown = (event: PointerEvent) => {
      dragging = true;
      plot.over.setPointerCapture(event.pointerId);
      selectFrameAtPointer(event);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (dragging) {
        selectFrameAtPointer(event);
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (!dragging) {
        return;
      }

      dragging = false;
      if (plot.over.hasPointerCapture(event.pointerId)) {
        plot.over.releasePointerCapture(event.pointerId);
      }
    };

    plot.over.addEventListener("pointerdown", handlePointerDown);
    plot.over.addEventListener("pointermove", handlePointerMove);
    plot.over.addEventListener("pointerup", handlePointerUp);
    plot.over.addEventListener("pointercancel", handlePointerUp);

    return () => {
      plot.over.removeEventListener("pointerdown", handlePointerDown);
      plot.over.removeEventListener("pointermove", handlePointerMove);
      plot.over.removeEventListener("pointerup", handlePointerUp);
      plot.over.removeEventListener("pointercancel", handlePointerUp);
      plotRef.current = null;
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

  useEffect(() => {
    if (!plotRef.current) {
      return;
    }

    plotRef.current.setData(plotData);
  }, [plotData]);
}
