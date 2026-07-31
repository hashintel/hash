import { useMemo, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { MAX_COLLAPSED_TRACKS } from "./model";
import {
  deriveMaterialOccupancy,
  type MaterialOccupancyModel,
  type SiteOccupancyIndex,
} from "./site-occupancy-model";
import {
  inclusiveCalendarDays,
  OCCUPANCY_BAR_HEIGHT,
  OCCUPANCY_TRACK_HEIGHT,
  TIMELINE_LABEL_WIDTH_CSS,
  type TimelineGeometry,
} from "./timeline-geometry";
import { TimelineTooltip } from "./timeline-tooltip";

import type { CSSProperties } from "react";

const row = css({ display: "flex", position: "relative" });
const label = css({
  position: "sticky",
  left: "0",
  zIndex: "[9]",
  flex: "none",
  w: TIMELINE_LABEL_WIDTH_CSS,
  boxSizing: "border-box",
  pl: "6",
  pr: "2",
  py: "1.5",
  borderRightWidth: "1px",
  borderRightColor: "bd.subtle",
  borderBottomWidth: "1px",
  borderBottomColor: "bd.subtle",
  bg: "[inherit]",
  color: "fg.subtle",
  textStyle: "xs",
});
const plot = css({
  position: "relative",
  flex: "none",
  boxSizing: "border-box",
  borderBottomWidth: "1px",
  borderBottomColor: "bd.subtle",
  bg: "[inherit]",
});
const barPosition = css({ position: "absolute" });
const bar = css({
  w: "full",
  h: "full",
  minW: "[4px]",
  borderWidth: "1px",
  borderRadius: "[1px]",
  cursor: "help",
  _focusVisible: {
    outline: "2px solid",
    outlineColor: "fg.heading",
    outlineOffset: "[1px]",
  },
});
const gridTick = css({
  position: "absolute",
  top: "0",
  bottom: "0",
  borderLeftWidth: "1px",
  borderLeftColor: "bd.subtle",
});
const expand = css({
  ml: "1",
  color: "fg.heading",
  textDecoration: "underline",
  cursor: "pointer",
  _focusVisible: { outline: "2px solid" },
});
const tooltip = css({
  display: "grid",
  gap: "1",
  maxW: "[360px]",
  textStyle: "xs",
});
const tooltipTitle = css({ fontWeight: "semibold", color: "fg.heading" });
const tooltipSectionHeading = css({ display: "block" });
const tooltipSectionHeadingStyle = {
  borderBottom: "1px solid rgba(203, 213, 225, 0.55)",
  fontWeight: 700,
  paddingBottom: 4,
} satisfies CSSProperties;
const tooltipOperations = css({ display: "grid", gap: "[2px]" });
const warning = css({ color: "[#92400e]", fontWeight: "medium" });
const uncertaintyDetails = css({
  color: "[#92400e]",
  textStyle: "xs",
  cursor: "pointer",
});
const noProduction = css({
  position: "absolute",
  left: "2",
  top: "[50%]",
  transform: "translateY(-50%)",
  textStyle: "xs",
  color: "fg.subtle",
});

const lineSourceLabel = (source: string): string =>
  ({
    campaign_sheet: "confirmed campaign sheet",
    planning_gantt_order: "production plan order",
    planning_gantt_campaign: "production plan campaign",
    sap_order_operation: "SAP order operations",
    sap_recipe_operation: "SAP recipe operations",
    recipe_resource: "SAP recipe resources",
    standard_lot: "standard lot-size mapping",
    planning_table: "PlanningTable material mapping",
  })[source] ?? source.replaceAll("_", " ");

export const lineOccupancyTimingLabel = ({
  derivation,
  finishSource,
  startSource,
}: {
  derivation: string;
  finishSource: string;
  startSource: string;
}): string => {
  if (derivation === "confirmed") {
    return "Confirmed production dates";
  }
  if (startSource === "afko_actual" && finishSource === "afko_actual") {
    return "Actual dates from SAP production order";
  }
  if (startSource === "afko_prorated_from_receipt") {
    return "Estimated from SAP order and receipt dates";
  }
  if (derivation === "afko_order") {
    return "Dates from SAP production order";
  }
  return derivation.replaceAll("_", " ");
};

export const lineOccupancyOperationsFromReason = (
  reason: string,
): readonly string[] => {
  const match = /(?:^|;\s*)operations \[([^\]]*)\]/u.exec(reason);
  return match?.[1]
    ? match[1]
        .split(";")
        .map((operation) => operation.trim())
        .filter(Boolean)
    : [];
};

interface LineOccupancyRowsProps {
  background: string;
  end: string;
  focusedBatchIdentities?: ReadonlySet<string>;
  geometry: TimelineGeometry;
  index: SiteOccupancyIndex;
  material: string;
  materialNameByMaterial: ReadonlyMap<string, string>;
  start: string;
  ticks: readonly number[];
  onExpansionChange: () => void;
}

