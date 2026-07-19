/* eslint-disable canonical/filename-no-index -- directory entry point */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { css, cx } from "@hashintel/ds-helpers/css";

import { trackSupplyChainInteraction } from "../../../shared/telemetry";
import { Tooltip } from "../../../shared/tooltip";
import { deriveScheduleModel } from "./model";

import type {
  ProductionSchedule,
  ProductionScheduleBatch,
} from "../../../shared/production-schedule-types";
import type { BatchDirectUse } from "./model";

const DAY_MS = 86_400_000;
const LABEL_WIDTH = 220;
const LANE_HEIGHT = 82;
const MAX_ZOOM_SCALE = 8;
const ZOOM_STEP = 1.4;

type RangePreset = "3m" | "6m" | "12m" | "all" | "custom";

const root = css({
  display: "flex",
  flexDirection: "column",
  h: "full",
  minH: "0",
  minW: "0",
  w: "full",
  maxW: "full",
  gap: "3",
});
const toolbar = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "end",
  gap: "3",
  p: "3",
  borderWidth: "1px",
  borderColor: "bd.subtle",
  borderRadius: "md",
  bg: "bg.surface",
  boxSizing: "border-box",
  maxW: "full",
});
const toolbarGroup = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
});
const field = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  textStyle: "xs",
  color: "fg.subtle",
  minW: "0",
  maxW: "full",
});
const control = css({
  h: "8",
  minW: "28",
  px: "2",
  borderWidth: "1px",
  borderColor: "bd.subtle",
  borderRadius: "sm",
  bg: "bg.surface",
  color: "fg.heading",
  textStyle: "xs",
});
const dateControl = css({ minW: "32" });
const zoomButton = css({
  h: "8",
  minW: "8",
  px: "2",
  borderWidth: "1px",
  borderColor: "bd.subtle",
  bg: "bg.surface",
  color: "fg.heading",
  textStyle: "xs",
  cursor: "pointer",
  _hover: { bg: "bg.subtle" },
  _focusVisible: { outline: "2px solid" },
  _disabled: {
    cursor: "not-allowed",
    opacity: "0.45",
  },
});
const summary = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  minW: "0",
  w: "full",
  maxW: "full",
  gap: "2",
  textStyle: "xs",
  color: "fg.subtle",
});
const legend = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "3",
});
const legendItem = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
});
const swatch = css({
  display: "inline-block",
  w: "4",
  h: "3",
  borderWidth: "1px",
  borderColor: "bd.strong",
  borderRadius: "xs",
});
const chartFrame = css({
  flex: "1",
  minH: "56",
  minW: "0",
  w: "full",
  maxW: "full",
  overflow: "auto",
  boxSizing: "border-box",
  borderWidth: "1px",
  borderColor: "bd.subtle",
  borderRadius: "md",
  bg: "bg.surface",
});
const chart = css({
  position: "relative",
  minH: "full",
});
const chartRow = css({
  display: "flex",
  position: "relative",
});
const laneLabel = css({
  position: "sticky",
  left: "0",
  zIndex: "[10]",
  flex: "none",
  w: "[220px]",
  boxSizing: "border-box",
  px: "3",
  py: "3",
  borderRightWidth: "1px",
  borderRightColor: "bd.subtle",
  borderBottomWidth: "1px",
  borderBottomColor: "bd.subtle",
  bg: "bg.surface",
  overflow: "hidden",
});
const axisLabel = css({
  position: "sticky",
  left: "0",
  zIndex: "[11]",
  flex: "none",
  w: "[220px]",
  h: "[42px]",
  boxSizing: "border-box",
  borderRightWidth: "1px",
  borderRightColor: "bd.subtle",
  borderBottomWidth: "1px",
  borderBottomColor: "bd.subtle",
  backgroundColor: "[#f8fafc]",
  overflow: "hidden",
});
const laneName = css({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  textStyle: "sm",
  fontWeight: "semibold",
  color: "fg.heading",
});
const laneMeta = css({
  mt: "1",
  textStyle: "xs",
  color: "fg.subtle",
});
const timelineLane = css({
  position: "relative",
  flex: "none",
  h: "[82px]",
  boxSizing: "border-box",
  borderBottomWidth: "1px",
  borderBottomColor: "bd.subtle",
});
const axis = css({
  position: "relative",
  flex: "none",
  h: "[42px]",
  boxSizing: "border-box",
  borderBottomWidth: "1px",
  borderBottomColor: "bd.subtle",
  bg: "bg.surface",
});
const tick = css({
  position: "absolute",
  top: "0",
  bottom: "0",
  borderLeftWidth: "1px",
  borderLeftColor: "bd.subtle",
});
const tickLabel = css({
  position: "absolute",
  top: "2",
  left: "1",
  textStyle: "xs",
  color: "fg.subtle",
  whiteSpace: "nowrap",
});
const batchPosition = css({
  position: "absolute",
  top: "[17px]",
  h: "[48px]",
});
const batchButton = css({
  position: "relative",
  w: "full",
  h: "[48px]",
  minW: "[3px]",
  overflow: "hidden",
  borderWidth: "1px",
  borderRadius: "sm",
  color: "white",
  textAlign: "left",
  cursor: "pointer",
  _focusVisible: {
    outline: "2px solid",
    outlineColor: "fg.heading",
    outlineOffset: "[2px]",
  },
});
const marker = css({
  position: "absolute",
  top: "1",
  right: "1",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  w: "4",
  h: "4",
  borderRadius: "full",
  bg: "bg.surface",
  color: "fg.heading",
  fontSize: "xs",
  fontWeight: "semibold",
});
const tooltipContent = css({
  display: "grid",
  gap: "1",
  maxW: "[360px]",
  textAlign: "left",
  whiteSpace: "normal",
});
const tooltipTitle = css({ fontWeight: "semibold" });
const empty = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minH: "56",
  textStyle: "sm",
  color: "fg.subtle",
});

