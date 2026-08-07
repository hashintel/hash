import { Tooltip } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { formatNumber } from "../../../shared/cost";

import type {
  PipelineOrderMarker,
  PipelineOrderMarkers,
  PipelineSummary,
  PipelineStage,
} from "../../../shared/types";
import type { SegmentId } from "../whatif";

const wrap = css({
  display: "flex",
  flexDirection: "column",
  gap: "4",
  minW: "0",
});
const barsStack = css({ display: "flex", flexDirection: "column", gap: "3" });
const emptyBase = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "lg",
  borderWidth: "1px",
  borderStyle: "dashed",
  borderColor: "bd.subtle",
  bg: "bg.subtle",
  textStyle: "xs",
  color: "fg.subtle",
});
const emptyTall = css({ h: "20" });
const emptyShort = css({ h: "14" });
const legend = css({
  display: "flex",
  alignItems: "center",
  gap: "3",
  flexWrap: "wrap",
});
const swatchBase = css({
  w: "3",
  h: "3",
  borderRadius: "sm",
  transition: "opacity",
});
const swatchDimmed = css({ opacity: "0.3" });
const legendLabelActive = css({ textStyle: "xs", color: "fg.muted" });
const legendLabelInactive = css({
  textStyle: "xs",
  color: "fg.subtle",
  textDecoration: "line-through",
});
const legendButton = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  cursor: "pointer",
  transition: "opacity",
  _hover: { opacity: "0.8" },
});
const legendStatic = css({ display: "flex", alignItems: "center", gap: "1.5" });
const simLegend = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  ml: "2",
  pl: "2",
  borderLeftWidth: "1px",
  borderColor: "bd.subtle",
});
const simSwatch = css({
  w: "3",
  h: "3",
  borderRadius: "sm",
  borderWidth: "1px",
  borderStyle: "dashed",
  borderColor: "fg.muted",
  bg: "bgSolid.min",
});
const simLabel = css({ textStyle: "xs", color: "fg.muted" });
const barRowBase = css({
  display: "flex",
  gap: "1",
  alignItems: "stretch",
  minW: "0",
});
const barTrack = css({
  position: "relative",
  display: "flex",
  gap: "1",
  flex: "1",
  minW: "0",
  overflow: "visible",
});
const barTall = css({ h: "10" });
const barShort = css({ h: "7" });
const labelBoxBase = css({
  w: "[150px]",
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  pr: "3",
  borderRadius: "lg",
  bg: "bgSolid.min",
});
const labelBoxSolid = css({
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
});
const labelBoxDashed = css({
  borderWidth: "1px",
  borderStyle: "dashed",
  borderColor: "fg.subtle",
});
const labelText = css({
  textStyle: "xxs",
  color: "fg.muted",
  fontWeight: "normal",
  letterSpacing: "[0.1em]",
  whiteSpace: "nowrap",
});
const labelTotal = css({
  ml: "1.5",
  textStyle: "xs",
  fontWeight: "medium",
  color: "fg.heading",
  fontVariantNumeric: "tabular-nums",
  letterSpacing: "[normal]",
});
const segWrapBase = css({
  position: "relative",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "lg",
});
const segWrapDashed = css({
  borderWidth: "1px",
  borderStyle: "dashed",
  borderColor: "[rgba(255,255,255,0.7)]",
  opacity: "0.8",
});
const segmentTooltipTrigger = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  w: "full",
  h: "full",
});
const segValue = css({
  textStyle: "xs",
  fontWeight: "medium",
  color: "[white]",
  whiteSpace: "nowrap",
});
const orderMarkerCluster = css({
  position: "absolute",
  top: "[50%]",
  display: "flex",
  alignItems: "center",
  zIndex: "[10]",
  transform: "translateY(-50%)",
});
const orderMarkerClusterBefore = css({
  left: "3",
});
const orderMarkerClusterAfter = css({
  right: "3",
});
const orderMarkerBeforeArrow = css({
  w: "4.5",
  h: "2",
  flexShrink: 0,
  color: "fg.max",
});
const orderMarker = css({
  display: "block",
  position: "relative",
  w: "3",
  h: "3",
  bg: "fg.max",
  borderWidth: "2px",
  borderStyle: "solid",
  borderColor: "bgSolid.min",
  boxShadow: "sm",
  cursor: "help",
  flexShrink: 0,
  transform: "[rotate(45deg)]",
});
const orderMarkerTooltipTrigger = css({
  display: "flex",
  alignItems: "center",
});
const orderLegendSwatch = css({
  w: "2.5",
  h: "2.5",
  bg: "fg.max",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bgSolid.min",
  transform: "[rotate(45deg)]",
});

