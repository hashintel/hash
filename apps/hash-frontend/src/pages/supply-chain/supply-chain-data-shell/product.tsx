import { useCallback, useEffect, useState, useMemo } from "react";

import { Tooltip } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { DWELL_TYPES, isDwellType } from "../shared/categories";
import {
  useCostParams,
  useOutlierSetting,
  computePeriodCost,
  formatCost,
  formatNumber,
} from "../shared/cost";
import { fetchProductionSchedule } from "../shared/data";
import {
  AnalysisSettingsPanel,
  HeaderActionButtons,
} from "../shared/header-actions";
import { ErrorState, LoadingState } from "../shared/load-state";
import { MaterialTag } from "../shared/material-tag";
import { MEASURE_LABELS, useBaseMeasure } from "../shared/measure-context";
import { useProcurementBasis } from "../shared/procurement-basis-context";
import { filterGraphNodeByDateRange } from "../shared/range-filter";
import { useRegistry } from "../shared/registry-context";
import { ScopeSelect } from "../shared/scope-select";
import { SegmentedControl } from "../shared/segmented-control";
import { normaliseSiteCode } from "../shared/site-code";
import { StatChip } from "../shared/stat-chip";
import { statusKey } from "../shared/status";
import { StatusDialog } from "../shared/status-dialog";
import { StepDetailPanel } from "../shared/step-detail-panel";
import {
  trackSupplyChainError,
  trackSupplyChainInteraction,
} from "../shared/telemetry";
import { cutoffForRange, timeRangeLongLabel } from "../shared/time-range";
import { useTimeRange } from "../shared/time-range-context";
import { useSearchParams } from "../shared/use-search-params";
import { CategoryView } from "./product/category-view";
import { E2EWhatIf } from "./product/e2e-what-if";
import { ProcessGraph } from "./product/process-graph";
import { ProductionScheduleView } from "./product/production-schedule";
import { recomputeBatchTimelines } from "./product/recompute-batch-timelines";
import { PipelineHeader } from "./product/shared/pipeline-header";
import { PipelineWaterfall } from "./product/shared/pipeline-waterfall";
import { ALL_SEGMENTS, type SegmentId } from "./product/whatif";
import { useSupplyChainStatusState } from "./site/use-supply-chain-status-state";

import type { ProductionSchedule } from "../shared/production-schedule-types";
import type { GraphData, GraphNode, SiteNode } from "../shared/types";

type ViewMode = "category" | "canvas" | "schedule";

const DEFAULT_ACTIVE_SEGMENTS = ALL_SEGMENTS.filter(
  (id) => id !== "procurement",
);

function sameSegments(
  left: readonly SegmentId[],
  right: Set<SegmentId>,
): boolean {
  return left.length === right.size && left.every((id) => right.has(id));
}

