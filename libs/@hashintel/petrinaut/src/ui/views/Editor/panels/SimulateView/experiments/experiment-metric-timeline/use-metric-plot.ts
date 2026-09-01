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

/**
 * How the plot bridges a content change (a sweep selection moving): the old
 * picture is snapshotted into an overlay that persists through the compute
 * gap — dimmed ("dim") or as-is ("hold") — and fades out over ~300 ms once
 * the new content's first frames render. "off" cuts hard.
 */
export type PlotCrossfade = "dim" | "hold" | "off";

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
  contentEpoch,
  crossfade = "dim",
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
   * Identity of what the data REPRESENTS (a sweep's selection key). When it
   * changes, the previous picture crossfades out instead of cutting.
   */
  contentEpoch?: string;
  crossfade?: PlotCrossfade;
  /** Called as the pointer picks (or scrubs across) timeline frames. */
  onFrameSelect: (frame: MetricFrame, pointer: FrameSelectPointer) => void;
}): void {
  const plotRef = useRef<uPlot | null>(null);
  const latestDataRef = useRef(plotData);
  const latestFramesRef = useRef(frames);
  const epochRef = useRef(contentEpoch);
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
            isHeatmap
              ? [createDistributionHeatmapPlugin(latestFramesRef, epochRef)]
              : [],
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

  /**
   * An epoch change seen but not yet painted. Latched separately from the
   * scheduled frame: a same-epoch data tick can cancel the epoch-change
   * run's frame before it fires, and the transition (the overlay freeze)
   * must survive into whichever frame finally runs.
   */
  const pendingEpochChangeRef = useRef(false);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const overlayFadingRef = useRef(false);
  const dataFrameRef = useRef<number | null>(null);

  useEffect(() => {
    function applyData(hadEpochChange: boolean): void {
      const plot = plotRef.current;
      if (!plot) {
        return;
      }

      // A new epoch with old content still on the canvas: freeze that picture
      // into an overlay before the new data repaints under it. "Still on the
      // canvas" is read from the plot itself (`plot.data` predates the
      // `setData` below) — a drag crosses several empty epochs before frames
      // arrive, and those must keep the existing overlay, not blank it.
      if (hadEpochChange) {
        const plotShowsContent = plot.data[0]!.length > 0;
        if (crossfade !== "off" && plotShowsContent) {
          let overlay = overlayRef.current;
          if (!overlay || !plot.over.contains(overlay)) {
            overlay = document.createElement("canvas");
            overlay.style.position = "absolute";
            overlay.style.inset = "0";
            overlay.style.width = "100%";
            overlay.style.height = "100%";
            overlay.style.pointerEvents = "none";
            plot.over.appendChild(overlay);
            overlayRef.current = overlay;
          }
          overlay.width = Math.max(1, Math.round(plot.bbox.width));
          overlay.height = Math.max(1, Math.round(plot.bbox.height));
          overlay
            .getContext("2d")!
            .drawImage(
              plot.ctx.canvas,
              plot.bbox.left,
              plot.bbox.top,
              plot.bbox.width,
              plot.bbox.height,
              0,
              0,
              overlay.width,
              overlay.height,
            );
          overlay.style.transition = "none";
          overlay.style.display = "block";
          overlay.style.opacity = crossfade === "dim" ? "0.55" : "1";
          overlayFadingRef.current = false;
        }
      }

      plot.setData(plotData);
      const hasData = plotData[0]!.length > 0;

      // The new content's first frames are on screen: fade the old picture
      // out quickly instead of having already cut to the sparse new one.
      const overlay = overlayRef.current;
      if (
        hasData &&
        overlay !== null &&
        overlay.style.display !== "none" &&
        !overlayFadingRef.current
      ) {
        overlayFadingRef.current = true;
        const fadingOverlay = overlay;
        requestAnimationFrame(() => {
          fadingOverlay.style.transition = "opacity 300ms ease-out";
          fadingOverlay.style.opacity = "0";
        });
        const hide = () => {
          fadingOverlay.style.display = "none";
          fadingOverlay.removeEventListener("transitionend", hide);
        };
        fadingOverlay.addEventListener("transitionend", hide);
      }
    }

    // The epoch is tracked eagerly (a drag crosses several epochs between
    // paints), but the data applies once per animation frame, latest wins:
    // a streaming batch can tick the store faster than the screen refreshes,
    // and every `setData` redraws the whole chart, heatmap raster included.
    if (contentEpoch !== epochRef.current) {
      epochRef.current = contentEpoch;
      pendingEpochChangeRef.current = true;
    }
    if (dataFrameRef.current !== null) {
      cancelAnimationFrame(dataFrameRef.current);
    }
    dataFrameRef.current = requestAnimationFrame(() => {
      dataFrameRef.current = null;
      const hadEpochChange = pendingEpochChangeRef.current;
      pendingEpochChangeRef.current = false;
      applyData(hadEpochChange);
    });
    return () => {
      if (dataFrameRef.current !== null) {
        cancelAnimationFrame(dataFrameRef.current);
        dataFrameRef.current = null;
      }
    };
  }, [contentEpoch, crossfade, plotData]);
}
