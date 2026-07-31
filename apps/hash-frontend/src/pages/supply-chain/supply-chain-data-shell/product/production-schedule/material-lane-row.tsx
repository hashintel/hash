import { css } from "@hashintel/ds-helpers/css";

import { MAX_COLLAPSED_TRACKS } from "./model";
import {
  MATERIAL_LANE_PADDING,
  MATERIAL_TRACK_HEIGHT,
  TIMELINE_LABEL_WIDTH_CSS,
  type TimelineGeometry,
} from "./timeline-geometry";

import type { ScheduleLaneModel } from "./model";
import type { ReactNode } from "react";

const row = css({ display: "flex", position: "relative" });
const label = css({
  position: "sticky",
  left: "0",
  zIndex: "[10]",
  flex: "none",
  w: TIMELINE_LABEL_WIDTH_CSS,
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
const laneMeta = css({ mt: "1", textStyle: "xs", color: "fg.subtle" });
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
const plot = css({
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
const trackStack = css({
  position: "absolute",
  left: "0",
  right: "0",
  top: "[50%]",
  transform: "translateY(-50%)",
});
const trackSeparator = css({
  position: "absolute",
  left: "0",
  right: "0",
  borderTopWidth: "1px",
  borderTopColor: "[rgba(148,163,184,0.35)]",
  pointerEvents: "none",
});

const roleLabel = (
  role: "finished_good" | "intermediate" | "raw_material",
): string =>
  ({
    finished_good: "Finished good",
    intermediate: "Intermediate",
    raw_material: "Raw material",
  })[role];

export const MaterialLaneRow = ({
  expanded,
  geometry,
  lane,
  laneBackground,
  laneId,
  onToggleExpanded,
  renderBatches,
  ticks,
}: {
  expanded: boolean;
  geometry: TimelineGeometry;
  lane: ScheduleLaneModel;
  laneBackground: string;
  laneId: string;
  onToggleExpanded: () => void;
  renderBatches: (visibleTrackCount: number) => ReactNode;
  ticks: readonly number[];
}) => {
  const visibleTrackCount = expanded
    ? lane.trackCount
    : Math.min(lane.trackCount, MAX_COLLAPSED_TRACKS);
  const trackAreaHeight = visibleTrackCount * MATERIAL_TRACK_HEIGHT;
  const minimumTrackHeight = trackAreaHeight + MATERIAL_LANE_PADDING * 2;

  return (
    <div className={row}>
      <div className={label} style={{ background: laneBackground }}>
        <div className={laneName} title={lane.name}>
          {lane.name}
        </div>
        <div className={laneMeta}>
          {roleLabel(lane.role)} · {lane.material} · depth {lane.bom_depth}
        </div>
        {lane.trackCount > MAX_COLLAPSED_TRACKS && (
          <button
            type="button"
            className={expandButton}
            aria-expanded={expanded}
            aria-controls={laneId}
            onClick={onToggleExpanded}
          >
            {expanded
              ? "Collapse batches"
              : `Show all ${lane.trackCount} tracks`}
          </button>
        )}
      </div>
      <div
        id={laneId}
        className={plot}
        data-minimum-track-height={minimumTrackHeight}
        style={{
          width: geometry.plotWidth,
          minHeight: minimumTrackHeight,
          background: laneBackground,
        }}
      >
        {ticks.map((day) => (
          <span
            key={day}
            className={tick}
            aria-hidden="true"
            style={{ left: geometry.leftForDay(day) }}
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
          {Array.from({ length: visibleTrackCount - 1 }, (_, index) => (
            <span
              key={`track-separator-${index}`}
              className={trackSeparator}
              aria-hidden="true"
              style={{ top: (index + 1) * MATERIAL_TRACK_HEIGHT }}
            />
          ))}
          {renderBatches(visibleTrackCount)}
        </div>
      </div>
    </div>
  );
};