interface PipelineWaterfallProps {
  summaries: Record<string, PipelineSummary>;
  /**
   * The route to render. The header (route picker, title, chevron) lives in the
   * shared `PipelineHeader`, so the waterfall is purely the bars + legend and
   * the active route is always controlled by the parent.
   */
  activeRoute: string;
  /** Baseline mean stages for the simulator-eligible population. */
  baselineStagesMean?: PipelineStage[];
  /** Baseline median stages for the simulator-eligible population. */
  baselineStagesMedian?: PipelineStage[];
  /** Re-segmented stages for the dashed mean bar. */
  simulatedStagesMean?: PipelineStage[];
  /** Re-segmented stages for the dashed median bar. */
  simulatedStagesMedian?: PipelineStage[];
  /** Complete-duration totals for the simulator's baseline population. */
  baselineTotalMean?: number | null;
  baselineTotalMedian?: number | null;
  /** Complete-duration totals after applying the simulation. */
  simulatedTotalMean?: number | null;
  simulatedTotalMedian?: number | null;
  /** When true, render at the larger size suited to the expanded panel. */
  expanded?: boolean;
  /** Render P75 and P95 rows when stages carry percentile values. */
  showPercentileRows?: boolean;
  /** Render one actual-duration row instead of aggregate statistic rows. */
  totalOnly?: boolean;
  /** Customer-order creation positions to overlay on mean/median rows. */
  orderArrivalMarkers?: PipelineOrderMarkers;
  /**
   * Which pipeline segments are currently included. Omitted = all four
   * active (non-interactive behaviour).
   */
  activeSegments?: Set<SegmentId>;
  /**
   * Toggle a segment on/off when its legend chip is clicked. Omitted =
   * legend renders as static chips (today's behaviour).
   */
  onSegmentToggle?: (id: SegmentId) => void;
}

const SEGMENT_COLORS: Record<string, string> = {
  procurement: "#64ade6",
  production: "#9797fe",
  qa_hold: "#c3a8e6",
  transit: "#ff9c5e",
  order_wait: "#5eb98a",
  fulfilment: "#e6b34a",
};