// Fill the layout's main area (a flex column) and clamp our own height to it so
// the content pane can scroll internally instead of overflowing the viewport.
// `minH:0` is required for the inner `overflow:auto` pane to actually scroll.
const rootStyle = css({
  display: "flex",
  flexDirection: "column",
  flex: "1",
  minH: "0",
  minW: "0",
  w: "full",
  maxW: "full",
  boxSizing: "border-box",
});
const headerBar = css({
  borderBottomWidth: "1px",
  borderColor: "bd.subtle",
  px: "6",
  py: "3",
  flexShrink: 0,
});
const headerRow = css({
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "4",
});
const titleCol = css({
  flex: "1",
  minW: "0",
  display: "flex",
  flexDirection: "column",
  gap: "1",
});
const statsRow = css({
  display: "flex",
  alignItems: "center",
  gap: "0",
  textStyle: "sm",
});
// The product view-mode switcher stays prominent; analysis assumptions live
// behind the shared settings cog.
const controlsCol = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: "2",
  flexShrink: 0,
});
const controlsBottomRow = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
});
const contentBase = css({
  px: "6",
  py: "3",
  flex: "1",
  minH: "0",
  minW: "0",
  w: "full",
  maxW: "full",
  boxSizing: "border-box",
});
const overflowHidden = css({ overflow: "hidden" });
const overflowAuto = css({ overflow: "auto" });
const paneShow = css({
  h: "full",
  minH: "0",
  minW: "0",
  w: "full",
  maxW: "full",
});
const hidden = css({ display: "none" });
const scheduleLoadState = css({ h: "full", minH: "56", p: "6" });
const pipelineWrap = css({
  flexShrink: 0,
  borderTopWidth: "1px",
  borderColor: "bd.subtle",
  overflow: "hidden",
  transition: "[height 200ms]",
});
const pipelineExpandedH = css({ h: "[58vh]" });
const pipelineAutoH = css({ h: "auto" });
const emptyPipelineRow = css({
  px: "6",
  py: "3",
  display: "flex",
  alignItems: "center",
  gap: "2",
});
const emptyPipelineTitle = css({
  textStyle: "base",
  fontWeight: "medium",
  color: "fg.heading",
});
const emptyPipelineNote = css({ textStyle: "sm", color: "fg.subtle" });
const collapsedPad = css({ px: "6", py: "3" });
const collapsedStack = css({
  display: "flex",
  flexDirection: "column",
  gap: "4",
});
// Horizontal by default (two hints side-by-side), wrapping to a stack only when
// space is tight — keeps the header short. Same spirit as the KPI chips.
const legendWrap = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  columnGap: "3",
  rowGap: "1",
});
const legendTooltipTrigger = css({
  display: "inline-flex",
  mr: "3",
  cursor: "help",
});
const legendRow = css({ display: "flex", alignItems: "center", gap: "1.5" });
const legendBadgeBase = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.5",
  textStyle: "xxs",
  fontWeight: "medium",
  borderRadius: "sm",
  px: "1",
  py: "[1px]",
  borderWidth: "1px",
  borderStyle: "solid",
});
const legendBadgeGood = css({
  bg: "status.success.bg.subtle",
  color: "status.success.fg.body",
  borderColor: "status.success.bd.subtle",
});
const legendBadgeBad = css({
  bg: "status.error.bg.subtle",
  color: "status.error.fg.body",
  borderColor: "status.error.bd.subtle",
});
const legendLabel = css({ textStyle: "xs", color: "fg.subtle" });
const legendClock = css({ flexShrink: 0 });

interface OverviewProps {
  graph: GraphData;
  productId: string;
  selectedStepId: string | null;
  onStepSelect: (stepId: string | null) => void;
}

function periodTotalCost(
  dwellNodes: GraphNode[],
  waccRate: number,
  storageCost: number,
): number {
  return dwellNodes.reduce(
    (acc, count) =>
      acc +
      computePeriodCost(
        count.monthly,
        count.cost?.unit_price,
        waccRate,
        storageCost,
      ),
    0,
  );
}

const LegendClockIcon = () => {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 12 12"
      fill="none"
      className={legendClock}
      aria-hidden="true"
    >
      <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M6 3.5V6L7.5 7.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
};

const PlanningParamLegend = () => {
  const { measure } = useBaseMeasure();
  const measureLabel = MEASURE_LABELS[measure].toLowerCase();
  return (
    <Tooltip
      content={`How many days the selected ${measureLabel} is over/under the planning assumption for this step`}
      position="bottom"
      openDelay="fast"
      className={legendTooltipTrigger}
    >
      <div className={legendWrap}>
        <div className={legendRow}>
          <span className={cx(legendBadgeBase, legendBadgeGood)}>
            <LegendClockIcon />
            14d
          </span>
          <span className={legendLabel}>Under plan</span>
        </div>
        <div className={legendRow}>
          <span className={cx(legendBadgeBase, legendBadgeBad)}>
            <LegendClockIcon />
            14d
          </span>
          <span className={legendLabel}>Above plan</span>
        </div>
      </div>
    </Tooltip>
  );
};

