import { css } from "@hashintel/ds-helpers/css";

import { clusterEventsByPixel } from "./model";
import { TimelineTooltip } from "./timeline-tooltip";
import { DispatchTooltipContent } from "./tooltip-content";

import type { ProductionScheduleDispatchEvent } from "../../../shared/production-schedule-types";

const DISPATCH_LANE_HEIGHT = 64;

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
  boxSizing: "border-box",
  borderBottomWidth: "1px",
  borderBottomColor: "bd.subtle",
});
const tick = css({
  position: "absolute",
  top: "0",
  bottom: "0",
  borderLeftWidth: "1px",
  borderLeftColor: "bd.subtle",
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
const dispatchLaneMarker = css({
  position: "absolute",
  top: "[50%]",
  transform: "translate(-50%, -50%)",
});

interface DispatchLaneProps {
  dayCount: number;
  dispatches: readonly ProductionScheduleDispatchEvent[];
  focusedDispatchEventIds: ReadonlySet<string>;
  onSelectDispatches: (
    dispatches: readonly ProductionScheduleDispatchEvent[],
  ) => void;
  plotWidth: number;
  startDay: number;
  ticks: readonly number[];
  timelineEnd: string;
  timelineStart: string;
}

export const DispatchLane = ({
  dayCount,
  dispatches,
  focusedDispatchEventIds,
  onSelectDispatches,
  plotWidth,
  startDay,
  ticks,
  timelineEnd,
  timelineStart,
}: DispatchLaneProps) => {
  if (dispatches.length === 0) {
    return null;
  }

  const markerPixel = (pixel: number) =>
    Math.max(12, Math.min(plotWidth - 12, pixel));

  return (
    <div className={chartRow}>
      <div
        className={laneLabel}
        style={{
          height: DISPATCH_LANE_HEIGHT,
          background: "#f0fdfa",
        }}
      >
        <div className={laneName}>Dispatch</div>
        <div className={laneMeta}>601 goods issue</div>
      </div>
      <div
        className={timelineLane}
        data-dispatch-lane="selected-product"
        style={{
          width: plotWidth,
          height: DISPATCH_LANE_HEIGHT,
          background: "#f0fdfa",
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
        {clusterEventsByPixel(
          dispatches.filter(
            (dispatch) =>
              dispatch.dispatch_date >= timelineStart &&
              dispatch.dispatch_date <= timelineEnd,
          ),
          (dispatch) => dispatch.dispatch_date,
          timelineStart,
          timelineEnd,
          plotWidth,
        ).map((cluster) => {
          const clusterDispatches = cluster.items;
          const firstDispatch = clusterDispatches[0];
          if (!firstDispatch) {
            return null;
          }
          const selected = clusterDispatches.some(({ id }) =>
            focusedDispatchEventIds.has(id),
          );
          return (
            <TimelineTooltip
              key={`dispatch-lane-${cluster.id}`}
              delayMs={100}
              wrapperClassName={dispatchLaneMarker}
              wrapperStyle={{
                left: markerPixel(cluster.pixel),
                zIndex: selected ? 3 : 2,
              }}
              content={
                <DispatchTooltipContent
                  ariaLabel="Dispatches in this cluster"
                  dispatches={clusterDispatches}
                  itemElement="span"
                  title="Dispatch"
                />
              }
            >
              <button
                type="button"
                className={eventMarker}
                data-dispatch-marker-kind="selected-product-lane"
                aria-pressed={selected}
                style={{
                  boxShadow: selected ? "0 0 0 2px #0f172a" : undefined,
                }}
                aria-label={
                  clusterDispatches.length === 1
                    ? `Select dispatch for batch ${firstDispatch.batch}`
                    : `Select ${clusterDispatches.length} clustered dispatch events`
                }
                onClick={() => onSelectDispatches(clusterDispatches)}
              >
                <span className={markerGlyph} style={{ background: "#0f766e" }}>
                  {clusterDispatches.length}
                </span>
              </button>
            </TimelineTooltip>
          );
        })}
      </div>
    </div>
  );
};
