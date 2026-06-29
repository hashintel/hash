import { useCallback, useMemo, useState } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  formatCost,
  formatNumber,
  useCostParams,
  useOutlierSetting,
} from "../../shared/cost";
import { BindingLever } from "./e2e-what-if/binding-lever";
import { KpiTile } from "./e2e-what-if/what-if-kpis";
import { PipelineHeader } from "./shared/pipeline-header";
import { PipelineWaterfall } from "./shared/pipeline-waterfall";
import {
  aggregateSimulation,
  isCapActive,
  selectTopLevers,
  type SegmentId,
} from "./whatif";

import type { TimeRange } from "../../shared/time-range";
import type { GraphData } from "../../shared/types";

interface E2EWhatIfProps {
  graph: GraphData;
  timeRange: TimeRange;
  onCollapse: () => void;
  onStepDrill: (stepId: string) => void;
  /** Segments currently included in totals, KPIs and the lever list. */
  activeSegments: Set<SegmentId>;
  /** Toggle a segment on/off when its legend chip is clicked. */
  onSegmentToggle: (id: SegmentId) => void;
  /** Controlled active route (lifted from Overview so collapse/expand
   * doesn't reset the selection). */
  activeRoute: string;
  onActiveRouteChange: (route: string) => void;
}

const MAX_VISIBLE_LEVERS = 5;

const root = css({
  h: "full",
  display: "flex",
  flexDirection: "column",
  px: "6",
  py: "3",
  minH: "0",
  overflow: "hidden",
});
const headerMb = css({ mb: "3" });
// `gridTemplateColumns` is set inline: Panda's arbitrary-value codegen drops a
// space-separated track list like `[1fr_360px_280px]` (it only emits function
// forms such as `repeat(...)`), which silently collapsed this to one column.
const grid = css({ display: "grid", gap: "4", flex: "1", minH: "0" });
const gridCols = "1fr 360px 220px";
const leftCol = css({ minW: "0", overflow: "auto", pr: "2" });
const callout = css({
  mt: "4",
  borderRadius: "md",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  bg: "bg.subtle",
  px: "3",
  py: "2",
  textStyle: "xs",
  color: "fg.muted",
  lineHeight: "snug",
});
const calloutStrong = css({ fontWeight: "medium", color: "fg.heading" });
const sideCol = css({
  minW: "0",
  display: "flex",
  flexDirection: "column",
  minH: "0",
});
const sideHeaderRow = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  mb: "2",
});
const sectionTitle = css({
  textStyle: "sm",
  fontWeight: "medium",
  color: "fg.heading",
});
const sectionTitleMb = css({
  textStyle: "sm",
  fontWeight: "medium",
  color: "fg.heading",
  mb: "2",
});
const leverList = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  overflow: "auto",
  pr: "1",
  flex: "1",
  minH: "0",
});
const leverEmpty = css({ textStyle: "xs", color: "fg.subtle", py: "4" });
// Left-aligned within the lever column; the control is a ds `Button` (linkSubtle).
const showToggle = css({ alignSelf: "flex-start", pt: "1" });
const kpiGrid = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  w: "[220px]",
});

