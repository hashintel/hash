import { use, useEffect, useMemo, useRef } from "react";
import uPlot from "uplot";

import { useElementSize } from "../../../../../../../react/hooks/use-element-size";
import "uplot/dist/uPlot.min.css";

import { useLatest } from "../../../../../../../react/hooks/use-latest";
import { useStableCallback } from "../../../../../../../react/hooks/use-stable-callback";
import { PlaybackContext } from "../../../../../../../react/playback/context";
import { tooltipDotStyle, tooltipLabelStyle, tooltipStyle, tooltipValueStyle } from "./styles";

import type { TimelineChartType } from "../../../../../../../react/state/editor-context";
import type { StreamingStore, TimelineSeriesMeta } from "./types";
import type { FC, RefObject } from "react";

function buildRunData(
  store: StreamingStore,
  hiddenSeries: Set<string>,
  length = store.length,
): uPlot.AlignedData {
  const result: (number | null | undefined)[][] = [store.columns[0]!];
  for (let i = 0; i < store.series.length; i++) {
    if (hiddenSeries.has(store.series[i]!.seriesId)) {
      result.push(new Array(length).fill(null));
    } else {
      result.push(store.columns[i + 1]!);
    }
  }
  return result as uPlot.AlignedData;
}

function buildStackedData(
  store: StreamingStore,
  hiddenSeries: Set<string>,
  length = store.length,
): uPlot.AlignedData {
  const visible = store.series
    .map((p, i) => ({ ...p, colIdx: i + 1 }))
    .filter((p) => !hiddenSeries.has(p.seriesId));

  const cumulative = new Float64Array(length);
  const series: number[][] = [];

  for (const p of visible) {
    const col = store.columns[p.colIdx]!;
    const stacked = new Array<number>(length);
    for (let i = 0; i < length; i++) {
      cumulative[i]! += col[i] ?? 0;
      stacked[i] = cumulative[i]!;
    }
    series.push(stacked);
  }

  series.reverse();

  return [store.columns[0]!, ...series] as uPlot.AlignedData;
}

interface TooltipNodes {
  root: HTMLDivElement;
  dot: HTMLDivElement;
  name: HTMLSpanElement;
  value: HTMLSpanElement;
  time: HTMLDivElement;
  frame: HTMLDivElement;
}

function createTooltip(): TooltipNodes {
  const root = document.createElement("div");
  root.className = tooltipStyle;

  const label = document.createElement("div");
  label.className = tooltipLabelStyle;

  const dot = document.createElement("div");
  dot.className = tooltipDotStyle;

  const name = document.createElement("span");

  const value = document.createElement("span");
  value.className = tooltipValueStyle;

  label.append(dot, name, value);

  const time = document.createElement("div");
  time.style.cssText = "font-size:10px;opacity:0.8;margin-top:2px";

  const frame = document.createElement("div");
  frame.style.cssText = "font-size:9px;opacity:0.6;margin-top:2px";

  root.append(label, time, frame);

  return { root, dot, name, value, time, frame };
}

function hitTestStackedBand(
  store: StreamingStore,
  hiddenSeries: Set<string>,
  idx: number,
  yVal: number,
): { seriesIdx: number; value: number } | null {
  if (yVal < 0) {
    return null;
  }
  let cumul = 0;
  for (let i = 0; i < store.series.length; i++) {
    if (hiddenSeries.has(store.series[i]!.seriesId)) {
      continue;
    }
    const v = store.columns[i + 1]![idx] ?? 0;
    cumul += v;
    if (yVal <= cumul) {
      return { seriesIdx: i, value: v };
    }
  }
  return null;
}

interface HoverHit {
  series: TimelineSeriesMeta;
  value: number;
  idx: number;
  time: number;
}

function resolveHoverTarget(
  u: uPlot,
  store: StreamingStore,
  chartType: TimelineChartType,
  hiddenSeries: Set<string>,
  focusedSeriesIdx: number,
): HoverHit | null {
  const idx = u.cursor.idx;
  if (idx == null || idx < 0 || store.length === 0) {
    return null;
  }

  let seriesIdx: number;
  let value: number;

  if (chartType === "stacked") {
    const top = u.cursor.top;
    if (top == null || top < 0) {
      return null;
    }
    const hit = hitTestStackedBand(store, hiddenSeries, idx, u.posToVal(top, "y"));
    if (!hit) {
      return null;
    }
    seriesIdx = hit.seriesIdx;
    value = hit.value;
  } else {
    if (focusedSeriesIdx < 1) {
      return null;
    }
    seriesIdx = focusedSeriesIdx - 1;
    if (hiddenSeries.has(store.series[seriesIdx]?.seriesId ?? "")) {
      return null;
    }
    value = store.columns[focusedSeriesIdx]?.[idx] ?? 0;
  }

  const series = store.series[seriesIdx];
  if (!series) {
    return null;
  }

  return { series, value, idx, time: store.columns[0]![idx] ?? 0 };
}