const PipelineBar = ({
  label,
  stages,
  total,
  metric,
  tall = false,
  dashed = false,
  marker,
  showSegmentTooltips = true,
}: {
  label: string;
  stages: PipelineStage[];
  total: number;
  metric: "mean" | "median" | "p75" | "p95";
  tall?: boolean;
  dashed?: boolean;
  marker?: PipelineOrderMarker;
  showSegmentTooltips?: boolean;
}) => {
  if (total < 0) {
    return null;
  }

  return (
    <div className={cx(barRowBase, tall ? barTall : barShort)}>
      {/* Fixed-width label box. Content is right-justified so the totals
            line up across rows (MEAN / MEDIAN / SIM. MEAN / SIM. MEDIAN).
            tabular-nums keeps digit widths consistent for clean alignment. */}
      <div
        className={cx(labelBoxBase, dashed ? labelBoxDashed : labelBoxSolid)}
      >
        <span className={labelText}>
          {label}:
          <span className={labelTotal}>
            {formatNumber(total, { maximumFractionDigits: 0 })}d
          </span>
        </span>
      </div>
      <div className={barTrack}>
        {total > 0 &&
          stages.map((stage) => {
            const value = stage[metric] ?? 0;
            if (value <= 0) {
              return null;
            }
            const pct = (value / total) * 100;
            const color = SEGMENT_COLORS[stage.type] ?? "#94a3b8";
            const tooltipContent = (
              <>
                {stage.label}:{" "}
                {formatNumber(value, { maximumFractionDigits: 0 })}d {metric}
                {stage.n != null ? ` (n=${formatNumber(stage.n)})` : ""}
              </>
            );
            return (
              <div
                key={stage.id}
                className={cx(segWrapBase, dashed ? segWrapDashed : undefined)}
                style={{
                  flex: `${pct} 1 0%`,
                  minWidth: "16px",
                  backgroundColor: color,
                }}
              >
                <Tooltip
                  content={tooltipContent}
                  disableTooltip={!showSegmentTooltips}
                  openDelay="none"
                  closeDelay="none"
                  className={segmentTooltipTrigger}
                >
                  {pct > 4 && (
                    <span className={segValue}>
                      {formatNumber(value, { maximumFractionDigits: 0 })}d
                    </span>
                  )}
                </Tooltip>
              </div>
            );
          })}
        {marker && (
          <div
            className={cx(
              orderMarkerCluster,
              marker.beforeTrace
                ? orderMarkerClusterBefore
                : marker.afterTrace || marker.positionPct >= 100
                  ? orderMarkerClusterAfter
                  : undefined,
            )}
            style={
              marker.beforeTrace ||
              marker.afterTrace ||
              marker.positionPct >= 100
                ? undefined
                : {
                    left: `${marker.positionPct}%`,
                    transform: "translate(-50%, -50%)",
                  }
            }
          >
            <Tooltip
              content={
                <>
                  {metric === "mean" ? "Mean" : "Median"} order:{" "}
                  {formatNumber(marker.daysBeforeRouteEndpoint, {
                    maximumFractionDigits: 0,
                  })}
                  d before route endpoint · {formatNumber(marker.n)}{" "}
                  {marker.routeLabel} order lines
                  {marker.beforeVisibleCount > 0
                    ? ` · ${formatNumber(marker.beforeVisibleCount)} before visible trace`
                    : ""}
                  {marker.beforeTrace
                    ? " · date predates visible pipeline start"
                    : ""}
                  {marker.afterTrace
                    ? " · order created after route endpoint"
                    : ""}
                </>
              }
              openDelay="none"
              closeDelay="none"
              className={orderMarkerTooltipTrigger}
            >
              {marker.beforeTrace && (
                <svg
                  className={orderMarkerBeforeArrow}
                  viewBox="0 0 18 8"
                  aria-hidden
                >
                  <path
                    d="M0 4 H18 M0 4 L4 1 M0 4 L4 7"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
              <span
                className={orderMarker}
                aria-label="Customer order created"
              />
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  );
};
export const PipelineWaterfall = ({
  summaries,
  activeRoute,
  baselineStagesMean,
  baselineStagesMedian,
  simulatedStagesMean,
  simulatedStagesMedian,
  baselineTotalMean,
  baselineTotalMedian,
  simulatedTotalMean,
  simulatedTotalMedian,
  expanded = false,
  showPercentileRows = false,
  totalOnly = false,
  orderArrivalMarkers,
  activeSegments,
  onSegmentToggle,
}: PipelineWaterfallProps) => {
  const summary = summaries[activeRoute];
  if (!summary || Object.keys(summaries).length === 0) {
    return null;
  } // The legend always reflects every segment that exists in the route
  // (so a chip can be re-enabled). The bars only render active ones.
  const allStages = summary.stages;
  const isSegmentActive = (type: string) =>
    !activeSegments || activeSegments.has(type as SegmentId);
  const stages = allStages.filter((step) => isSegmentActive(step.type));
  const meanStages = (baselineStagesMean ?? allStages).filter((step) =>
    isSegmentActive(step.type),
  );
  const medianStages = (baselineStagesMedian ?? allStages).filter((step) =>
    isSegmentActive(step.type),
  );
  const allSegmentsActive = stages.length === allStages.length;
  const summedStageMean = meanStages.reduce(
    (total, stage) => total + stage.mean,
    0,
  );
  const summedStageMedian = medianStages.reduce(
    (total, stage) => total + stage.median,
    0,
  );
  const totalMean =
    baselineTotalMean ??
    (allSegmentsActive ? summary.total_mean : summedStageMean);
  const totalMedian =
    baselineTotalMedian ??
    (allSegmentsActive ? summary.total_median : summedStageMedian);
  const summedStageP75 = stages.reduce(
    (total, stage) => total + (stage.p75 ?? 0),
    0,
  );
  const summedStageP95 = stages.reduce(
    (total, stage) => total + (stage.p95 ?? 0),
    0,
  );
  // Complete-order quantiles are not additive. The row label uses the true
  // total distribution while the coloured widths remain normalized marginal
  // segment quantiles.
  const totalP75 =
    allSegmentsActive && summary.total_p75 != null
      ? summary.total_p75
      : summedStageP75;
  const totalP95 =
    allSegmentsActive && summary.total_p95 != null
      ? summary.total_p95
      : summedStageP95;
  // Filter simulated stages the same way so the dashed overlay matches
  // the visible baseline composition exactly.
  const simStagesMean = simulatedStagesMean?.filter((step) =>
    isSegmentActive(step.type),
  );
  const simStagesMedian = simulatedStagesMedian?.filter((step) =>
    isSegmentActive(step.type),
  );
  const simMeanTotal =
    simulatedTotalMean ??
    (simStagesMean
      ? simStagesMean.reduce((acc, step) => acc + step.mean, 0)
      : 0);
  const simMedianTotal =
    simulatedTotalMedian ??
    (simStagesMedian
      ? simStagesMedian.reduce((acc, step) => acc + step.median, 0)
      : 0);
  const hasSimulated =
    (simStagesMean && simMeanTotal > 0) ||
    (simStagesMedian && simMedianTotal > 0);
  const hasAnyActive = stages.length > 0;
  return (
    <div className={wrap}>
      {/* Bars */}
      {hasAnyActive ? (
        <div className={barsStack}>
          {totalOnly ? (
            <PipelineBar
              label="TOTAL"
              stages={stages}
              total={totalMean}
              metric="mean"
              tall={expanded}
              showSegmentTooltips={false}
            />
          ) : (
            <>
              <PipelineBar
                label="MEAN"
                stages={meanStages}
                total={totalMean}
                metric="mean"
                tall={expanded}
                marker={orderArrivalMarkers?.mean}
              />

              <PipelineBar
                label="MEDIAN"
                stages={medianStages}
                total={totalMedian}
                metric="median"
                tall={expanded}
                marker={orderArrivalMarkers?.median}
              />

              {showPercentileRows && totalP75 > 0 && (
                <PipelineBar
                  label="P75"
                  stages={stages}
                  total={totalP75}
                  metric="p75"
                  tall={expanded}
                />
              )}
              {showPercentileRows && totalP95 > 0 && (
                <PipelineBar
                  label="P95"
                  stages={stages}
                  total={totalP95}
                  metric="p95"
                  tall={expanded}
                />
              )}

              {simStagesMean && simMeanTotal > 0 && (
                <PipelineBar
                  label="SIM. MEAN"
                  stages={simStagesMean}
                  total={simMeanTotal}
                  metric="mean"
                  tall={expanded}
                  dashed
                />
              )}
              {simStagesMedian && simMedianTotal > 0 && (
                <PipelineBar
                  label="SIM. MEDIAN"
                  stages={simStagesMedian}
                  total={simMedianTotal}
                  metric="median"
                  tall={expanded}
                  dashed
                />
              )}
            </>
          )}
        </div>
      ) : (
        <div className={cx(emptyBase, expanded ? emptyTall : emptyShort)}>
          Select at least one segment from the legend below.
        </div>
      )}

      {/* Segment legend. Renders every segment that exists on the route
          even when toggled off, so users can re-enable a chip. When
          `onSegmentToggle` is wired, chips render as buttons; otherwise
          they fall back to the original static divs. */}
      <div className={legend}>
        {allStages.map((step) => {
          const active = isSegmentActive(step.type);
          const swatch = (
            <div
              className={cx(swatchBase, active ? undefined : swatchDimmed)}
              style={{
                backgroundColor: SEGMENT_COLORS[step.type] ?? "#94a3b8",
              }}
            />
          );
          const labelEl = (
            <span className={active ? legendLabelActive : legendLabelInactive}>
              {step.label}
            </span>
          );
          if (onSegmentToggle) {
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => onSegmentToggle(step.type as SegmentId)}
                className={legendButton}
                aria-pressed={active}
                title={active ? `Hide ${step.label}` : `Show ${step.label}`}
              >
                {swatch}
                {labelEl}
              </button>
            );
          }
          return (
            <div key={step.id} className={legendStatic}>
              {swatch}
              {labelEl}
            </div>
          );
        })}
        {hasSimulated && (
          <div className={simLegend}>
            <div className={simSwatch} />
            <span className={simLabel}>Simulated</span>
          </div>
        )}
        {orderArrivalMarkers &&
          (orderArrivalMarkers.mean || orderArrivalMarkers.median) && (
            <div className={legendStatic}>
              <div className={orderLegendSwatch} />
              <span className={legendLabelActive}>Customer order created</span>
            </div>
          )}
      </div>
    </div>
  );
};