export const E2EWhatIf = ({
  graph,
  timeRange,
  onCollapse,
  onStepDrill,
  activeSegments,
  onSegmentToggle,
  activeRoute,
  onActiveRouteChange,
}: E2EWhatIfProps) => {
  const { waccRate, storageCost } = useCostParams();
  const { excludeOutliers } = useOutlierSetting();

  const setActiveRoute = onActiveRouteChange;
  // Levers store CAP days: missing entries or caps at the step's max mean
  // uncapped (no change). Moving a lever left picks progressively stricter
  // percentile caps. See whatif.ts header for full semantics.
  const [capLevers, setCapLevers] = useState<Record<string, number>>({});
  const [showAll, setShowAll] = useState(false);

  const batches = useMemo(
    () => graph.batch_timelines?.batches ?? [],
    [graph.batch_timelines],
  );

  const leverDefs = useMemo(
    () =>
      selectTopLevers(graph.nodes, batches, activeRoute || null, {
        maxN: showAll ? 16 : MAX_VISIBLE_LEVERS,
        activeSegments,
      }),
    [graph.nodes, batches, activeRoute, showAll, activeSegments],
  );

  const windowMonths = timeRange === "3m" ? 3 : timeRange === "6m" ? 6 : 12;

  const simulation = useMemo(
    () =>
      aggregateSimulation(
        graph.nodes,
        batches,
        capLevers,
        leverDefs,
        activeRoute || null,
        { waccRate, storageCost },
        { windowMonths, activeSegments, excludeOutliers },
      ),
    [
      graph.nodes,
      batches,
      capLevers,
      leverDefs,
      activeRoute,
      waccRate,
      storageCost,
      windowMonths,
      activeSegments,
      excludeOutliers,
    ],
  );

  const handleLeverChange = useCallback((stepId: string, value: number) => {
    setCapLevers((prev) => ({ ...prev, [stepId]: value }));
  }, []);

  const handleReset = useCallback(() => {
    setCapLevers({});
  }, []);

  const hasActiveLevers = leverDefs.some((line) => {
    return isCapActive(line, capLevers[line.stepId]);
  });

  const coverage = graph.batch_timelines?.coverage;
  const coverageByRoute = graph.batch_timelines?.coverage_by_route;
  const rangeLabel = `last ${windowMonths} months`;

  return (
    <div className={root}>
      {/* Shared header (route selector + collapse chevron). */}
      <div className={headerMb}>
        <PipelineHeader
          summaries={graph.pipeline_summary}
          coverage={coverage}
          coverageByRoute={coverageByRoute}
          rangeLabel={rangeLabel}
          activeRoute={activeRoute}
          onActiveRouteChange={setActiveRoute}
          expanded
          onCollapse={onCollapse}
        />
      </div>

      <div className={grid} style={{ gridTemplateColumns: gridCols }}>
        {/* Left: waterfall */}
        <div className={leftCol}>
          <PipelineWaterfall
            summaries={graph.pipeline_summary}
            simulatedStagesMean={simulation.simulatedStagesMean}
            simulatedStagesMedian={simulation.simulatedStagesMedian}
            expanded
            activeRoute={activeRoute}
            activeSegments={activeSegments}
            onSegmentToggle={onSegmentToggle}
          />

          <div className={callout}>
            <span className={calloutStrong}>Pre-production held constant.</span>{" "}
            Procurement and raw-material dwell sit before Production Start and
            are not simulated here. Use the per-step cost calculator for
            inventory-driven savings on those steps.
          </div>
        </div>

        {/* Middle: levers */}
        <div className={sideCol}>
          <div className={sideHeaderRow}>
            <h4 className={sectionTitle}>Simulation levers</h4>
            <Button
              variant="ghost"
              tone="neutral"
              size="xs"
              iconName="rotateLeft"
              onClick={handleReset}
              disabled={!hasActiveLevers}
            >
              Reset
            </Button>
          </div>
          <div className={leverList}>
            {leverDefs.length === 0 && (
              <div className={leverEmpty}>
                No ranked step data available for this route. Try regenerating
                data or selecting a different route.
              </div>
            )}
            {leverDefs.map((lever) => (
              <BindingLever
                key={lever.stepId}
                lever={lever}
                capDays={capLevers[lever.stepId]}
                onChange={(value) => handleLeverChange(lever.stepId, value)}
                onDrill={() => onStepDrill(lever.stepId)}
                nodes={graph.nodes}
              />
            ))}
            {leverDefs.length >= MAX_VISIBLE_LEVERS && !showAll && (
              <Button
                variant="linkSubtle"
                tone="neutral"
                size="xs"
                onClick={() => setShowAll(true)}
                className={showToggle}
              >
                Show more steps
              </Button>
            )}
            {showAll && (
              <Button
                variant="linkSubtle"
                tone="neutral"
                size="xs"
                onClick={() => setShowAll(false)}
                className={showToggle}
              >
                Show fewer
              </Button>
            )}
          </div>
        </div>

        {/* Right: KPIs */}
        <div className={sideCol}>
          <h4 className={sectionTitleMb}>Simulated impact</h4>
          <div className={kpiGrid}>
            <KpiTile
              label="E2E mean"
              value={
                simulation.simulatedMean != null
                  ? `${formatNumber(simulation.simulatedMean, { maximumFractionDigits: 0 })}d`
                  : "\u2013"
              }
              delta={
                simulation.baselineMean != null &&
                simulation.simulatedMean != null
                  ? simulation.simulatedMean - simulation.baselineMean
                  : null
              }
              deltaUnit="d"
              success={
                simulation.baselineMean != null &&
                simulation.simulatedMean != null &&
                simulation.simulatedMean < simulation.baselineMean
              }
            />

            <KpiTile
              label="E2E median"
              value={
                simulation.simulatedMedian != null
                  ? `${formatNumber(simulation.simulatedMedian, { maximumFractionDigits: 0 })}d`
                  : "\u2013"
              }
              delta={
                simulation.baselineMedian != null &&
                simulation.simulatedMedian != null
                  ? simulation.simulatedMedian - simulation.baselineMedian
                  : null
              }
              deltaUnit="d"
              success={
                simulation.baselineMedian != null &&
                simulation.simulatedMedian != null &&
                simulation.simulatedMedian < simulation.baselineMedian
              }
            />

            <KpiTile
              label="Annualised saving"
              value={formatCost(
                simulation.costSavingAnnualised,
                simulation.costCurrency,
                {
                  compact: true,
                },
              )}
              subtle={
                simulation.batchesAffected > 0
                  ? `${simulation.batchesAffected}/${simulation.batchesTotal} batches`
                  : undefined
              }
              success={
                simulation.costSavingAnnualised != null &&
                simulation.costSavingAnnualised > 0
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
};
