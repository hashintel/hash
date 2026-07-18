import { useCallback, useState, useMemo } from "react";

import { css, cx } from "@hashintel/ds-helpers/css";

import { isDwellType } from "../shared/categories";
import { formatCost } from "../shared/cost";
import { useSupplierPerformanceEnabled } from "../shared/feature-flags";
import {
  AnalysisSettingsPanel,
  HeaderActionButtons,
} from "../shared/header-actions";
import { ErrorState, SupplyChainAppSkeleton } from "../shared/load-state";
import { useLowSampleSetting } from "../shared/low-sample-context";
import { ScopeSelect } from "../shared/scope-select";
import { StatChip } from "../shared/stat-chip";
import { statusKey } from "../shared/status";
import { StatusDialog } from "../shared/status-dialog";
import { StepDetailPanel } from "../shared/step-detail-panel";
import { trackSupplyChainInteraction } from "../shared/telemetry";
import { type TimeRange, timeRangeLongLabel } from "../shared/time-range";
import { useTimeRange } from "../shared/time-range-context";
import { ToolbarCheckbox } from "../shared/toolbar-checkbox";
import { useSearchParams } from "../shared/use-search-params";
import { DwellTable } from "./site/dwell-table";
import {
  buildSiteOpportunities,
  type OpportunityStatusActions,
  type OpportunityKind,
} from "./site/opportunities";
import { OpportunitiesTable } from "./site/opportunities-table";
import { PlanningTable } from "./site/planning-table";
import { SiteMonthlyCarryCostChart } from "./site/site-monthly-carry-cost-chart";
import { SupplierTable } from "./site/supplier-table";
import { TabButton } from "./site/tab-button";
import { TrendTable } from "./site/trend-table";
import { useSiteOverviewRows } from "./site/use-site-overview-rows";
import { VendorDetailPanel } from "./site/vendor-detail-panel";

import type { BaseMeasure } from "../shared/measure-context";
import type { StatusActionLabel, StatusStore } from "../shared/status";
import type { Product, SiteNode, StepType } from "../shared/types";
import type {
  Tab,
  SortKey,
  SortDir,
  SupplierMode,
} from "./site/shared/row-types";

const errorPad = css({ px: "6", py: "4" });

// Fill the layout's main area (a flex column) and clamp our own height to it so
// the content pane can scroll internally instead of overflowing the viewport.
// `minH:0` is required for the inner `overflow:auto` pane to actually scroll.
const rootStyle = css({
  display: "flex",
  flexDirection: "column",
  flex: "1",
  minH: "0",
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
const controlsRow = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "2",
  flexShrink: 0,
});
const settingsCollapse = css({
  display: "grid",
  gridTemplateRows: "0fr",
  opacity: "0",
  transition: "[grid-template-rows 180ms ease, opacity 160ms ease]",
  overflow: "hidden",
});
const settingsCollapseOpen = css({ gridTemplateRows: "1fr", opacity: "1" });
const settingsCollapseInner = css({ minH: "0", overflow: "hidden" });

// The content area is the page scroller inside the viewport-bounded main
// (`flex:1; minH:0`). Each table caps its own height to ~the viewport (see
// `card` / `tableContainer`) so it scrolls internally once tall, while the page
// scrolls to move between the Opportunities section, the chart, and the tables.
const content = css({
  px: "6",
  pb: "4",
  flex: "1",
  minH: "0",
  overflowY: "auto",
  "& > * + *": { mt: "5" },
  "& > :first-child": { mt: "4" },
});
// The carry-cost chart keeps its natural height between the two tables.
const chartShrink = css({ flexShrink: "0" });
// Tab bar directly above the detail table; the table's sticky header parks
// beneath it once the table scrolls internally.
const tabBar = css({
  flexShrink: "0",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: "4",
  minH: "11",
  bg: "bgSolid.min",
  borderBottomWidth: "1px",
  borderColor: "bd.subtle",
  pb: "[1px]",
});
const tabButtons = css({ display: "flex", alignItems: "flex-end", gap: "3" });
// Groups the tab bar with its active table so they stack tightly.
const tableSection = css({ display: "flex", flexDirection: "column", pb: "6" });

interface SiteOverviewProps {
  products: Product[];
  /** Route site slug; keys the precomputed `site/{slug}/summary.json` artifact. */
  siteId: string;
  opportunityStatusHistory?: StatusStore;
  opportunityStatusActions?: OpportunityStatusActions;
}

