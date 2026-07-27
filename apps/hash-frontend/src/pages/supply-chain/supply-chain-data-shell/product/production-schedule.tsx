import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { trackSupplyChainInteraction } from "../../shared/telemetry";
import {
  deriveCalendarDateAxis,
  formatCalendarDay,
} from "./production-schedule/calendar-date-axis";
import { DispatchLane } from "./production-schedule/dispatch-lane";
import {
  batchLifecycleEnd,
  batchLifecycleStart,
  batchVisibleRange,
  clusterEventsByPixel,
  deriveScheduleModel,
  deriveScheduleTrace,
  focusScheduleLanes,
  intervalPercent,
  MAX_COLLAPSED_TRACKS,
  productionScheduleRelevantBatchIds,
  scheduleDayNumber,
} from "./production-schedule/model";
import {
  productionScheduleDateBounds,
  selectedProductionScheduleRange,
} from "./production-schedule/schedule-dates";
import { ProductionScheduleSummary } from "./production-schedule/schedule-summary";
import { TimelineTooltip } from "./production-schedule/timeline-tooltip";
import { ProductionScheduleToolbar } from "./production-schedule/toolbar";
import {
  BatchTooltipContent,
  ConsumptionTooltipContent,
  DispatchTooltipContent,
} from "./production-schedule/tooltip-content";

import type {
  ProductionSchedule,
  ProductionScheduleBatch,
  ProductionScheduleConsumptionEvent,
  ProductionScheduleDispatchEvent,
} from "../../shared/production-schedule-types";
import type {
  BatchDirectUse,
  ScheduleLaneDisplay,
  ScheduleSelection,
} from "./production-schedule/model";
import type { ScheduleRangePreset } from "./production-schedule/schedule-dates";

const LABEL_WIDTH = 220;
const TRACK_HEIGHT = 28;
const BAR_HEIGHT = 22;
const LANE_PADDING = 2;
const INVENTORY_DWELL_COLOR = "#f3f8ff";
const USED_ELSEWHERE_HATCH =
  "repeating-linear-gradient(135deg, transparent 0, transparent 6px, rgba(100, 116, 139, 0.28) 6px, rgba(100, 116, 139, 0.28) 7px)";
const MAX_ZOOM_SCALE = 8;
const ZOOM_STEP = 1.4;
const TICK_TARGET_WIDTH = 90;
const TICK_LABEL_WIDTH = 48;
const MIN_TICK_LABEL_SPACING = 44;
const selectionIdentity = (selection: ScheduleSelection): string =>
  selection.kind === "batch"
    ? `batch:${selection.batchId}`
    : `${selection.kind}:${
        selection.kind === "dispatch"
          ? `${selection.origin ?? "batch_marker"}:`
          : ""
      }${[...selection.eventIds].sort().join(",")}`;