export const Overview = ({
  graph,
  productId,
  selectedStepId,
  onStepSelect,
}: OverviewProps) => {
  const { timeRange } = useTimeRange();
  const { currency, setAnalysisSettings, waccRate, storageCost } =
    useCostParams();
  const { excludeOutliers } = useOutlierSetting();
  const { basis: procurementBasis } = useProcurementBasis();
  const { products } = useRegistry();
  const productMaterial = useMemo(
    () =>
      products.find((product) => product.id === productId)?.material ?? null,
    [products, productId],
  );
  const productNameByMaterial = useMemo(
    () => new Map(products.map((product) => [product.material, product.name])),
    [products],
  );

  const [searchParams, setSearchParams] = useSearchParams();
  const requestedView = searchParams.get("view");
  const viewMode: ViewMode =
    requestedView === "canvas" || requestedView === "schedule"
      ? requestedView
      : "category";
  const [productionSchedule, setProductionSchedule] =
    useState<ProductionSchedule | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<SiteNode | null>(null);

  const pipelineExpanded = searchParams.get("pipeline") === "expanded";

  useEffect(() => {
    setAnalysisSettings(graph.analysis_settings);
  }, [graph.analysis_settings, setAnalysisSettings]);

  useEffect(() => {
    if (viewMode !== "schedule") {
      return;
    }
    let cancelled = false;
    setScheduleLoading(true);
    setScheduleError(null);
    fetchProductionSchedule(productId)
      .then((nextSchedule) => {
        if (!cancelled) {
          setProductionSchedule(nextSchedule);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          trackSupplyChainError({
            interaction: "production_schedule_fetch_failed",
            productId,
            source: "production_schedule",
          });
          setScheduleError(
            caught instanceof Error
              ? caught.message
              : "Production timeline is unavailable for this product.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setScheduleLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [productId, viewMode]);

  const setPipelineExpanded = useCallback(
    (expanded: boolean) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (expanded) {
            next.set("pipeline", "expanded");
          } else {
            next.delete("pipeline");
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Segment toggle: which of the four pipeline segments are currently
  // included in the waterfall totals, KPI tiles, and lever list.
  // Persisted as ?segments=<comma-separated ids> when the user differs
  // from the default; absent param == procurement off, remaining segments on.
  const activeSegments = useMemo<Set<SegmentId>>(() => {
    const raw = searchParams.get("segments");
    if (!raw) {
      return new Set(DEFAULT_ACTIVE_SEGMENTS);
    }
    const ids = raw
      .split(",")
      .filter((id): id is SegmentId =>
        (ALL_SEGMENTS as readonly string[]).includes(id),
      );
    return new Set(ids);
  }, [searchParams]);

  const setActiveSegments = useCallback(
    (next: Set<SegmentId>) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          // Canonical order keeps the URL stable regardless of toggle
          // order. Drop the param entirely when the default selection is restored.
          const ordered = ALL_SEGMENTS.filter((id) => next.has(id));
          if (sameSegments(DEFAULT_ACTIVE_SEGMENTS, next)) {
            params.delete("segments");
          } else {
            params.set("segments", ordered.join(","));
          }
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const handleSegmentToggle = useCallback(
    (id: SegmentId) => {
      const next = new Set(activeSegments);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      setActiveSegments(next);
    },
    [activeSegments, setActiveSegments],
  );

  // Pipeline route (e.g. shipping destination) is lifted here so the
  // selection survives collapse/expand of the simulator. Persisted as
  // ?route=<code> when set; omitted if no param is present and the
  // child renders a route picker for the first available route.
  const activeRouteParam = searchParams.get("route") ?? undefined;
  const setActiveRoute = useCallback(
    (code: string) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (!code) {
            params.delete("route");
          } else {
            params.set("route", code);
          }
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const handleStepClick = useCallback(
    (stepId: string) => {
      trackSupplyChainInteraction({
        interaction: "product_step_selected",
        productId,
        source:
          viewMode === "canvas"
            ? "product_graph"
            : viewMode === "schedule"
              ? "production_schedule"
              : "category_view",
        stepId,
      });
      onStepSelect(stepId);
    },
    [onStepSelect, productId, viewMode],
  );

  const handlePanelClose = useCallback(() => {
    trackSupplyChainInteraction({
      interaction: "step_detail_panel_closed",
      productId,
      source: "product_page",
      stepId: selectedStepId ?? "",
    });
    onStepSelect(null);
  }, [onStepSelect, productId, selectedStepId]);

  const filteredGraph = useMemo((): GraphData => {
    const filteredNodes = graph.nodes.map((count) =>
      filterGraphNodeByDateRange(
        count,
        timeRange,
        excludeOutliers,
        procurementBasis,
      ),
    );

    const bt = graph.batch_timelines;
    if (!bt || bt.batches.length === 0) {
      return {
        ...graph,
        nodes: filteredNodes,
      };
    }

    const cutoff = cutoffForRange(timeRange);
    const filteredBatches = cutoff
      ? bt.batches.filter((batch) => {
          const endDate = batch.delivery_date;
          return endDate != null && endDate.slice(0, 7) >= cutoff;
        })
      : bt.batches;
    const filteredBT = recomputeBatchTimelines(
      filteredBatches,
      bt,
      excludeOutliers,
    );
    return {
      ...graph,
      nodes: filteredNodes,
      batch_timelines: filteredBT.timelines,
      pipeline_summary: filteredBT.pipeline,
    };
  }, [graph, timeRange, excludeOutliers, procurementBasis]);

  const summaryStats = useMemo(() => {
    const bt = filteredGraph.batch_timelines;
    const totalSeg = bt?.segments?.total_days;
    const totalMean = totalSeg?.mean != null ? Math.round(totalSeg.mean) : null;
    const totalMedian =
      totalSeg?.median != null ? Math.round(totalSeg.median) : null;
    if (totalMean == null) {
      return { totalMean: null, totalMedian: null, dwellCost: null };
    }
    const nodes = filteredGraph.nodes;
    const dwellNodes = nodes.filter(
      (count) => DWELL_TYPES.includes(count.type) && count.stats.n > 0,
    );
    const dwellCost = periodTotalCost(dwellNodes, waccRate, storageCost);
    return {
      totalMean,
      totalMedian,
      dwellCost: dwellCost > 0 ? dwellCost : null,
    };
  }, [filteredGraph, waccRate, storageCost]);

  const productCurrency = useMemo(() => {
    const counts = new Map<string, number>();
    for (const node of graph.nodes) {
      const nodeCurrency = node.cost?.currency;
      if (nodeCurrency) {
        counts.set(nodeCurrency, (counts.get(nodeCurrency) ?? 0) + 1);
      }
    }
    let best: string | null = null;
    let bestN = 0;
    for (const [nodeCurrency, count] of counts) {
      if (count > bestN) {
        best = nodeCurrency;
        bestN = count;
      }
    }
    return best ?? currency;
  }, [graph.nodes, currency]);

  const selectedNode = useMemo((): SiteNode | null => {
    const node = selectedStepId
      ? graph.nodes.find((candidate) => candidate.id === selectedStepId)
      : undefined;
    return node
      ? {
          ...node,
          products: [{ id: productId, name: graph.product_name }],
        }
      : null;
  }, [graph.nodes, graph.product_name, productId, selectedStepId]);

  // Stable site code for the product: the plant where the finished good is
  // produced/QA'd. Transit and destination-dwell nodes carry lane/hub
  // identifiers in `plant`, so scoping the status hook / status keys / brief
  // links off the *selected* step's plant made the site scope jump around as
  // the selection changed (re-initialising the status hook and splitting status
  // history across scopes). The site code is smaller and less likely to change,
  // so derive it once from the graph and use it for the whole product page.
  //
  // `node.plant` is the raw (upper-case) plant code, whereas the site
  // overview scopes by the lower-cased route slug; `normaliseSiteCode` reconciles
  // the two so status set on the site overview lines up with the product page.
  const productSiteId = useMemo(() => {
    const homeNode =
      graph.nodes.find((node) => node.type === "production") ??
      graph.nodes.find((node) => node.type === "qa_hold") ??
      graph.nodes.find(
        (node) => node.type !== "transit" && node.type !== "destination_dwell",
      );
    return normaliseSiteCode(homeNode?.plant ?? graph.nodes[0]?.plant ?? "");
  }, [graph.nodes]);
  const opportunityStatusStore = useSupplyChainStatusState(productSiteId);
  const selectedStatusKey = selectedNode
    ? statusKey(productSiteId, selectedNode)
    : null;
  const selectedBriefHref = useMemo(() => {
    if (!selectedNode || !productSiteId) {
      return undefined;
    }
    const params = new URLSearchParams({ range: timeRange });
    for (const key of ["wacc", "storage"]) {
      const value = searchParams.get(key);
      if (value) {
        params.set(key, value);
      }
    }

    return `/supply-chain/site/${productSiteId}/opportunity/${
      isDwellType(selectedNode.type) ? "dwell" : "planning"
    }/${productId}/${selectedNode.id}?${params.toString()}`;
  }, [productId, searchParams, selectedNode, productSiteId, timeRange]);

  const statusTargetIsSelectedNode =
    selectedNode != null &&
    statusTarget != null &&
    statusTarget.id === selectedNode.id &&
    statusTarget.plant === selectedNode.plant;

  return (
    <div className={rootStyle}>
      {/* Header bar */}
      <div className={headerBar}>
        <div className={headerRow}>
          {/* Left: scope picker (doubles as title) + stats */}
          <div className={titleCol}>
            <MaterialTag material={productMaterial} side="right">
              <ScopeSelect productId={productId} />
            </MaterialTag>
            <div className={statsRow}>
              {summaryStats.totalMean != null && (
                <StatChip
                  value={`${formatNumber(summaryStats.totalMean, { maximumFractionDigits: 0 })}d`}
                  label="End-to-end mean"
                />
              )}
              {summaryStats.totalMedian != null && (
                <StatChip
                  value={`${formatNumber(summaryStats.totalMedian, { maximumFractionDigits: 0 })}d`}
                  label="End-to-end median"
                />
              )}
              {summaryStats.dwellCost != null && (
                <StatChip
                  value={formatCost(summaryStats.dwellCost, productCurrency, {
                    compact: true,
                  })}
                  label={`Dwell cost over ${timeRange}`}
                  isHighlight
                />
              )}
            </div>
          </div>

          {/* Right: primary view controls + lower-frequency settings/help. */}
          <div className={controlsCol}>
            <div className={controlsBottomRow}>
              <PlanningParamLegend />
              <SegmentedControl
                value={viewMode}
                onChange={(nextViewMode) => {
                  trackSupplyChainInteraction({
                    interaction: "product_view_mode_changed",
                    productId,
                    source: "product_page",
                  });
                  setSearchParams(
                    (previous) => {
                      const next = new URLSearchParams(previous);
                      if (nextViewMode === "category") {
                        next.delete("view");
                      } else {
                        next.set("view", nextViewMode);
                      }
                      return next;
                    },
                    { replace: true },
                  );
                }}
                options={[
                  { value: "category", label: "Category" },
                  { value: "canvas", label: "Canvas" },
                  { value: "schedule", label: "Timeline" },
                ]}
              />

              <HeaderActionButtons
                settingsOpen={settingsOpen}
                onSettingsToggle={() => {
                  trackSupplyChainInteraction({
                    interaction: settingsOpen
                      ? "settings_closed"
                      : "settings_opened",
                    productId,
                    source: "product_page",
                  });
                  setSettingsOpen((open) => !open);
                }}
                docContext="product"
              />
            </div>
          </div>
        </div>
        {settingsOpen && (
          <AnalysisSettingsPanel onClose={() => setSettingsOpen(false)} />
        )}
      </div>

      {/* Content */}
      <div
        className={cx(
          contentBase,
          viewMode === "category" ? overflowAuto : overflowHidden,
        )}
      >
        <div className={viewMode === "canvas" ? paneShow : hidden}>
          <ProcessGraph
            graph={filteredGraph}
            onStepClick={handleStepClick}
            timeRange={timeRange}
          />
        </div>
        <div className={viewMode === "category" ? undefined : hidden}>
          <CategoryView
            graph={filteredGraph}
            onStepClick={handleStepClick}
            timeRange={timeRange}
          />
        </div>
        <div className={viewMode === "schedule" ? paneShow : hidden}>
          {scheduleLoading ? (
            <LoadingState
              message="Loading production timeline…"
              className={scheduleLoadState}
            />
          ) : scheduleError ? (
            <div className={scheduleLoadState}>
              <ErrorState
                message={`Production timeline unavailable. ${scheduleError}`}
              />
            </div>
          ) : productionSchedule ? (
            <ProductionScheduleView
              schedule={productionSchedule}
              productNameByMaterial={productNameByMaterial}
            />
          ) : (
            <div className={scheduleLoadState}>
              Production timeline data is not available.
            </div>
          )}
        </div>
      </div>

      <div
        className={cx(
          pipelineWrap,
          viewMode === "schedule" && hidden,
          pipelineExpanded ? pipelineExpandedH : pipelineAutoH,
        )}
      >
        {(() => {
          if (
            !Object.values(filteredGraph.pipeline_summary).some(
              (product) => product.total_mean > 0,
            )
          ) {
            return (
              <div className={emptyPipelineRow}>
                <h3 className={emptyPipelineTitle}>End-to-End Pipeline</h3>
                <span className={emptyPipelineNote}>
                  — no dispatches for the product over the last {timeRange}.
                </span>
              </div>
            );
          }

          // Resolve active route: prefer the URL param when it points at a
          // route that exists for this product, otherwise fall back to
          // the first route so the picker has a sensible default.
          const routeKeys = Object.keys(filteredGraph.pipeline_summary);
          const resolvedRoute =
            activeRouteParam && routeKeys.includes(activeRouteParam)
              ? activeRouteParam
              : (routeKeys[0] ?? "");
          return pipelineExpanded ? (
            <E2EWhatIf
              graph={filteredGraph}
              timeRange={timeRange}
              onCollapse={() => setPipelineExpanded(false)}
              onStepDrill={onStepSelect}
              activeSegments={activeSegments}
              onSegmentToggle={handleSegmentToggle}
              activeRoute={resolvedRoute}
              onActiveRouteChange={setActiveRoute}
            />
          ) : (
            <div className={collapsedPad}>
              <div className={collapsedStack}>
                <PipelineHeader
                  summaries={filteredGraph.pipeline_summary}
                  coverage={filteredGraph.batch_timelines?.coverage}
                  coverageByRoute={
                    filteredGraph.batch_timelines?.coverage_by_route
                  }
                  rangeLabel={timeRangeLongLabel(timeRange).toLowerCase()}
                  activeRoute={resolvedRoute}
                  onActiveRouteChange={setActiveRoute}
                  onExpand={() => setPipelineExpanded(true)}
                />

                <PipelineWaterfall
                  summaries={filteredGraph.pipeline_summary}
                  activeSegments={activeSegments}
                  onSegmentToggle={handleSegmentToggle}
                  activeRoute={resolvedRoute}
                />
              </div>
            </div>
          );
        })()}
      </div>

      {selectedStepId && (
        <StepDetailPanel
          productId={productId}
          stepId={selectedStepId}
          onClose={handlePanelClose}
          productName={graph.product_name}
          stepMaterial={selectedNode?.material}
          briefHref={selectedBriefHref}
          statusEntries={
            selectedStatusKey
              ? (opportunityStatusStore.statusHistory[selectedStatusKey] ?? [])
              : []
          }
          onStatus={
            selectedNode
              ? () => {
                  trackSupplyChainInteraction({
                    interaction: "status_dialog_opened",
                    productId,
                    source: "product_page",
                    stepId: selectedNode.id,
                  });
                  setStatusTarget(selectedNode);
                }
              : undefined
          }
          statusDialog={
            statusTargetIsSelectedNode ? (
              <StatusDialog
                key={`${statusTarget.plant}-${statusTarget.id}`}
                title={statusTarget.label}
                inline
                onClose={() => setStatusTarget(null)}
                onSave={(entry) => {
                  opportunityStatusStore.actions.onSaveStatus(
                    statusTarget,
                    entry,
                  );
                  setStatusTarget(null);
                }}
              />
            ) : undefined
          }
        />
      )}
      {statusTarget && !statusTargetIsSelectedNode && (
        <StatusDialog
          key={`${statusTarget.plant}-${statusTarget.id}`}
          title={statusTarget.label}
          onClose={() => setStatusTarget(null)}
          onSave={(entry) => {
            opportunityStatusStore.actions.onSaveStatus(statusTarget, entry);
            setStatusTarget(null);
          }}
        />
      )}
    </div>
  );
};