const emptyOpportunityStatusHistory: StatusStore = {};
const noopOpportunityStatusActions: OpportunityStatusActions = {
  onMarkRead: () => {},
  onMarkUnread: () => {},
  onSaveStatus: () => {},
};

// ── Page-local helpers ──────────────────────────────────────────────────
function opportunityBriefHref(
  siteSlug: string,
  type: "dwell" | "planning",
  node: SiteNode,
  timeRange: TimeRange,
  currentSearchParams: URLSearchParams,
  kind?: OpportunityKind,
): string {
  const productId = node.products[0]?.id ?? "";
  const params = new URLSearchParams({ range: timeRange });
  if (kind) {
    params.set("op", kind);
  }
  for (const key of ["wacc", "storage"]) {
    const value = currentSearchParams.get(key);
    if (value) {
      params.set(key, value);
    }
  }
  return `/supply-chain/site/${siteSlug}/opportunity/${type}/${productId}/${
    node.id
  }?${params.toString()}`;
}

function statusTitleForNode(node: SiteNode, fallbackTitle: string): string {
  if (node.products.length !== 1) {
    return fallbackTitle;
  }
  const product = node.products[0];
  return product ? `${fallbackTitle} (${product.name})` : fallbackTitle;
}

export const SiteOverview = ({
  products,
  siteId,
  opportunityStatusHistory = emptyOpportunityStatusHistory,
  opportunityStatusActions = noopOpportunityStatusActions,
}: SiteOverviewProps) => {
  const { timeRange } = useTimeRange();
  const supplierPerformanceEnabled = useSupplierPerformanceEnabled();
  const siteSlug = siteId;
  const [tab, setTab] = useState<Tab>("dwell");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchParams] = useSearchParams();
  const { excludeLowSamples, setExcludeLowSamples } = useLowSampleSetting();
  const [selectedStep, setSelectedStep] = useState<{
    productId: string;
    stepId: string;
    node: SiteNode;
    title: string;
    siteContext: { products: Array<{ id: string; name: string }> };
    briefHref: string;
    measureOverride?: BaseMeasure;
  } | null>(null);
  const [statusTarget, setStatusTarget] = useState<{
    node: SiteNode;
    title: string;
  } | null>(null);

  const openStatus = useCallback(
    (node: SiteNode, title: string) => {
      trackSupplyChainInteraction({
        interaction: "status_dialog_opened",
        siteId,
        source: "site_overview",
        stepId: node.id,
      });
      setStatusTarget({ node, title: statusTitleForNode(node, title) });
    },
    [siteId],
  );
  const [dwellSort, setDwellSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "cost",
    dir: "desc",
  });
  const [planSort, setPlanSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "deviation",
    dir: "desc",
  });
  const [trendSort, setTrendSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "trend",
    dir: "desc",
  });
  const [supplierSort, setSupplierSort] = useState<{
    key: SortKey;
    dir: SortDir;
  }>({ key: "otif", dir: "asc" });
  const [supplierMode] = useState<SupplierMode>("worst");
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);

  // Detail-table column filters, stored per tab as the set of *hidden* values
  // (empty = everything shown). Persisted here so they survive tab switches.
  const [dwellTypeHidden, setDwellTypeHidden] = useState<Set<StepType>>(
    () => new Set(),
  );
  const [planningTypeHidden, setPlanningTypeHidden] = useState<Set<StepType>>(
    () => new Set(),
  );
  const [trendTypeHidden, setTrendTypeHidden] = useState<Set<StepType>>(
    () => new Set(),
  );
  const [dwellProductHidden, setDwellProductHidden] = useState<Set<string>>(
    () => new Set(),
  );
  const [planningProductHidden, setPlanningProductHidden] = useState<
    Set<string>
  >(() => new Set());
  const [planningSupplierHidden, setPlanningSupplierHidden] = useState<
    Set<string>
  >(() => new Set());
  const [planningBasisHidden, setPlanningBasisHidden] = useState<Set<string>>(
    () => new Set(),
  );
  const [trendProductHidden, setTrendProductHidden] = useState<Set<string>>(
    () => new Set(),
  );
  const [dwellStatusHidden, setDwellStatusHidden] = useState<
    Set<StatusActionLabel>
  >(() => new Set());
  const [planningStatusHidden, setPlanningStatusHidden] = useState<
    Set<StatusActionLabel>
  >(() => new Set());
  const [trendStatusHidden, setTrendStatusHidden] = useState<
    Set<StatusActionLabel>
  >(() => new Set());

  // Opportunities table sort. Defaults to impact (per-section score) descending,
  // which matches the order rows are built in, so the header reflects it.
  const [oppSort, setOppSort] = useState<{
    key: SortKey;
    dir: SortDir;
  } | null>({ key: "impact", dir: "desc" });
  const [oppTypeHidden, setOppTypeHidden] = useState<Set<OpportunityKind>>(
    () => new Set(),
  );
  const [oppProductHidden, setOppProductHidden] = useState<Set<string>>(
    () => new Set(),
  );
  const [oppStatusHidden, setOppStatusHidden] = useState<
    Set<StatusActionLabel>
  >(() => new Set());
  const [oppSectionRevealRequest, setOppSectionRevealRequest] = useState<{
    kind: OpportunityKind;
    requestId: number;
  } | null>(null);

  const {
    loading,
    error,
    summaryStats,
    siteCurrency,
    monthlyCarryCost,
    dwellRows,
    planningRows,
    supplierRows,
    trendRows,
  } = useSiteOverviewRows({
    siteSlug,
    products,
    excludeLowSamples,
    supplierMode,
    supplierPerformanceEnabled,
  });
  const buildBriefHref = useCallback(
    (type: "dwell" | "planning", node: SiteNode, kind?: OpportunityKind) =>
      opportunityBriefHref(siteSlug, type, node, timeRange, searchParams, kind),
    [searchParams, siteSlug, timeRange],
  );
  const opportunities = useMemo(
    () =>
      buildSiteOpportunities({
        siteId: siteSlug,
        dwellRows,
        planningRows,
        timeRange,
        currency: siteCurrency,
        briefHref: buildBriefHref,
      }),
    [
      siteSlug,
      dwellRows,
      planningRows,
      timeRange,
      siteCurrency,
      buildBriefHref,
    ],
  );

  const overPlanCount = useMemo(
    () =>
      opportunities.filter(
        (opportunity) => opportunity.kind === "planning_over",
      ).length,
    [opportunities],
  );

  const handleStepClick = useCallback(
    (node: SiteNode, opportunityKind?: OpportunityKind) => {
      const firstProduct = node.products[0];
      if (!firstProduct) {
        return;
      }
      trackSupplyChainInteraction({
        interaction: "site_step_selected",
        siteId,
        source: "site_overview",
        stepId: node.id,
      });
      setSelectedStep({
        productId: firstProduct.id,
        stepId: node.id,
        node,
        title: node.label,
        siteContext: { products: node.products },
        briefHref: buildBriefHref(
          isDwellType(node.type) ? "dwell" : "planning",
          node,
          opportunityKind,
        ),
        measureOverride:
          opportunityKind === "planning_over" ||
          opportunityKind === "planning_under"
            ? "p95"
            : undefined,
      });
    },
    [buildBriefHref, siteId],
  );

  const revealOverPlanOpportunities = useCallback(() => {
    setOppTypeHidden((hiddenKinds) => {
      if (!hiddenKinds.has("planning_over")) {
        return hiddenKinds;
      }
      const nextHiddenKinds = new Set(hiddenKinds);
      nextHiddenKinds.delete("planning_over");
      return nextHiddenKinds;
    });
    setOppSectionRevealRequest((previousRequest) => ({
      kind: "planning_over",
      requestId: (previousRequest?.requestId ?? 0) + 1,
    }));
  }, []);

  const handlePanelClose = useCallback(() => {
    trackSupplyChainInteraction({
      interaction: "step_detail_panel_closed",
      siteId,
      source: "site_overview",
      stepId: selectedStep?.stepId ?? "",
    });
    setSelectedStep(null);
  }, [selectedStep?.stepId, siteId]);

  const statusTargetIsSelectedStep =
    selectedStep != null &&
    statusTarget != null &&
    statusTarget.node.id === selectedStep.node.id &&
    statusTarget.node.products[0]?.id === selectedStep.productId;

  const selectedStepStatusTarget = statusTargetIsSelectedStep
    ? statusTarget
    : null;

  if (loading) {
    return <SupplyChainAppSkeleton />;
  }
  if (error) {
    return <ErrorState message={error} className={errorPad} />;
  }
  return (
    <div className={rootStyle}>
      {/* Header bar */}
      <div className={headerBar}>
        <div className={headerRow}>
          <div className={titleCol}>
            <ScopeSelect siteId={siteId} />
            <div className={statsRow}>
              {summaryStats.dwellCost != null && (
                <StatChip
                  value={formatCost(summaryStats.dwellCost, siteCurrency, {
                    compact: true,
                  })}
                  label={`Total dwell cost (${timeRange})`}
                  isHighlight
                />
              )}
              {overPlanCount > 0 && (
                <StatChip
                  value={String(overPlanCount)}
                  label="steps over plan"
                  isHighlight
                  onClick={revealOverPlanOpportunities}
                />
              )}
            </div>
          </div>
          <div className={controlsRow}>
            <HeaderActionButtons
              settingsOpen={settingsOpen}
              onSettingsToggle={() => {
                trackSupplyChainInteraction({
                  interaction: settingsOpen
                    ? "settings_closed"
                    : "settings_opened",
                  siteId,
                  source: "site_overview",
                });
                setSettingsOpen((open) => !open);
              }}
              docContext="site"
            />
          </div>
        </div>
        <div
          className={cx(settingsCollapse, settingsOpen && settingsCollapseOpen)}
          aria-hidden={!settingsOpen}
        >
          <div className={settingsCollapseInner}>
            <AnalysisSettingsPanel onClose={() => setSettingsOpen(false)}>
              <ToolbarCheckbox
                checked={excludeLowSamples}
                onChange={setExcludeLowSamples}
              >
                Exclude low samples
              </ToolbarCheckbox>
            </AnalysisSettingsPanel>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className={content}>
        <OpportunitiesTable
          opportunities={opportunities}
          siteId={siteSlug}
          statusHistory={opportunityStatusHistory}
          onRowClick={(opportunity) =>
            handleStepClick(opportunity.node, opportunity.kind)
          }
          onStatus={openStatus}
          sort={oppSort}
          onSort={setOppSort}
          typeHidden={oppTypeHidden}
          onTypeHiddenChange={setOppTypeHidden}
          productHidden={oppProductHidden}
          onProductHiddenChange={setOppProductHidden}
          statusHidden={oppStatusHidden}
          onStatusHiddenChange={setOppStatusHidden}
          revealSectionRequest={oppSectionRevealRequest}
        />

        <div className={chartShrink}>
          <SiteMonthlyCarryCostChart
            data={monthlyCarryCost}
            currency={siteCurrency}
          />
        </div>

        {/* Tab selector + active table — grouped so both stick together */}
        <div className={tableSection}>
          <div className={tabBar}>
            <div className={tabButtons}>
              <TabButton
                active={tab === "dwell"}
                onClick={() => {
                  trackSupplyChainInteraction({
                    interaction: "site_tab_changed",
                    siteId,
                    source: "site_overview",
                  });
                  setTab("dwell");
                }}
                label="Dwell Time / Cost"
                count={dwellRows.length}
              />

              <TabButton
                active={tab === "planning"}
                onClick={() => {
                  trackSupplyChainInteraction({
                    interaction: "site_tab_changed",
                    siteId,
                    source: "site_overview",
                  });
                  setTab("planning");
                }}
                label="Planning Parameters"
                count={planningRows.length}
              />

              <TabButton
                active={tab === "trends"}
                onClick={() => {
                  trackSupplyChainInteraction({
                    interaction: "site_tab_changed",
                    siteId,
                    source: "site_overview",
                  });
                  setTab("trends");
                }}
                label="Trend"
                count={trendRows.length}
              />

              {supplierPerformanceEnabled && (
                <TabButton
                  active={tab === "suppliers"}
                  onClick={() => {
                    trackSupplyChainInteraction({
                      interaction: "site_tab_changed",
                      siteId,
                      source: "site_overview",
                    });
                    setTab("suppliers");
                  }}
                  label="Supplier Performance"
                  count={supplierRows.length}
                />
              )}
            </div>
          </div>

          {/* Detail tables */}
          {tab === "dwell" && (
            <DwellTable
              rows={dwellRows}
              siteId={siteSlug}
              sort={dwellSort}
              onSort={setDwellSort}
              onRowClick={handleStepClick}
              statusHistory={opportunityStatusHistory}
              onStatus={openStatus}
              timeRange={timeRange}
              currency={siteCurrency}
              typeHidden={dwellTypeHidden}
              onTypeHiddenChange={setDwellTypeHidden}
              productHidden={dwellProductHidden}
              onProductHiddenChange={setDwellProductHidden}
              statusHidden={dwellStatusHidden}
              onStatusHiddenChange={setDwellStatusHidden}
            />
          )}
          {tab === "planning" && (
            <PlanningTable
              rows={planningRows}
              siteId={siteSlug}
              sort={planSort}
              onSort={setPlanSort}
              onRowClick={handleStepClick}
              statusHistory={opportunityStatusHistory}
              onStatus={openStatus}
              typeHidden={planningTypeHidden}
              onTypeHiddenChange={setPlanningTypeHidden}
              productHidden={planningProductHidden}
              onProductHiddenChange={setPlanningProductHidden}
              supplierHidden={planningSupplierHidden}
              onSupplierHiddenChange={setPlanningSupplierHidden}
              basisHidden={planningBasisHidden}
              onBasisHiddenChange={setPlanningBasisHidden}
              statusHidden={planningStatusHidden}
              onStatusHiddenChange={setPlanningStatusHidden}
            />
          )}
          {tab === "trends" && (
            <TrendTable
              rows={trendRows}
              siteId={siteSlug}
              sort={trendSort}
              onSort={setTrendSort}
              onRowClick={handleStepClick}
              statusHistory={opportunityStatusHistory}
              onStatus={openStatus}
              typeHidden={trendTypeHidden}
              onTypeHiddenChange={setTrendTypeHidden}
              productHidden={trendProductHidden}
              onProductHiddenChange={setTrendProductHidden}
              statusHidden={trendStatusHidden}
              onStatusHiddenChange={setTrendStatusHidden}
            />
          )}
          {supplierPerformanceEnabled && tab === "suppliers" && (
            <SupplierTable
              rows={supplierRows}
              sort={supplierSort}
              onSort={setSupplierSort}
              onRowClick={(value) =>
                value.vendor_id && setSelectedVendorId(value.vendor_id)
              }
            />
          )}
        </div>
      </div>

      {selectedStep && (
        <StepDetailPanel
          key={`${selectedStep.productId}-${selectedStep.stepId}`}
          productId={selectedStep.productId}
          stepId={selectedStep.stepId}
          onClose={handlePanelClose}
          siteContext={selectedStep.siteContext}
          stepMaterial={selectedStep.node.material}
          briefHref={selectedStep.briefHref}
          measureOverride={selectedStep.measureOverride}
          statusEntries={
            opportunityStatusHistory[statusKey(siteSlug, selectedStep.node)] ??
            []
          }
          onStatus={() => openStatus(selectedStep.node, selectedStep.title)}
          productName={
            selectedStep.siteContext.products.length === 1
              ? selectedStep.siteContext.products[0]?.name
              : undefined
          }
          statusDialog={
            selectedStepStatusTarget ? (
              <StatusDialog
                key={`${statusKey(siteSlug, selectedStepStatusTarget.node)}-${
                  selectedStepStatusTarget.title
                }`}
                title={selectedStepStatusTarget.title}
                inline
                onClose={() => setStatusTarget(null)}
                onSave={(entry) => {
                  opportunityStatusActions.onSaveStatus(
                    selectedStepStatusTarget.node,
                    entry,
                  );
                  setStatusTarget(null);
                }}
              />
            ) : undefined
          }
        />
      )}
      {supplierPerformanceEnabled && selectedVendorId && (
        <VendorDetailPanel
          key={selectedVendorId}
          vendorId={selectedVendorId}
          onClose={() => setSelectedVendorId(null)}
          dateRange={timeRange}
          windowLabel={timeRangeLongLabel(timeRange)}
        />
      )}
      {statusTarget && !statusTargetIsSelectedStep && (
        <StatusDialog
          key={`${statusKey(siteSlug, statusTarget.node)}-${
            statusTarget.title
          }`}
          title={statusTarget.title}
          onClose={() => setStatusTarget(null)}
          onSave={(entry) => {
            opportunityStatusActions.onSaveStatus(statusTarget.node, entry);
            setStatusTarget(null);
          }}
        />
      )}
    </div>
  );
};
