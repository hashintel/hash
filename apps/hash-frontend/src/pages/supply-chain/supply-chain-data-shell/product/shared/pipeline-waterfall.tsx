import { css, cx } from "@hashintel/ds-helpers/css";

import { formatNumber } from "../../../shared/cost";
import { Tooltip } from "../../../shared/tooltip";

import type { PipelineSummary, PipelineStage } from "../../../shared/types";
import type { SegmentId } from "../whatif";

const wrap = css({
  display: "flex",
  flexDirection: "column",
  gap: "4",
  minW: "0",
  overflowX: "hidden",
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
const segValue = css({
  textStyle: "xs",
  fontWeight: "medium",
  color: "[white]",
  whiteSpace: "nowrap",
});

interface PipelineWaterfallProps {
  summaries: Record<string, PipelineSummary>;
  /**
   * The route to render. The header (route picker, title, chevron) lives in the
   * shared `PipelineHeader`, so the waterfall is purely the bars + legend and
   * the active route is always controlled by the parent.
   */
  activeRoute: string;
  /** Re-segmented stages for the dashed mean bar. */
  simulatedStagesMean?: PipelineStage[];
  /** Re-segmented stages for the dashed median bar. */
  simulatedStagesMedian?: PipelineStage[];
  /** When true, render at the larger size suited to the expanded panel. */
  expanded?: boolean;
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
};

const PipelineBar = ({
  label,
  stages,
  total,
  metric,
  tall = false,
  dashed = false,
}: {
  label: string;
  stages: PipelineStage[];
  total: number;
  metric: "mean" | "median";
  tall?: boolean;
  dashed?: boolean;
}) => {
  if (total <= 0) {
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
      {stages.map((stage) => {
        const value = stage[metric];
        if (value <= 0) {
          return null;
        }
        const pct = (value / total) * 100;
        const color = SEGMENT_COLORS[stage.type] ?? "#94a3b8";
        const tooltipContent = (
          <>
            {stage.label}: {formatNumber(value, { maximumFractionDigits: 0 })}d{" "}
            {metric}
            {stage.n != null ? ` (n=${formatNumber(stage.n)})` : ""}
          </>
        );

        return (
          <Tooltip
            key={stage.id}
            content={tooltipContent}
            delayMs={0}
            wrapperClassName={cx(
              segWrapBase,
              dashed ? segWrapDashed : undefined,
            )}
            wrapperStyle={{
              flex: `${pct} 1 0%`,
              minWidth: "16px",
              backgroundColor: color,
            }}
          >
            {pct > 4 && (
              <span className={segValue}>
                {formatNumber(value, { maximumFractionDigits: 0 })}d
              </span>
            )}
          </Tooltip>
        );
      })}
    </div>
  );
};
export const PipelineWaterfall = ({
  summaries,
  activeRoute,
  simulatedStagesMean,
  simulatedStagesMedian,
  expanded = false,
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
  const totalMean = stages.reduce((acc, step) => acc + step.mean, 0);
  const totalMedian = stages.reduce((acc, step) => acc + step.median, 0); // Filter simulated stages the same way so the dashed overlay matches
  // the visible baseline composition exactly.
  const simStagesMean = simulatedStagesMean?.filter((step) =>
    isSegmentActive(step.type),
  );
  const simStagesMedian = simulatedStagesMedian?.filter((step) =>
    isSegmentActive(step.type),
  );
  const simMeanTotal = simStagesMean
    ? simStagesMean.reduce((acc, step) => acc + step.mean, 0)
    : 0;
  const simMedianTotal = simStagesMedian
    ? simStagesMedian.reduce((acc, step) => acc + step.median, 0)
    : 0;
  const hasSimulated =
    (simStagesMean && simMeanTotal > 0) ||
    (simStagesMedian && simMedianTotal > 0);
  const hasAnyActive = stages.length > 0 && (totalMean > 0 || totalMedian > 0);
  return (
    <div className={wrap}>
      {/* Bars */}
      {hasAnyActive ? (
        <div className={barsStack}>
          <PipelineBar
            label="MEAN"
            stages={stages}
            total={totalMean}
            metric="mean"
            tall={expanded}
          />

          <PipelineBar
            label="MEDIAN"
            stages={stages}
            total={totalMedian}
            metric="median"
            tall={expanded}
          />

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
      </div>
    </div>
  );
};