function positionTooltip(tooltip: TooltipNodes, u: uPlot, hit: HoverHit): void {
  const t = tooltip;
  t.dot.style.background = hit.series.color;
  t.name.textContent = hit.series.seriesName;
  t.value.textContent = String(hit.value);
  t.time.textContent = `${hit.time.toFixed(3)}s`;
  t.frame.textContent = `Frame ${hit.idx}`;

  t.root.style.display = "block";
  const cx = u.cursor.left ?? 0;
  const cy = u.cursor.top ?? 0;
  const ow = u.over.clientWidth;
  const oh = u.over.clientHeight;
  const tw = t.root.offsetWidth;
  const th = t.root.offsetHeight;
  const margin = 10;

  let left = cx - tw / 2;
  if (left < 0) {
    left = 0;
  } else if (left + tw > ow) {
    left = ow - tw;
  }

  let top = cy - th - margin;
  if (top < 0) {
    top = Math.min(cy + margin, oh - th);
  }

  t.root.style.left = `${left}px`;
  t.root.style.top = `${top}px`;
}

function drawPlayhead(u: uPlot, frameIdx: number): void {
  const times = u.data[0]!;
  if (times.length === 0) {
    return;
  }

  const dpr = devicePixelRatio;
  const time = times[Math.min(frameIdx, times.length - 1)]!;
  const cx = u.valToPos(time, "x", true);
  const plotTop = u.bbox.top;
  const plotHeight = u.bbox.height;
  const ctx = u.ctx;

  const headW = 12 * dpr;
  const rectH = 6 * dpr;
  const tipH = 6 * dpr;
  const radius = 3 * dpr;
  const tipY = plotTop;
  const baseY = tipY - tipH;
  const topY = baseY - rectH;
  const leftX = cx - headW / 2;
  const rightX = cx + headW / 2;

  ctx.save();

  ctx.fillStyle = "#1e293b";
  ctx.beginPath();
  ctx.moveTo(leftX, topY + radius);
  ctx.arcTo(leftX, topY, leftX + radius, topY, radius);
  ctx.lineTo(rightX - radius, topY);
  ctx.arcTo(rightX, topY, rightX, topY + radius, radius);
  ctx.lineTo(rightX, baseY);
  ctx.lineTo(cx, tipY);
  ctx.lineTo(leftX, baseY);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1 * dpr;
  ctx.stroke();

  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 1.5 * dpr;
  ctx.beginPath();
  ctx.moveTo(cx, tipY - 4 * dpr);
  ctx.lineTo(cx, tipY + plotHeight);
  ctx.stroke();

  ctx.restore();
}

interface ChartOptions {
  store: StreamingStore;
  storeRef: RefObject<StreamingStore>;
  chartType: TimelineChartType;
  hiddenSeries: Set<string>;
  size: { width: number; height: number };
  onScrub: (frameIndex: number) => void;
  getPlayheadFrame: () => number;
  tooltip: TooltipNodes;
}

function buildUPlotOptions(opts: ChartOptions): uPlot.Options {
  const {
    store,
    storeRef,
    chartType,
    hiddenSeries,
    size,
    onScrub,
    getPlayheadFrame,
    tooltip: t,
  } = opts;

  let focused = -1;

  const updateTooltip = (u: uPlot) => {
    const hit = resolveHoverTarget(u, storeRef.current, chartType, hiddenSeries, focused);
    if (!hit) {
      t.root.style.display = "none";
      return;
    }
    positionTooltip(t, u, hit);
  };

  const series: uPlot.Series[] = [{ label: "Time" }];
  let bands: uPlot.Band[] | undefined;

  if (chartType === "stacked") {
    const visible = store.series.filter((p) => !hiddenSeries.has(p.seriesId)).reverse();
    for (const p of visible) {
      series.push({
        label: p.seriesName,
        stroke: p.color,
        fill: `color-mix(in srgb, ${p.color} 53%, transparent)`,
        width: 2,
      });
    }
    if (visible.length > 1) {
      bands = [];
      for (let i = 1; i < visible.length; i++) {
        bands.push({ series: [i, i + 1] as [number, number] });
      }
    }
  } else {
    for (const p of store.series) {
      series.push({
        label: p.seriesName,
        stroke: p.color,
        width: 2,
        show: !hiddenSeries.has(p.seriesId),
      });
    }
  }

  return {
    width: size.width,
    height: size.height,
    series,
    bands,
    pxAlign: false,
    padding: [0, 8, 4, null],
    cursor: {
      lock: false,
      drag: { x: false, y: false, setScale: false },
      focus: { prox: 16 },
      bind: {
        mousedown: (u, _targ, handler) => (e: MouseEvent) => {
          handler(e);
          if (u.cursor.left != null && u.cursor.left >= 0) {
            onScrub(u.posToIdx(u.cursor.left));
          }
          return null;
        },
        mousemove: (u, _targ, handler) => (e: MouseEvent) => {
          handler(e);
          if (e.buttons === 1 && u.cursor.left != null && u.cursor.left >= 0) {
            onScrub(u.posToIdx(u.cursor.left));
          }
          return null;
        },
      },
    },
    legend: { show: false },
    focus: { alpha: chartType === "stacked" ? 1 : 0.3 },
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
    scales: {
      x: { time: false, range: (_u, min, max) => [min, max] },
      y: {
        auto: true,
        range: (_u, min, max) => [Math.min(0, min), Math.max(1, max * 1.05)],
      },
    },
    hooks: {
      drawClear: [
        (u) => {
          const { ctx } = u;
          const { left: bx, width: bw, top: by } = u.bbox;
          const dpr = devicePixelRatio;
          ctx.save();
          ctx.strokeStyle = "#cbd5e1";
          ctx.lineWidth = dpr;
          ctx.beginPath();
          ctx.moveTo(bx, by - 0.5 * dpr);
          ctx.lineTo(bx + bw, by - 0.5 * dpr);
          ctx.stroke();
          ctx.restore();
        },
      ],
      setSeries: [
        (u, sIdx) => {
          focused = sIdx ?? -1;
          updateTooltip(u);
        },
      ],
      setCursor: [(u) => updateTooltip(u)],
      draw: [(u) => drawPlayhead(u, getPlayheadFrame())],
    },
  };
}