const UncertaintyRow = ({
  background,
  occupancy,
  plotWidth,
}: {
  background: string;
  occupancy: MaterialOccupancyModel;
  plotWidth: number;
}) =>
  occupancy.uncertainBatches.length > 0 ? (
    <div
      className={row}
      data-line-occupancy-uncertainty-summary="true"
      style={{ background }}
    >
      <div className={label}>
        <details className={uncertaintyDetails}>
          <summary>
            {occupancy.uncertaintySummary.batchCount} production window
            {occupancy.uncertaintySummary.batchCount === 1
              ? " has"
              : "s have"}{" "}
            uncertain line assignment
          </summary>
          <div>
            Candidate lines:{" "}
            {occupancy.uncertaintySummary.candidateLineIds.join(", ") ||
              "none recorded"}
          </div>
          <div>
            Sources: {occupancy.uncertaintySummary.lineSources.join(", ")}
          </div>
          <div>
            Evidence:{" "}
            {occupancy.uncertainBatches
              .slice(0, 3)
              .map(
                (batch) =>
                  `${batch.batch ?? "unknown batch"} / ${batch.order ?? "unknown order"}`,
              )
              .join("; ")}
          </div>
        </details>
      </div>
      <div className={plot} style={{ width: plotWidth, minHeight: 28 }} />
    </div>
  ) : null;