const parseDay = (date: string): number =>
  Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);

const formatDay = (day: number): string =>
  new Date(day * DAY_MS).toISOString().slice(0, 10);

const formatQuantity = (value: number): string =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);

const subtractMonths = (date: string, months: number): string => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() - months);
  return value.toISOString().slice(0, 10);
};

const stateColor = (directUse: BatchDirectUse | undefined): string => {
  switch (directUse?.state) {
    case "used_elsewhere":
      return "#7c3aed";
    case "no_recorded_consumption":
      return "#94a3b8";
    case "unknown_output":
      return "#d97706";
    case "in_hierarchy":
    default:
      return "#2563eb";
  }
};

const BatchTooltipContent = ({
  batch,
  directUse,
  materialNameByMaterial,
  isFinishedGood,
}: {
  batch: ProductionScheduleBatch;
  directUse: BatchDirectUse | undefined;
  materialNameByMaterial: ReadonlyMap<string, string>;
  isFinishedGood: boolean;
}) => {
  const inProductConsumers =
    directUse?.consumers.filter((consumer) => !consumer.isOutsideHierarchy) ??
    [];
  const otherProductConsumers =
    directUse?.consumers.filter((consumer) => consumer.isOutsideHierarchy) ??
    [];
  const consumerRow = (
    consumer: BatchDirectUse["consumers"][number],
    label: string,
  ) => (
    <span key={consumer.material}>
      {label}:{" "}
      {materialNameByMaterial.get(consumer.material) ?? consumer.material}
      {consumer.quantity == null
        ? " · quantity not attributable"
        : ` · ${formatQuantity(consumer.quantity)} ${batch.uom ?? ""}`}
    </span>
  );

  return (
    <div className={tooltipContent}>
      <span className={tooltipTitle}>Batch {batch.batch ?? batch.order}</span>
      <span>
        {batch.start} – {batch.end} ·{" "}
        {batch.quantity == null
          ? "Output quantity unavailable"
          : `${formatQuantity(batch.quantity)} ${batch.uom ?? ""}`}
      </span>
      {isFinishedGood ? (
        <span>Finished product output</span>
      ) : (
        <>
          {inProductConsumers.map((consumer) =>
            consumerRow(consumer, "Used by"),
          )}
          {otherProductConsumers.map((consumer) =>
            consumerRow(consumer, "Also used for other products"),
          )}
          {directUse?.state === "no_recorded_consumption" && (
            <span>No recorded direct consumption</span>
          )}
          {directUse?.hasUnknownOutput && (
            <span>
              Some recorded consumption has an unknown immediate output
            </span>
          )}
          {(directUse?.unconsumedQuantity ?? 0) > 0 && (
            <span>
              No recorded consumption:{" "}
              {formatQuantity(directUse!.unconsumedQuantity)} {batch.uom ?? ""}
            </span>
          )}
        </>
      )}
    </div>
  );
};