const root = css({
  display: "flex",
  flexDirection: "column",
  h: "full",
  minH: "0",
  minW: "0",
  w: "full",
  maxW: "full",
  gap: "3",
  overflow: "hidden",
});
const chartFrame = css({
  flex: "1",
  minH: "0",
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
const axisRow = css({
  display: "flex",
  position: "sticky",
  top: "0",
  zIndex: "[20]",
  backgroundColor: "white",
  isolation: "isolate",
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
  top: "0",
  zIndex: "[21]",
  flex: "none",
  w: "[220px]",
  h: "[42px]",
  boxSizing: "border-box",
  borderRightWidth: "1px",
  borderRightColor: "bd.subtle",
  borderBottomWidth: "1px",
  borderBottomColor: "bd.subtle",
  backgroundColor: "white",
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
const expandButton = css({
  mt: "2",
  px: "1.5",
  py: "0.5",
  borderWidth: "1px",
  borderColor: "bd.subtle",
  borderRadius: "sm",
  bg: "bg.surface",
  color: "fg.heading",
  textStyle: "xs",
  cursor: "pointer",
  _focusVisible: { outline: "2px solid" },
});
const timelineLane = css({
  position: "relative",
  flex: "none",
  boxSizing: "border-box",
  borderBottomWidth: "1px",
  borderBottomColor: "bd.subtle",
});
const trackStack = css({
  position: "absolute",
  left: "0",
  right: "0",
  top: "[50%]",
  transform: "translateY(-50%)",
});
const axis = css({
  position: "relative",
  flex: "none",
  h: "[42px]",
  boxSizing: "border-box",
  borderBottomWidth: "1px",
  borderBottomColor: "bd.subtle",
  backgroundColor: "white",
  overflow: "hidden",
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
  display: "grid",
  lineHeight: "[1]",
  textStyle: "xs",
  color: "fg.subtle",
  whiteSpace: "nowrap",
});
const tickYear = css({ fontWeight: "medium" });
const batchPosition = css({
  position: "absolute",
  overflow: "visible",
});
const segmentPosition = css({
  position: "absolute",
  top: "0",
  bottom: "0",
});
const batchButton = css({
  position: "relative",
  w: "full",
  h: "full",
  minW: "[3px]",
  overflow: "hidden",
  borderWidth: "1px",
  borderRadius: "sm",
  boxSizing: "border-box",
  background: "[transparent]",
  color: "white",
  textAlign: "left",
  cursor: "pointer",
  _focusVisible: {
    outline: "2px solid",
    outlineColor: "fg.heading",
    outlineOffset: "[2px]",
  },
});
const observationWindow = css({
  position: "absolute",
  zIndex: "[3]",
  top: "0",
  bottom: "0",
  background: "[#2563eb]",
  pointerEvents: "none",
});
const usedElsewhereOverlay = css({
  position: "absolute",
  zIndex: "[2]",
  inset: "0",
  pointerEvents: "none",
});
const overDepleted = css({
  position: "absolute",
  inset: "[1px]",
  borderWidth: "1px",
  borderColor: "[#dc2626]",
  borderStyle: "dashed",
  borderRadius: "xs",
  pointerEvents: "none",
});
const unknownMarker = css({
  position: "absolute",
  zIndex: "[4]",
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
const eventMarker = css({
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  w: "[26px]",
  h: "[26px]",
  p: "0",
  borderWidth: "0",
  borderRadius: "full",
  color: "[inherit]",
  background: "[transparent]",
  fontSize: "[10px]",
  lineHeight: "[1]",
  fontWeight: "semibold",
  cursor: "pointer",
  _focusVisible: {
    outline: "1px solid",
    outlineColor: "fg.heading",
    outlineOffset: "[1px]",
  },
});
const markerGlyph = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  w: "[16px]",
  h: "[16px]",
  borderWidth: "1px",
  borderColor: "white",
  borderRadius: "full",
  color: "white",
  boxShadow: "sm",
});
const markerAnchor = css({
  position: "absolute",
  zIndex: "[5]",
  transform: "translate(-50%, -50%)",
});
const trackSeparator = css({
  position: "absolute",
  left: "0",
  right: "0",
  borderTopWidth: "1px",
  borderTopColor: "[rgba(148,163,184,0.35)]",
  pointerEvents: "none",
});
const empty = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minH: "56",
  textStyle: "sm",
  color: "fg.subtle",
});

type LifecycleBalanceFields = {
  lifecycle_balance_status?:
    | "balanced"
    | "over_depleted"
    | "unknown_opening_balance";
  lifecycle_overage_quantity?: number;
  lifecycle_exit_quantity?: number;
  remaining_quantity?: number | null;
};

const lifecycleBalance = (batch: ProductionScheduleBatch) =>
  batch as ProductionScheduleBatch & LifecycleBalanceFields;

const roleLabel = (
  role: "finished_good" | "intermediate" | "raw_material",
): string =>
  ({
    finished_good: "Finished good",
    intermediate: "Intermediate",
    raw_material: "Raw material",
  })[role];

const usageBorderColor = (directUse: BatchDirectUse | undefined): string => {
  switch (directUse?.state) {
    case "unknown_output":
      return "#d97706";
    case "no_recorded_consumption":
    case "dispatched_as_fg":
    case "used_elsewhere":
    case "in_hierarchy":
    default:
      return "#cbd5e1";
  }
};

export const ProductionScheduleView = ({
  schedule,
  productNameByMaterial,
}: {
  schedule: ProductionSchedule;
  productNameByMaterial: ReadonlyMap<string, string>;
}) => {
  const relevantBatchIds = useMemo(
    () => productionScheduleRelevantBatchIds(schedule),
    [schedule],
  );
  const artifactBounds = useMemo(
    () => productionScheduleDateBounds(schedule, relevantBatchIds),
    [relevantBatchIds, schedule],
  );
  const artifactStart = artifactBounds?.start ?? null;
  const artifactEnd = artifactBounds?.end ?? null;
  const [preset, setPreset] = useState<ScheduleRangePreset>("all");
  const [customStart, setCustomStart] = useState(artifactStart ?? "");
  const [customEnd, setCustomEnd] = useState(artifactEnd ?? "");
  const [zoomScale, setZoomScale] = useState(1);
  const [showEventMarkers, setShowEventMarkers] = useState(true);
  const [showInventoryDwell, setShowInventoryDwell] = useState(true);
  const [showRawMaterials, setShowRawMaterials] = useState(false);
  const [laneDisplay, setLaneDisplay] =
    useState<ScheduleLaneDisplay>("continuous");
  const [viewportWidth, setViewportWidth] = useState(0);
  const [selection, setSelection] = useState<ScheduleSelection | null>(null);
  const [collapsedFocusedMaterials, setCollapsedFocusedMaterials] = useState<
    Set<string>
  >(() => new Set());
  const selectOrToggle = (next: ScheduleSelection) => {
    setCollapsedFocusedMaterials(new Set());
    setSelection((current) =>
      current && selectionIdentity(current) === selectionIdentity(next)
        ? null
        : next,
    );
  };
  const selectBatch = (batchId: string) => {
    selectOrToggle({ kind: "batch", batchId });
  };
  const selectConsumptionEvents = (
    events: readonly ProductionScheduleConsumptionEvent[],
  ) => {
    selectOrToggle({
      kind: "consumption",
      eventIds: events.map(({ id }) => id),
    });
  };
  const selectDispatchBatches = (
    dispatches: readonly ProductionScheduleDispatchEvent[],
    origin: "batch_marker" | "dispatch_lane" = "batch_marker",
  ) => {
    selectOrToggle({
      kind: "dispatch",
      eventIds: dispatches.map(({ id }) => id),
      origin,
    });
  };
  const [expandedMaterials, setExpandedMaterials] = useState<Set<string>>(
    () => new Set(),
  );
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
        setSelection(null);
      }
    };
    window.addEventListener("keydown", clearSelection);
    return () => window.removeEventListener("keydown", clearSelection);
  }, []);

  const selectedRange = useMemo(
    () =>
      selectedProductionScheduleRange({
        artifactBounds,
        customEnd,
        customStart,
        preset,
      }),
    [artifactBounds, customEnd, customStart, preset],
  );

  const inventoryDwellVisible = laneDisplay === "lane" && showInventoryDwell;
  const eventMarkersVisible =
    laneDisplay === "lane" && showInventoryDwell && showEventMarkers;
  const model = useMemo(
    () =>
      deriveScheduleModel(
        schedule,
        selectedRange,
        inventoryDwellVisible,
        laneDisplay,
      ),
    [schedule, selectedRange, inventoryDwellVisible, laneDisplay],
  );
  const trace = useMemo(
    () => deriveScheduleTrace(model, selection),
    [model, selection],
  );
  const tracedConsumptionEventIds = trace.consumptionEventIds;
  const tracedDispatchEventIds = trace.dispatchEventIds;
  const focusedBatchIds = new Set(
    selection?.kind === "batch" ? [selection.batchId] : [],
  );
  const focusedConsumptionEventIds = new Set(
    selection?.kind === "consumption" ? selection.eventIds : [],
  );
  const focusedDispatchEventIds = new Set(
    selection?.kind === "dispatch" ? selection.eventIds : [],
  );
  const materialNameByMaterial = useMemo(
    () =>
      new Map([
        ...productNameByMaterial,
        ...Object.entries(schedule.material_names ?? {}),
        ...schedule.lanes.map((lane) => [lane.material, lane.name] as const),
      ]),
    [productNameByMaterial, schedule.lanes, schedule.material_names],
  );
  const hierarchyMaterials = useMemo(
    () => new Set(schedule.lanes.map((lane) => lane.material)),
    [schedule.lanes],
  );

  const startDay = model.start ? scheduleDayNumber(model.start) : 0;
  const endDay = model.end ? scheduleDayNumber(model.end) : startDay;
  const dayCount = Math.max(1, endDay - startDay + 1);
  const availablePlotWidth = Math.max(360, viewportWidth - LABEL_WIDTH);
  const plotWidth = availablePlotWidth * zoomScale;
  const effectivePixelsPerDay = plotWidth / dayCount;
  const { cadence: tickCadence, ticks } = deriveCalendarDateAxis({
    effectivePixelsPerDay,
    endDay,
    minimumLabelSpacing: MIN_TICK_LABEL_SPACING,
    startDay,
    targetTickWidth: TICK_TARGET_WIDTH,
  });
  const leftForDate = (date: string) =>
    (scheduleDayNumber(date) - startDay) * (plotWidth / dayCount);
  const widthForDays = (days: number) =>
    Math.max(3, days * (plotWidth / dayCount));
  const markerPixel = (pixel: number) =>
    Math.max(12, Math.min(plotWidth - 12, pixel));

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

  const selectedRelated = trace.batchIds;
  const hasSelection = selection !== null;
  const dispatchLaneFocused =
    selection?.kind === "dispatch" && selection.origin === "dispatch_lane";
  const displayedLanes = useMemo(
    () =>
      focusScheduleLanes(
        model.lanes,
        selectedRelated,
        hasSelection,
        inventoryDwellVisible,
        laneDisplay,
      ).filter((lane) => showRawMaterials || lane.role !== "raw_material"),
    [
      hasSelection,
      model.lanes,
      laneDisplay,
      selectedRelated,
      inventoryDwellVisible,
      showRawMaterials,
    ],
  );
  const displayedBatches = displayedLanes.flatMap((lane) => lane.batches);
  const displayedUsedElsewhereCount = displayedBatches.filter(
    (batch) => model.directUseByBatch.get(batch.id)?.state === "used_elsewhere",
  ).length;
  const displayedUnknownOutputCount = displayedBatches.filter(
    (batch) => model.directUseByBatch.get(batch.id)?.hasUnknownOutput,
  ).length;
  const hasVisibleInventoryDwell = displayedLanes.some(
    (lane) =>
      lane.batches.length > 0 &&
      (lane.role === "raw_material" || inventoryDwellVisible),
  );
  const scheduleBatchById = useMemo(
    () =>
      new Map(
        schedule.lanes.flatMap((lane) =>
          lane.batches.map((batch) => [batch.id, batch] as const),
        ),
      ),
    [schedule.lanes],
  );
  const getConsumptionTargetBatches = (
    eventId: string,
  ): ProductionScheduleBatch[] =>
    (model.linksByEvent.get(eventId)?.target_batch_ids ?? []).flatMap(
      (targetBatchId) => {
        const targetBatch = scheduleBatchById.get(targetBatchId);
        return targetBatch ? [targetBatch] : [];
      },
    );
  const selectedProductDispatchEvents = (schedule.dispatch_events ?? []).filter(
    (dispatch) => dispatch.material === schedule.product_material,
  );
  const displayedProductDispatchEvents = hasSelection
    ? selectedProductDispatchEvents.filter((dispatch) =>
        tracedDispatchEventIds.has(dispatch.id),
      )
    : selectedProductDispatchEvents;
  const scheduleBatchIds = new Set(scheduleBatchById.keys());
  const hasDispatchedAsFinishedGood = (schedule.dispatch_events ?? []).some(
    (dispatch) =>
      dispatch.material !== schedule.product_material &&
      scheduleBatchIds.has(dispatch.batch_id),
  );
  const hasOverDepletedInventory = schedule.lanes.some((lane) =>
    lane.batches.some(
      (batch) =>
        lifecycleBalance(batch).lifecycle_balance_status === "over_depleted",
    ),
  );
  const timelineStart = model.start;
  const timelineEnd = model.end;

  useEffect(() => {
    const frame = chartFrameRef.current;
    if (!frame) {
      return;
    }
    const clearSelection = (event: MouseEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("button, a, input, select, label, [role='button']")
      ) {
        return;
      }
      setSelection(null);
    };
    frame.addEventListener("click", clearSelection);
    return () => frame.removeEventListener("click", clearSelection);
  }, [displayedLanes.length, timelineEnd, timelineStart]);

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
      <ProductionScheduleToolbar
        customEnd={customEnd}
        customStart={customStart}
        laneDisplay={laneDisplay}
        maximumZoomScale={MAX_ZOOM_SCALE}
        onCustomEndChange={setCustomEnd}
        onCustomStartChange={setCustomStart}
        onFitZoom={() => {
          pendingViewportCenterRef.current = "start";
          setZoomScale(1);
          chartFrameRef.current?.scrollTo({ left: 0 });
          trackInteraction("production_schedule_zoom_fit");
        }}
        onLaneDisplayChange={(nextLaneDisplay) => {
          setLaneDisplay(nextLaneDisplay);
          trackInteraction("production_schedule_lane_display_changed");
        }}
        onPresetChange={(nextPreset) => {
          setPreset(nextPreset);
          trackInteraction("production_schedule_filter_changed");
        }}
        onShowEventMarkersChange={(showMarkers) => {
          setShowEventMarkers(showMarkers);
          trackInteraction("production_schedule_event_markers_changed");
        }}
        onShowInventoryDwellChange={(showDwell) => {
          setShowInventoryDwell(showDwell);
          trackInteraction("production_schedule_inventory_dwell_changed");
        }}
        onShowRawMaterialsChange={(showMaterials) => {
          setShowRawMaterials(showMaterials);
          trackInteraction(
            "production_schedule_raw_material_visibility_changed",
          );
        }}
        onZoomIn={() => changeZoom("in")}
        onZoomOut={() => changeZoom("out")}
        preset={preset}
        showEventMarkers={showEventMarkers}
        showInventoryDwell={showInventoryDwell}
        showRawMaterials={showRawMaterials}
        zoomScale={zoomScale}
      />

      <ProductionScheduleSummary
        displayedUnknownOutputCount={displayedUnknownOutputCount}
        displayedUsedElsewhereCount={displayedUsedElsewhereCount}
        hasDispatchedAsFinishedGood={hasDispatchedAsFinishedGood}
        hasOverDepletedInventory={hasOverDepletedInventory}
        hasVisibleInventoryDwell={hasVisibleInventoryDwell}
      />
      {hasSelection && (
        <div className={css({ textStyle: "xs", color: "fg.subtle" })}>
          Showing recorded batch links only; BOM materials without batch-linked
          movement evidence are omitted. Click empty timeline space or press
          Escape to clear the trace.
        </div>
      )}

      {displayedLanes.length === 0 || !timelineStart || !timelineEnd ? (
        <div className={empty}>No production occurs in this date range.</div>
      ) : (
        <div
          ref={chartFrameRef}
          className={chartFrame}
          role="region"
          aria-label="Scrollable production timeline"
          data-production-schedule-scroll-container="true"
        >
          <div className={chart} style={{ width: LABEL_WIDTH + plotWidth }}>
            <div className={axisRow} data-sticky-axis="true">
              <div className={axisLabel} />
              <div className={axis} style={{ width: plotWidth }}>
                {ticks.map((day) => {
                  const tickPosition =
                    (day - startDay) * (plotWidth / dayCount);
                  const labelOffset =
                    tickPosition + TICK_LABEL_WIDTH + 4 <= plotWidth
                      ? 4
                      : -TICK_LABEL_WIDTH - 4;
                  const formattedDay = formatCalendarDay(day);
                  return (
                    <span
                      key={day}
                      className={tick}
                      data-tick-cadence={`${tickCadence.step}-${tickCadence.kind}`}
                      style={{ left: tickPosition }}
                    >
                      <span
                        className={tickLabel}
                        data-tick-label={formattedDay}
                        style={{
                          left: labelOffset,
                          lineHeight: 1,
                          textAlign: labelOffset < 0 ? "right" : "left",
                          width: TICK_LABEL_WIDTH,
                        }}
                      >
                        <span className={tickYear}>
                          {formattedDay.slice(0, 4)}
                        </span>
                        <span>{formattedDay.slice(5)}</span>
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
            {displayedLanes.map((lane, laneIndex) => {
              const expanded = hasSelection
                ? !collapsedFocusedMaterials.has(lane.material)
                : expandedMaterials.has(lane.material);
              const visibleTrackCount = expanded
                ? lane.trackCount
                : Math.min(lane.trackCount, MAX_COLLAPSED_TRACKS);
              const trackAreaHeight = visibleTrackCount * TRACK_HEIGHT;
              const minimumTrackHeight = trackAreaHeight + LANE_PADDING * 2;
              const laneId = `production-schedule-lane-${laneIndex}`;
              const laneBackground =
                lane.role === "finished_good"
                  ? "#eff6ff"
                  : laneIndex % 2 === 0
                    ? "#ffffff"
                    : "#f8fafc";
              return (
                <div className={chartRow} key={lane.material}>
                  <div
                    className={laneLabel}
                    style={{
                      background: laneBackground,
                    }}
                  >
                    <div className={laneName} title={lane.name}>
                      {lane.name}
                    </div>
                    <div className={laneMeta}>
                      {roleLabel(lane.role)} · {lane.material} · depth{" "}
                      {lane.bom_depth}
                    </div>
                    {lane.trackCount > MAX_COLLAPSED_TRACKS && (
                      <button
                        type="button"
                        className={expandButton}
                        aria-expanded={expanded}
                        aria-controls={laneId}
                        onClick={() => {
                          const setMaterials = hasSelection
                            ? setCollapsedFocusedMaterials
                            : setExpandedMaterials;
                          setMaterials((current) => {
                            const next = new Set(current);
                            if (hasSelection) {
                              if (expanded) {
                                next.add(lane.material);
                              } else {
                                next.delete(lane.material);
                              }
                            } else if (next.has(lane.material)) {
                              next.delete(lane.material);
                            } else {
                              next.add(lane.material);
                            }
                            return next;
                          });
                          trackInteraction(
                            "production_schedule_lane_expansion_changed",
                          );
                        }}
                      >
                        {expanded
                          ? "Collapse batches"
                          : `Show all ${lane.trackCount} tracks`}
                      </button>
                    )}
                  </div>
                  <div
                    id={laneId}
                    className={timelineLane}
                    data-minimum-track-height={minimumTrackHeight}
                    style={{
                      width: plotWidth,
                      minHeight: minimumTrackHeight,
                      background: laneBackground,
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
                    <div
                      className={trackStack}
                      data-track-stack="true"
                      style={{
                        height: trackAreaHeight,
                        top: "50%",
                        transform: "translateY(-50%)",
                      }}
                    >
                      {Array.from(
                        { length: visibleTrackCount - 1 },
                        (_, index) => (
                          <span
                            key={`track-separator-${index}`}
                            className={trackSeparator}
                            aria-hidden="true"
                            style={{
                              top: (index + 1) * TRACK_HEIGHT,
                            }}
                          />
                        ),
                      )}
                      {lane.packedBatches.map(({ batch, track }) => {
                        if (track >= visibleTrackCount) {
                          return null;
                        }
                        const directUse = model.directUseByBatch.get(batch.id);
                        const dispatches =
                          model.dispatchesByBatch.get(batch.id) ?? [];
                        const consumptionEvents =
                          model.consumptionEventsByBatch.get(batch.id) ?? [];
                        const consumptionClusters = clusterEventsByPixel(
                          consumptionEvents.filter(
                            (event) =>
                              event.consumption_date >= timelineStart &&
                              event.consumption_date <= timelineEnd &&
                              (!hasSelection ||
                                tracedConsumptionEventIds.has(event.id)),
                          ),
                          (event) => event.consumption_date,
                          timelineStart,
                          timelineEnd,
                          plotWidth,
                        );
                        const dispatchClusters = clusterEventsByPixel(
                          dispatches.filter(
                            (event) =>
                              event.dispatch_date >= timelineStart &&
                              event.dispatch_date <= timelineEnd &&
                              (!hasSelection ||
                                tracedDispatchEventIds.has(event.id)),
                          ),
                          (event) => event.dispatch_date,
                          timelineStart,
                          timelineEnd,
                          plotWidth,
                        );
                        const { start: renderStartDate, end: renderEndDate } =
                          batchVisibleRange(
                            batch,
                            lane.role,
                            inventoryDwellVisible,
                          );
                        const visibleStart =
                          renderStartDate < timelineStart
                            ? timelineStart
                            : renderStartDate;
                        const visibleEnd =
                          renderEndDate > timelineEnd
                            ? timelineEnd
                            : renderEndDate;
                        const left = leftForDate(visibleStart);
                        const width = widthForDays(
                          scheduleDayNumber(visibleEnd) -
                            scheduleDayNumber(visibleStart) +
                            1,
                        );
                        const selected = focusedBatchIds.has(batch.id);
                        const borderColor = usageBorderColor(directUse);
                        const inventoryInterval = intervalPercent(
                          batchLifecycleStart(batch),
                          batchLifecycleEnd(batch),
                          visibleStart,
                          visibleEnd,
                        );
                        const hasProductionPhase =
                          lane.role !== "raw_material" &&
                          batch.timing_kind !== "lifecycle_only" &&
                          batch.start <= visibleEnd &&
                          batch.end >= visibleStart;
                        const showLifecycleFallback =
                          !inventoryDwellVisible &&
                          lane.role !== "raw_material" &&
                          batch.timing_kind === "lifecycle_only";
                        const productionStart = showLifecycleFallback
                          ? visibleStart
                          : batch.start < visibleStart
                            ? visibleStart
                            : batch.start;
                        const productionEnd = showLifecycleFallback
                          ? visibleStart
                          : batch.end > visibleEnd
                            ? visibleEnd
                            : batch.end;
                        const productionLeft =
                          leftForDate(productionStart) - left;
                        const productionWidth = widthForDays(
                          scheduleDayNumber(productionEnd) -
                            scheduleDayNumber(productionStart) +
                            1,
                        );
                        const balance = lifecycleBalance(batch);
                        return (
                          <div
                            key={batch.id}
                            className={batchPosition}
                            style={{
                              left,
                              top:
                                track * TRACK_HEIGHT +
                                (TRACK_HEIGHT - BAR_HEIGHT) / 2,
                              width,
                              height: BAR_HEIGHT,
                              zIndex: selected ? 4 : undefined,
                            }}
                          >
                            <TimelineTooltip
                              delayMs={200}
                              wrapperClassName={segmentPosition}
                              wrapperStyle={{ left: 0, right: 0 }}
                              content={
                                <BatchTooltipContent
                                  batch={batch}
                                  directUse={directUse}
                                  dispatches={dispatches}
                                  events={consumptionEvents}
                                  getTargetBatches={getConsumptionTargetBatches}
                                  hierarchyMaterials={hierarchyMaterials}
                                  materialNameByMaterial={
                                    materialNameByMaterial
                                  }
                                  role={lane.role}
                                />
                              }
                            >
                              <button
                                type="button"
                                className={batchButton}
                                aria-pressed={selected}
                                aria-label={`Batch ${batch.batch ?? batch.order}${directUse?.state === "used_elsewhere" ? ", also used for other products" : ""}`}
                                style={{
                                  borderColor,
                                  background:
                                    inventoryDwellVisible ||
                                    lane.role === "raw_material"
                                      ? INVENTORY_DWELL_COLOR
                                      : "transparent",
                                  boxShadow: selected
                                    ? "0 0 0 3px #0f172a"
                                    : undefined,
                                }}
                                onClick={() => {
                                  selectBatch(batch.id);
                                  trackInteraction(
                                    "production_schedule_relationship_selected",
                                  );
                                }}
                              >
                                {(inventoryDwellVisible ||
                                  lane.role === "raw_material") && (
                                  <span
                                    className={segmentPosition}
                                    aria-hidden="true"
                                    data-batch-segment="inventory"
                                    style={{
                                      left: `${inventoryInterval.left}%`,
                                      width: `${Math.max(
                                        1,
                                        inventoryInterval.right -
                                          inventoryInterval.left,
                                      )}%`,
                                      top: 0,
                                      bottom: 0,
                                      borderRadius: "inherit",
                                      background: INVENTORY_DWELL_COLOR,
                                    }}
                                  />
                                )}
                                {(hasProductionPhase ||
                                  showLifecycleFallback) && (
                                  <span
                                    className={observationWindow}
                                    aria-hidden="true"
                                    data-batch-segment="production-observation"
                                    data-lifecycle-fallback={
                                      showLifecycleFallback ? "true" : undefined
                                    }
                                    data-minimum-visible-width="3px"
                                    data-timing-kind={batch.timing_kind}
                                    style={{
                                      left: productionLeft,
                                      minWidth: 3,
                                      width: productionWidth,
                                    }}
                                  />
                                )}
                                {directUse?.state === "used_elsewhere" && (
                                  <span
                                    className={usedElsewhereOverlay}
                                    aria-hidden="true"
                                    data-batch-usage="used-elsewhere"
                                    data-hatch-pattern="continuous-diagonal-grey"
                                    style={{
                                      backgroundImage: USED_ELSEWHERE_HATCH,
                                    }}
                                  />
                                )}
                                {balance.lifecycle_balance_status ===
                                  "over_depleted" && (
                                  <span
                                    className={overDepleted}
                                    aria-hidden="true"
                                    data-batch-state="over-depleted"
                                  />
                                )}
                                {directUse?.hasUnknownOutput &&
                                  directUse.state !== "unknown_output" && (
                                    <span
                                      className={unknownMarker}
                                      aria-label="Some output is unknown"
                                    >
                                      !
                                    </span>
                                  )}
                              </button>
                            </TimelineTooltip>
                            {eventMarkersVisible &&
                              consumptionClusters.map((cluster) => {
                                const clusterEvents = cluster.items;
                                const eventSelected = clusterEvents.some(
                                  ({ id }) =>
                                    focusedConsumptionEventIds.has(id),
                                );
                                return (
                                  <TimelineTooltip
                                    key={`${batch.id}::261::${cluster.id}`}
                                    delayMs={100}
                                    wrapperClassName={markerAnchor}
                                    wrapperStyle={{
                                      left: markerPixel(cluster.pixel) - left,
                                      top: BAR_HEIGHT / 2,
                                    }}
                                    content={
                                      <ConsumptionTooltipContent
                                        batchUom={batch.uom}
                                        events={clusterEvents}
                                        getTargetBatches={
                                          getConsumptionTargetBatches
                                        }
                                        hierarchyMaterials={hierarchyMaterials}
                                        materialNameByMaterial={
                                          materialNameByMaterial
                                        }
                                      />
                                    }
                                  >
                                    <button
                                      type="button"
                                      className={eventMarker}
                                      aria-pressed={eventSelected}
                                      style={{
                                        boxShadow: eventSelected
                                          ? "0 0 0 2px #0f172a"
                                          : undefined,
                                      }}
                                      aria-label={`Select ${clusterEvents.length === 1 ? "consumption" : `${clusterEvents.length} clustered consumption events`} for batch ${batch.batch ?? batch.id}`}
                                      onClick={() => {
                                        selectConsumptionEvents(clusterEvents);
                                        trackInteraction(
                                          "production_schedule_consumption_selected",
                                        );
                                      }}
                                    >
                                      <span
                                        className={markerGlyph}
                                        style={{ background: "#be123c" }}
                                      >
                                        {clusterEvents.length}
                                      </span>
                                    </button>
                                  </TimelineTooltip>
                                );
                              })}
                            {eventMarkersVisible &&
                              dispatchClusters.map((cluster) => {
                                const clusterDispatches = cluster.items;
                                const dispatchedAsFinishedGood =
                                  lane.role !== "finished_good";
                                const eventSelected = clusterDispatches.some(
                                  ({ id }) =>
                                    focusedDispatchEventIds.has(id) &&
                                    !dispatchLaneFocused,
                                );
                                return (
                                  <TimelineTooltip
                                    key={`${batch.id}::601::${cluster.id}`}
                                    delayMs={100}
                                    wrapperClassName={markerAnchor}
                                    wrapperStyle={{
                                      left: markerPixel(cluster.pixel) - left,
                                      top: BAR_HEIGHT / 2,
                                    }}
                                    content={
                                      <DispatchTooltipContent
                                        dispatches={clusterDispatches}
                                        fallbackUom={batch.uom}
                                        title={
                                          dispatchedAsFinishedGood
                                            ? "Dispatched as FG"
                                            : "Dispatch"
                                        }
                                      />
                                    }
                                  >
                                    <button
                                      type="button"
                                      className={eventMarker}
                                      data-dispatch-marker-kind={
                                        dispatchedAsFinishedGood
                                          ? "finished-good"
                                          : "selected-product"
                                      }
                                      aria-pressed={eventSelected}
                                      style={{
                                        boxShadow: eventSelected
                                          ? "0 0 0 2px #0f172a"
                                          : undefined,
                                      }}
                                      aria-label={`Select ${clusterDispatches.length === 1 ? "dispatch" : `${clusterDispatches.length} clustered dispatch events`} for batch ${batch.batch ?? batch.id}`}
                                      onClick={() => {
                                        selectDispatchBatches(
                                          clusterDispatches,
                                        );
                                        trackInteraction(
                                          "production_schedule_dispatch_selected",
                                        );
                                      }}
                                    >
                                      <span
                                        className={markerGlyph}
                                        style={
                                          dispatchedAsFinishedGood
                                            ? {
                                                background: "#ffffff",
                                                borderColor: "#0f766e",
                                                color: "#0f766e",
                                              }
                                            : { background: "#0f766e" }
                                        }
                                      >
                                        {clusterDispatches.length}
                                      </span>
                                    </button>
                                  </TimelineTooltip>
                                );
                              })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
            <DispatchLane
              dayCount={dayCount}
              dispatches={displayedProductDispatchEvents}
              focusedDispatchEventIds={focusedDispatchEventIds}
              onSelectDispatches={(dispatches) => {
                selectDispatchBatches(dispatches, "dispatch_lane");
                trackInteraction("production_schedule_dispatch_selected");
              }}
              plotWidth={plotWidth}
              startDay={startDay}
              ticks={ticks}
              timelineEnd={timelineEnd}
              timelineStart={timelineStart}
            />
          </div>
        </div>
      )}
    </section>
  );
};