export const LineOccupancyRows = ({
  background,
  end,
  focusedBatchIdentities,
  geometry,
  index,
  material,
  materialNameByMaterial,
  onExpansionChange,
  start,
  ticks,
}: LineOccupancyRowsProps) => {
  const { leftForDate, leftForDay, plotWidth, widthForDays } = geometry;
  const occupancy = useMemo(
    () =>
      deriveMaterialOccupancy({
        end,
        focusedBatchIdentities,
        index,
        material,
        start,
      }),
    [end, focusedBatchIdentities, index, material, start],
  );
  const [expandedLineIds, setExpandedLineIds] = useState<Set<string>>(
    () => new Set(),
  );
  const buildingById = useMemo(
    () =>
      new Map(
        index.timeline.buildings.map((building) => [building.id, building]),
      ),
    [index],
  );

  if (
    focusedBatchIdentities &&
    occupancy.rows.length === 0 &&
    occupancy.uncertainBatches.length === 0
  ) {
    return (
      <div className={row} role="status" style={{ background }}>
        <div className={label}>
          No recorded occupancy matches the selected batches
        </div>
        <div className={plot} style={{ width: plotWidth, minHeight: 28 }} />
      </div>
    );
  }

  if (occupancy.emptyArtifact) {
    return (
      <div className={row} role="status" style={{ background }}>
        <div className={label}>
          No recorded production in this site artifact
        </div>
        <div className={plot} style={{ width: plotWidth, minHeight: 28 }} />
      </div>
    );
  }
  if (occupancy.outsideCoverage) {
    return (
      <div className={row} style={{ background }}>
        <div className={label}>Recorded occupancy · Outside artifact range</div>
        <div className={plot} style={{ width: plotWidth, minHeight: 28 }} />
      </div>
    );
  }
  if (occupancy.rows.length === 0) {
    const uncertain = occupancy.uncertainBatches;
    return (
      <>
        <UncertaintyRow
          background={background}
          occupancy={occupancy}
          plotWidth={plotWidth}
        />
        <div className={row} style={{ background }}>
          <div className={label}>
            {uncertain.length
              ? "No resolved line"
              : occupancy.receiptEvents.length
                ? "No recorded production · receipt evidence only"
                : "No recorded production"}
          </div>
          <div
            className={plot}
            data-line-occupancy-uncertain={uncertain.length || undefined}
            style={{ width: plotWidth, minHeight: 28 }}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <UncertaintyRow
        background={background}
        occupancy={occupancy}
        plotWidth={plotWidth}
      />
      {occupancy.rows.map((occupancyRow) => {
        const expanded = expandedLineIds.has(occupancyRow.line.id);
        const visibleTracks = expanded
          ? occupancyRow.trackCount
          : Math.min(occupancyRow.trackCount, MAX_COLLAPSED_TRACKS);
        const height = Math.max(24, visibleTracks * OCCUPANCY_TRACK_HEIGHT + 2);
        const trackAreaTop =
          (height - visibleTracks * OCCUPANCY_TRACK_HEIGHT) / 2;
        return (
          <div
            className={row}
            key={`${material}::${occupancyRow.line.id}`}
            data-line-occupancy-row={occupancyRow.line.id}
            style={{ background }}
          >
            <div className={label}>
              Recorded occupancy · {occupancyRow.line.name}
              {occupancyRow.trackCount > MAX_COLLAPSED_TRACKS && (
                <button
                  type="button"
                  className={expand}
                  aria-expanded={expanded}
                  onClick={() => {
                    setExpandedLineIds((current) => {
                      const next = new Set(current);
                      if (next.has(occupancyRow.line.id)) {
                        next.delete(occupancyRow.line.id);
                      } else {
                        next.add(occupancyRow.line.id);
                      }
                      return next;
                    });
                    onExpansionChange();
                  }}
                >
                  {expanded
                    ? "Collapse"
                    : `Show ${occupancyRow.trackCount} tracks`}
                </button>
              )}
            </div>
            <div
              className={plot}
              style={{ width: plotWidth, minHeight: height }}
            >
              {ticks.map((day) => (
                <span
                  key={day}
                  className={gridTick}
                  aria-hidden="true"
                  style={{ left: leftForDay(day) }}
                />
              ))}
              {occupancyRow.batches.length === 0 && (
                <span className={noProduction}>No recorded production</span>
              )}
              {occupancyRow.batches.map(
                ({ batch: siteBatch, focused, overlaps, track }) => {
                  if (track >= visibleTracks) {
                    return null;
                  }
                  const visibleStart =
                    siteBatch.start < start ? start : siteBatch.start;
                  const visibleEnd = siteBatch.end > end ? end : siteBatch.end;
                  const family = siteBatch.product_family_key
                    ? index.familyByKey.get(siteBatch.product_family_key)
                    : undefined;
                  const building = siteBatch.building_id
                    ? buildingById.get(siteBatch.building_id)
                    : undefined;
                  const materialName =
                    siteBatch.material_name ??
                    materialNameByMaterial.get(siteBatch.material) ??
                    siteBatch.material;
                  const operations = lineOccupancyOperationsFromReason(
                    siteBatch.line_reason,
                  );
                  const ariaLabel = `${focused ? "Focused material" : "Other line material"} ${materialName}, batch ${siteBatch.batch ?? "unknown"}, ${siteBatch.start} to ${siteBatch.end}, ${occupancyRow.line.name}`;
                  return (
                    <div
                      key={siteBatch.id}
                      className={barPosition}
                      style={{
                        left: leftForDate(visibleStart),
                        top:
                          trackAreaTop +
                          track * OCCUPANCY_TRACK_HEIGHT +
                          (OCCUPANCY_TRACK_HEIGHT - OCCUPANCY_BAR_HEIGHT) / 2,
                        width: widthForDays(
                          inclusiveCalendarDays(visibleStart, visibleEnd),
                        ),
                        height: OCCUPANCY_BAR_HEIGHT,
                      }}
                    >
                      <TimelineTooltip
                        delayMs={150}
                        wrapperStyle={{ width: "100%", height: "100%" }}
                        content={
                          <div className={tooltip}>
                            <div className={tooltipTitle}>{materialName}</div>
                            <div>
                              {siteBatch.material} · Batch{" "}
                              {siteBatch.batch ?? "unknown"} · Order{" "}
                              {siteBatch.order ?? "unknown"}
                            </div>
                            <div>
                              {siteBatch.start} – {siteBatch.end} ·{" "}
                              {lineOccupancyTimingLabel({
                                derivation: siteBatch.derivation,
                                finishSource: siteBatch.finish_source,
                                startSource: siteBatch.start_source,
                              })}
                            </div>
                            {family?.group_code && (
                              <div>Product family: {family.group_code}</div>
                            )}
                            <div>
                              Line: {occupancyRow.line.name}
                              {building ? ` · ${building.name}` : ""}
                            </div>
                            <div>
                              Line evidence:{" "}
                              {lineSourceLabel(siteBatch.line_source)}
                            </div>
                            {operations.length > 0 && (
                              <div
                                className={tooltipOperations}
                                style={{ marginTop: 12 }}
                              >
                                <span
                                  className={tooltipSectionHeading}
                                  style={tooltipSectionHeadingStyle}
                                >
                                  Operations
                                </span>
                                {operations.map((operation) => (
                                  <span key={operation}>{operation}</span>
                                ))}
                              </div>
                            )}
                            {overlaps && (
                              <div className={warning}>
                                This recorded window overlaps another window.
                              </div>
                            )}
                          </div>
                        }
                      >
                        <button
                          type="button"
                          className={bar}
                          aria-label={ariaLabel}
                          data-occupancy-focus={focused ? "focused" : "context"}
                          style={{
                            background: focused ? "#2563eb" : "#cbd5e1",
                            borderColor: focused ? "#1d4ed8" : "#94a3b8",
                            borderWidth: 1,
                          }}
                        />
                      </TimelineTooltip>
                    </div>
                  );
                },
              )}
            </div>
          </div>
        );
      })}
    </>
  );
};