export const ProductionScheduleView = ({
  schedule,
  productNameByMaterial,
}: {
  schedule: ProductionSchedule;
  productNameByMaterial: ReadonlyMap<string, string>;
}) => {
  const artifactDates = schedule.lanes.flatMap((lane) =>
    lane.batches.flatMap((batch) => [batch.start, batch.end]),
  );
  const artifactStart =
    artifactDates.length > 0
      ? artifactDates.reduce((earliest, date) =>
          date < earliest ? date : earliest,
        )
      : null;
  const artifactEnd =
    artifactDates.length > 0
      ? artifactDates.reduce((latest, date) => (date > latest ? date : latest))
      : null;
  const [preset, setPreset] = useState<RangePreset>("all");
  const [customStart, setCustomStart] = useState(artifactStart ?? "");
  const [customEnd, setCustomEnd] = useState(artifactEnd ?? "");
  const [zoomScale, setZoomScale] = useState(1);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const chartFrameRef = useRef<HTMLDivElement>(null);
  const pendingViewportCenterRef = useRef<number | "start" | null>(null);

  useEffect(() => {
    const frame = chartFrameRef.current;
    if (!frame) {
      return;
    }
    const updateViewportWidth = () => setViewportWidth(frame.clientWidth);
    updateViewportWidth();
    const resizeObserver = new ResizeObserver(updateViewportWidth);
    resizeObserver.observe(frame);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const clearSelection = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedBatchId(null);
      }
    };
    window.addEventListener("keydown", clearSelection);
    return () => window.removeEventListener("keydown", clearSelection);
  }, []);

  const selectedRange = useMemo(() => {
    if (!artifactEnd || preset === "all") {
      return { start: null, end: null };
    }
    if (preset === "custom") {
      return {
        start: customStart || null,
        end: customEnd || null,
      };
    }
    return {
      start: subtractMonths(
        artifactEnd,
        { "3m": 3, "6m": 6, "12m": 12 }[preset],
      ),
      end: artifactEnd,
    };
  }, [artifactEnd, customEnd, customStart, preset]);

  const model = useMemo(
    () => deriveScheduleModel(schedule, selectedRange),
    [schedule, selectedRange],
  );
  const materialNameByMaterial = useMemo(
    () =>
      new Map([
        ...productNameByMaterial,
        ...schedule.lanes.map((lane) => [lane.material, lane.name] as const),
      ]),
    [productNameByMaterial, schedule.lanes],
  );

  const startDay = model.start ? parseDay(model.start) : 0;
  const endDay = model.end ? parseDay(model.end) : startDay;
  const dayCount = Math.max(1, endDay - startDay + 1);
  const availablePlotWidth = Math.max(360, viewportWidth - LABEL_WIDTH);
  const plotWidth = availablePlotWidth * zoomScale;
  const effectivePixelsPerDay = plotWidth / dayCount;
  const tickInterval = Math.max(
    1,
    Math.round(90 / Math.max(effectivePixelsPerDay, 0.1)),
  );
  const ticks = Array.from(
    { length: Math.ceil(dayCount / tickInterval) },
    (_, index) => startDay + index * tickInterval,
  ).filter((day) => day <= endDay);
  const leftForDate = (date: string) =>
    (parseDay(date) - startDay) * (plotWidth / dayCount);
  const widthForDays = (days: number) =>
    Math.max(3, days * (plotWidth / dayCount));

  useLayoutEffect(() => {
    const frame = chartFrameRef.current;
    const pendingViewportCenter = pendingViewportCenterRef.current;
    if (!frame || pendingViewportCenter == null) {
      return;
    }
    if (pendingViewportCenter === "start") {
      frame.scrollLeft = 0;
    } else {
      const visiblePlotWidth = Math.max(1, frame.clientWidth - LABEL_WIDTH);
      frame.scrollLeft = Math.max(
        0,
        pendingViewportCenter * plotWidth - visiblePlotWidth / 2,
      );
    }
    pendingViewportCenterRef.current = null;
  }, [plotWidth]);

  const selectedTargets = useMemo(() => {
    const targets = new Set<string>();
    if (!selectedBatchId) {
      return targets;
    }
    const selectedBatch = model.lanes
      .flatMap((lane) => lane.batches)
      .find((batch) => batch.id === selectedBatchId);
    if (!selectedBatch) {
      return targets;
    }
    for (const allocation of selectedBatch.allocations) {
      for (const candidate of allocation.direct_output_candidates ?? []) {
        if (candidate.batch) {
          targets.add(`${candidate.material}::${candidate.batch}`);
        }
      }
    }
    return targets;
  }, [model.lanes, selectedBatchId]);

  const trackInteraction = (interaction: string) =>
    trackSupplyChainInteraction({
      interaction,
      productId: schedule.product_id,
      source: "production_schedule",
    });

  const changeZoom = (direction: "in" | "out") => {
    const frame = chartFrameRef.current;
    if (frame) {
      const visiblePlotWidth = Math.max(1, frame.clientWidth - LABEL_WIDTH);
      pendingViewportCenterRef.current =
        (frame.scrollLeft + visiblePlotWidth / 2) / plotWidth;
    }
    setZoomScale((currentScale) =>
      direction === "in"
        ? Math.min(MAX_ZOOM_SCALE, currentScale * ZOOM_STEP)
        : Math.max(1, currentScale / ZOOM_STEP),
    );
    trackInteraction("production_schedule_zoom_changed");
  };

  return (
    <section className={root} aria-label="Production actuals timeline">
      <div className={toolbar}>
        <label className={field}>
          Range
          <select
            className={control}
            value={preset}
            onChange={(event) => {
              setPreset(event.target.value as RangePreset);
              trackInteraction("production_schedule_filter_changed");
            }}
          >
            <option value="3m">3 months</option>
            <option value="6m">6 months</option>
            <option value="12m">12 months</option>
            <option value="all">All production</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        {preset === "custom" && (
          <>
            <label className={field}>
              From
              <input
                className={cx(control, dateControl)}
                type="date"
                value={customStart}
                max={customEnd || undefined}
                onChange={(event) => setCustomStart(event.target.value)}
              />
            </label>
            <label className={field}>
              To
              <input
                className={cx(control, dateControl)}
                type="date"
                value={customEnd}
                min={customStart || undefined}
                onChange={(event) => setCustomEnd(event.target.value)}
              />
            </label>
          </>
        )}
        <div className={field}>
          Zoom
          <div className={toolbarGroup}>
            <button
              type="button"
              className={zoomButton}
              aria-label="Zoom out"
              disabled={zoomScale <= 1}
              onClick={() => changeZoom("out")}
            >
              −
            </button>
            <button
              type="button"
              className={zoomButton}
              onClick={() => {
                pendingViewportCenterRef.current = "start";
                setZoomScale(1);
                chartFrameRef.current?.scrollTo({ left: 0 });
                trackInteraction("production_schedule_zoom_fit");
              }}
            >
              Fit
            </button>
            <button
              type="button"
              className={zoomButton}
              aria-label="Zoom in"
              disabled={zoomScale >= MAX_ZOOM_SCALE}
              onClick={() => changeZoom("in")}
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div className={summary}>
        <div className={legend} aria-label="Production timeline legend">
          <span className={legendItem}>
            <span className={cx(swatch, css({ bg: "[#2563eb]" }))} />
            Only used in this product
          </span>
          <span className={legendItem}>
            <span className={cx(swatch, css({ bg: "[#7c3aed]" }))} />
            Also used for other products
          </span>
          <span className={legendItem}>
            <span className={cx(swatch, css({ bg: "[#94a3b8]" }))} />
            No recorded consumption
          </span>
          {model.unknownOutputCount > 0 && (
            <span className={legendItem}>
              <span className={cx(swatch, css({ bg: "[#d97706]" }))} />
              Immediate output unknown
            </span>
          )}
        </div>
        <span>
          {model.usedElsewhereCount}{" "}
          {model.usedElsewhereCount === 1 ? "batch" : "batches"} also used for
          other products
          {model.unknownOutputCount > 0
            ? ` · ${model.unknownOutputCount} ${
                model.unknownOutputCount === 1 ? "batch" : "batches"
              } with unknown outputs`
            : ""}
        </span>
      </div>

      {model.lanes.length === 0 || !model.start || !model.end ? (
        <div className={empty}>No production occurs in this date range.</div>
      ) : (
        <div
          ref={chartFrameRef}
          className={chartFrame}
          role="region"
          aria-label="Scrollable production timeline"
        >
          <div className={chart} style={{ width: LABEL_WIDTH + plotWidth }}>
            <div className={chartRow}>
              <div
                className={axisLabel}
                style={{ backgroundColor: "#f8fafc", zIndex: 100 }}
              />
              <div className={axis} style={{ width: plotWidth }}>
                {ticks.map((day) => (
                  <span
                    key={day}
                    className={tick}
                    style={{ left: (day - startDay) * (plotWidth / dayCount) }}
                  >
                    <span className={tickLabel}>{formatDay(day)}</span>
                  </span>
                ))}
              </div>
            </div>
            {model.lanes.map((lane, laneIndex) => {
              return (
                <div className={chartRow} key={lane.material}>
                  <div
                    className={laneLabel}
                    style={{
                      height: LANE_HEIGHT,
                      background:
                        lane.role === "finished_good"
                          ? "#eff6ff"
                          : laneIndex % 2 === 0
                            ? "#ffffff"
                            : "#f8fafc",
                    }}
                  >
                    <div className={laneName} title={lane.name}>
                      {lane.name}
                    </div>
                    <div className={laneMeta}>
                      {lane.material} · depth {lane.bom_depth}
                    </div>
                  </div>
                  <div
                    className={timelineLane}
                    style={{
                      width: plotWidth,
                      background:
                        lane.role === "finished_good"
                          ? "#eff6ff"
                          : laneIndex % 2 === 0
                            ? "#ffffff"
                            : "#f8fafc",
                    }}
                  >
                    {ticks.map((day) => (
                      <span
                        key={day}
                        className={tick}
                        aria-hidden="true"
                        style={{
                          left: (day - startDay) * (plotWidth / dayCount),
                        }}
                      />
                    ))}
                    {lane.batches.map((batch) => {
                      const directUse = model.directUseByBatch.get(batch.id);
                      const visibleStart =
                        batch.start < model.start! ? model.start! : batch.start;
                      const visibleEnd =
                        batch.end > model.end! ? model.end! : batch.end;
                      const left = leftForDate(visibleStart);
                      const width = widthForDays(
                        parseDay(visibleEnd) - parseDay(visibleStart) + 1,
                      );
                      const selected = selectedBatchId === batch.id;
                      const related =
                        selected ||
                        selectedTargets.has(batch.id) ||
                        selectedBatchId == null;
                      const fill =
                        lane.role === "finished_good"
                          ? "#1d4ed8"
                          : stateColor(directUse);
                      return (
                        <Tooltip
                          key={batch.id}
                          delayMs={200}
                          wrapperClassName={batchPosition}
                          wrapperStyle={{
                            left,
                            width,
                            zIndex: selected ? 3 : related ? 2 : 1,
                          }}
                          content={
                            <BatchTooltipContent
                              batch={batch}
                              directUse={directUse}
                              materialNameByMaterial={materialNameByMaterial}
                              isFinishedGood={lane.role === "finished_good"}
                            />
                          }
                        >
                          <button
                            type="button"
                            className={batchButton}
                            aria-pressed={selected}
                            aria-label={`Batch ${batch.batch ?? batch.order}${directUse?.state === "used_elsewhere" ? ", also used for other products" : ""}`}
                            style={{
                              background: related ? fill : "#ffffff",
                              borderColor: related ? fill : "#cbd5e1",
                              boxShadow: selected
                                ? "0 0 0 3px #0f172a"
                                : undefined,
                            }}
                            onClick={() => {
                              setSelectedBatchId((current) =>
                                current === batch.id ? null : batch.id,
                              );
                              trackInteraction(
                                "production_schedule_relationship_selected",
                              );
                            }}
                          >
                            {related &&
                              directUse?.hasUnknownOutput &&
                              directUse.state !== "unknown_output" && (
                                <span
                                  className={marker}
                                  aria-label="Some output is unknown"
                                >
                                  !
                                </span>
                              )}
                          </button>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};
