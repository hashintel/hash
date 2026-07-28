import { Button, Select, type SelectItem } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import type { ScheduleRangePreset } from "./schedule-dates";

const toolbar = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "start",
  gap: "3",
  p: "3",
  borderWidth: "1px",
  borderColor: "bd.subtle",
  borderRadius: "md",
  bg: "bg.surface",
  boxSizing: "border-box",
  maxW: "full",
  flexShrink: 0,
});
const toolbarGroup = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
});
const toolbarOptions = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "1",
  textStyle: "xs",
  color: "fg.subtle",
});
const displaySettings = css({
  display: "flex",
  alignItems: "flex-end",
  gap: "2",
});
const toolbarCheckbox = css({
  flexShrink: 0,
  w: "4",
  h: "4",
  m: "0",
  accentColor: "[#64748b]",
});
const field = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  textStyle: "xs",
  color: "fg.subtle",
  flexShrink: 0,
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
const toolbarSelect = css({ minW: "28" });
const laneDisplaySelect = css({ minW: "0", w: "32" });
const dateControl = css({ minW: "32" });
const zoomButton = css({
  bg: "[#fff]",
  _hover: { bg: "bg.subtle" },
});

type LaneDisplay = "lane" | "continuous";

const rangeItems: SelectItem<ScheduleRangePreset>[] = [
  { value: "3m", text: "3 months" },
  { value: "6m", text: "6 months" },
  { value: "12m", text: "12 months" },
  { value: "all", text: "All production" },
  { value: "custom", text: "Custom" },
];

const laneDisplayItems: SelectItem<LaneDisplay>[] = [
  { value: "lane", text: "Lane" },
  { value: "continuous", text: "Continuous" },
];

interface ProductionScheduleToolbarProps {
  customEnd: string;
  customStart: string;
  laneDisplay: LaneDisplay;
  maximumZoomScale: number;
  onCustomEndChange: (value: string) => void;
  onCustomStartChange: (value: string) => void;
  onFitZoom: () => void;
  onLaneDisplayChange: (value: LaneDisplay) => void;
  onPresetChange: (value: ScheduleRangePreset) => void;
  onShowEventMarkersChange: (value: boolean) => void;
  onShowInventoryDwellChange: (value: boolean) => void;
  onShowRawMaterialsChange: (value: boolean) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  preset: ScheduleRangePreset;
  showEventMarkers: boolean;
  showInventoryDwell: boolean;
  showRawMaterials: boolean;
  zoomScale: number;
}

export const ProductionScheduleToolbar = ({
  customEnd,
  customStart,
  laneDisplay,
  maximumZoomScale,
  onCustomEndChange,
  onCustomStartChange,
  onFitZoom,
  onLaneDisplayChange,
  onPresetChange,
  onShowEventMarkersChange,
  onShowInventoryDwellChange,
  onShowRawMaterialsChange,
  onZoomIn,
  onZoomOut,
  preset,
  showEventMarkers,
  showInventoryDwell,
  showRawMaterials,
  zoomScale,
}: ProductionScheduleToolbarProps) => (
  <div className={toolbar}>
    <div className={field}>
      <span>Range</span>
      <Select
        className={toolbarSelect}
        items={rangeItems}
        value={preset}
        onChange={onPresetChange}
        required
        size="sm"
        width="fitContent"
        aria-label="Range"
      />
    </div>
    {preset === "custom" && (
      <>
        <label className={field}>
          From
          <input
            className={cx(control, dateControl)}
            type="date"
            value={customStart}
            max={customEnd || undefined}
            onChange={(event) => onCustomStartChange(event.target.value)}
          />
        </label>
        <label className={field}>
          To
          <input
            className={cx(control, dateControl)}
            type="date"
            value={customEnd}
            min={customStart || undefined}
            onChange={(event) => onCustomEndChange(event.target.value)}
          />
        </label>
      </>
    )}
    <div className={field}>
      Zoom
      <div className={toolbarGroup}>
        <Button
          variant="subtle"
          tone="neutral"
          size="sm"
          className={zoomButton}
          aria-label="Zoom out"
          disabled={zoomScale <= 1}
          onClick={onZoomOut}
        >
          −
        </Button>
        <Button
          variant="subtle"
          tone="neutral"
          size="sm"
          className={zoomButton}
          onClick={onFitZoom}
        >
          Fit
        </Button>
        <Button
          variant="subtle"
          tone="neutral"
          size="sm"
          className={zoomButton}
          aria-label="Zoom in"
          disabled={zoomScale >= maximumZoomScale}
          onClick={onZoomIn}
        >
          +
        </Button>
      </div>
    </div>
    <div className={field}>
      Raw material
      <label className={toolbarGroup}>
        <input
          type="checkbox"
          className={toolbarCheckbox}
          aria-label="Show raw materials"
          checked={showRawMaterials}
          onChange={(event) => onShowRawMaterialsChange(event.target.checked)}
        />
        Show
      </label>
    </div>
    <div className={displaySettings}>
      <div className={field} data-production-schedule-toolbar-field="display">
        <span>Display</span>
        <Select
          className={laneDisplaySelect}
          items={laneDisplayItems}
          value={laneDisplay}
          onChange={onLaneDisplayChange}
          required
          size="sm"
          width="fitContent"
          aria-label="Lane display"
        />
      </div>
      {laneDisplay === "lane" && (
        <div className={toolbarOptions}>
          <label className={toolbarGroup}>
            <input
              type="checkbox"
              className={toolbarCheckbox}
              checked={showInventoryDwell}
              onChange={(event) =>
                onShowInventoryDwellChange(event.target.checked)
              }
            />
            Show inventory dwell
          </label>
          <label className={toolbarGroup}>
            <input
              type="checkbox"
              className={toolbarCheckbox}
              checked={showEventMarkers}
              disabled={!showInventoryDwell}
              onChange={(event) =>
                onShowEventMarkersChange(event.target.checked)
              }
            />
            Show event markers
          </label>
        </div>
      )}
    </div>
  </div>
);