function attachRulerScrubbing(u: uPlot, onScrub: (frameIndex: number) => void): () => void {
  let dragging = false;
  let overRect: DOMRect | null = null;

  const onDown = (e: PointerEvent) => {
    overRect = u.over.getBoundingClientRect();
    if (e.clientY >= overRect.top) {
      return;
    }
    if (e.clientX < overRect.left || e.clientX > overRect.right) {
      return;
    }
    dragging = true;
    u.root.setPointerCapture(e.pointerId);
    const x = Math.max(0, Math.min(e.clientX - overRect.left, overRect.width));
    onScrub(u.posToIdx(x));
  };

  const onMove = (e: PointerEvent) => {
    if (dragging && overRect) {
      const x = Math.max(0, Math.min(e.clientX - overRect.left, overRect.width));
      onScrub(u.posToIdx(x));
    }
  };

  const onUp = (e: PointerEvent) => {
    if (dragging) {
      dragging = false;
      u.root.releasePointerCapture(e.pointerId);
    }
  };

  u.root.addEventListener("pointerdown", onDown);
  u.root.addEventListener("pointermove", onMove);
  u.root.addEventListener("pointerup", onUp);
  u.root.addEventListener("pointercancel", onUp);

  return () => {
    u.root.removeEventListener("pointerdown", onDown);
    u.root.removeEventListener("pointermove", onMove);
    u.root.removeEventListener("pointerup", onUp);
    u.root.removeEventListener("pointercancel", onUp);
  };
}

export const UPlotChart: FC<{
  store: StreamingStore;
  chartType: TimelineChartType;
  hiddenSeries: Set<string>;
  totalFrames: number;
  currentFrameIndex: number;
  className?: string;
}> = ({ store, chartType, hiddenSeries, totalFrames, currentFrameIndex, className }) => {
  "use no memo";

  const { setCurrentViewedFrame } = use(PlaybackContext);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  const playheadFrameRef = useRef(currentFrameIndex);
  const storeRef = useLatest(store);

  const size = useElementSize(wrapperRef);
  const hasSize = size != null;
  const dataLength = store.length;

  const onScrub = useStableCallback((idx: number) => {
    setCurrentViewedFrame(Math.max(0, Math.min(idx, totalFrames - 1)));
  });

  const data = useMemo(
    () =>
      chartType === "stacked"
        ? buildStackedData(store, hiddenSeries, dataLength)
        : buildRunData(store, hiddenSeries, dataLength),
    [store, dataLength, chartType, hiddenSeries],
  );

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !hasSize) {
      return;
    }

    const initialSize = {
      width: wrapper.clientWidth,
      height: wrapper.clientHeight,
    };

    const initialData =
      chartType === "stacked"
        ? buildStackedData(store, hiddenSeries)
        : buildRunData(store, hiddenSeries);

    const tooltip = createTooltip();

    const opts = buildUPlotOptions({
      store,
      storeRef,
      chartType,
      hiddenSeries,
      size: initialSize,
      onScrub,
      getPlayheadFrame: () => playheadFrameRef.current,
      tooltip,
    });

    chartRef.current?.destroy();

    // eslint-disable-next-line new-cap -- uPlot's constructor is lowercase by convention
    const u = new uPlot(opts, initialData, wrapper);
    chartRef.current = u;

    u.over.appendChild(tooltip.root);

    const cleanupRuler = attachRulerScrubbing(u, onScrub);

    return () => {
      cleanupRuler();
      u.destroy();
      chartRef.current = null;
    };
  }, [chartType, hiddenSeries, store, store.series.length, storeRef, hasSize, onScrub]);

  useEffect(() => {
    if (chartRef.current && size && size.width > 0 && size.height > 0) {
      chartRef.current.setSize(size);
    }
  }, [size]);

  useEffect(() => {
    chartRef.current?.setData(data);
  }, [data]);

  useEffect(() => {
    playheadFrameRef.current = currentFrameIndex;
    chartRef.current?.redraw(false, false);
  }, [currentFrameIndex]);

  return <div ref={wrapperRef} className={className} />;
};
