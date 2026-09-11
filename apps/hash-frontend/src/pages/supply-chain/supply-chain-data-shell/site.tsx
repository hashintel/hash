import { useCallback, useEffect, useState, useMemo } from "react";

import { Button } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { useUsers } from "../../../components/hooks/use-users";
import { isDwellType } from "../shared/categories";
import { formatCost, useCostParams, useOutlierSetting } from "../shared/cost";
import { downloadCsv } from "../shared/export-utils";
import { useSupplierPerformanceEnabled } from "../shared/feature-flags";
import {
  AnalysisSettingsPanel,
  HeaderActionButtons,
} from "../shared/header-actions";
import { ErrorState, SupplyChainAppSkeleton } from "../shared/load-state";
import { useLowSampleSetting } from "../shared/low-sample-context";
import { useBaseMeasure } from "../shared/measure-context";
import { useProcurementBasis } from "../shared/procurement-basis-context";
import { ScopeSelect } from "../shared/scope-select";
import { SupplyChainSearchInput } from "../shared/search-input";
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
import { StepFilterBar } from "./site/shared/step-filter-bar";
import {
  applyStepFilters,
  applyStepFiltersBy,
  applyVendorStepFilters,
  buildStepFilterContext,
  buildStepFilterOptions,
  type ActiveStepFilter,
} from "./site/shared/step-filters";
import { SiteMonthlyCarryCostChart } from "./site/site-monthly-carry-cost-chart";
import { buildSiteOverviewCsv } from "./site/site-overview-export";
import { createSiteSearchMatchers } from "./site/site-search";
import { resolveStatusRoute } from "./site/status-route";
import { SupplierTable } from "./site/supplier-table";
import { TabButton } from "./site/tab-button";
import { TrendTable } from "./site/trend-table";
import { useSiteOverviewRows } from "./site/use-site-overview-rows";
import { VendorDetailPanel } from "./site/vendor-detail-panel";

import type { BaseMeasure } from "../shared/measure-context";
import type { StatusStore } from "../shared/status";
import type { Product, SiteNode } from "../shared/types";
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
const headerControls = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: "2",
  flexShrink: 0,
});
const searchControls = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "3",
});
const settingsCollapse = css({
  display: "grid",
  transition: "[grid-template-rows 180ms ease, opacity 160ms ease]",
  overflow: "hidden",
});
const settingsCollapseClosed = css({ gridTemplateRows: "0fr", opacity: "0" });
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
// Tab cluster inside the active table's header band. It owns the band's top
// padding so the filter/sort controls centre against the row's full height;
// stretching keeps the tab buttons anchored to the row's bottom edge, and the
// -1px margin drops the active tab's 2px underline onto the 1px rule below the
// row, so the two read as one line.
const tabButtons = css({
  display: "flex",
  alignItems: "flex-end",
  alignSelf: "stretch",
  gap: "3",
  pt: "3",
  mb: "[-1px]",
});
// Groups the tab bar with its active table so they stack tightly.
const tableSection = css({ display: "flex", flexDirection: "column", pb: "6" });

interface SiteOverviewProps {
  products: Product[];
  /** Route site slug; keys the precomputed `site/{slug}/summary.json` artifact. */
  siteId: string;
  opportunityStatusHistory?: StatusStore;
  opportunityStatusActions?: OpportunityStatusActions;
  opportunityScopeKey?: string | null;
  focusedStatusUpdateUuid?: string | null;
  onStatusRouteClear: () => void;
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
  opportunityScopeKey,
  focusedStatusUpdateUuid,
  onStatusRouteClear,
}: SiteOverviewProps) => {
  const { timeRange } = useTimeRange();
  const { measure } = useBaseMeasure();
  const { currency, waccRate, storageCost } = useCostParams();
  const { excludeOutliers } = useOutlierSetting();
  const { basis: procurementBasis } = useProcurementBasis();
  const supplierPerformanceEnabled = useSupplierPerformanceEnabled();
  const { loading: usersLoading, users } = useUsers();
  const mentionShortnamesByEntityId = useMemo(
    () =>
      new Map(
        (users ?? []).flatMap((user) =>
          user.shortname
            ? [
                [
                  user.entity.metadata.recordId.entityId,
                  user.shortname,
                ] as const,
              ]
            : [],
        ),
      ),
    [users],
  );
  const siteSlug = siteId;
  const [tab, setTab] = useState<Tab>("dwell");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchInputValue, setSearchInputValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
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
    productId: string;
    title: string;
  } | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setSearchQuery(searchInputValue),
      200,
    );
    return () => window.clearTimeout(timeout);
  }, [searchInputValue]);

  const openStatus = useCallback(
    (node: SiteNode, title: string, explicitProductId?: string) => {
      const productId = explicitProductId ?? node.products[0]?.id;
      if (!productId) {
        return;
      }
      trackSupplyChainInteraction({
        interaction: "status_dialog_opened",
        siteId,
        source: "site_overview",
        stepId: node.id,
      });
      setStatusTarget({
        node,
        productId,
        title: statusTitleForNode(node, title),
      });
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

  // One filter set shared by the dwell/planning/trend tables, so switching
  // tabs never drops an active filter (see step-filters.ts for semantics).
  const [stepFilters, setStepFilters] = useState<ActiveStepFilter[]>([]);

  // Opportunities table sort. Defaults to impact (per-section score) descending,
  // which matches the order rows are built in, so the header reflects it.
  const [oppSort, setOppSort] = useState<{
    key: SortKey;
    dir: SortDir;
  } | null>({ key: "impact", dir: "desc" });
  const [oppSectionRevealRequest, setOppSectionRevealRequest] = useState<{
    kind: OpportunityKind;
    requestId: number;
  } | null>(null);

  const {
    loading,
    error,
    historicalNodes,
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
  const handleExport = useCallback(() => {
    const csv = buildSiteOverviewCsv({
      dwellRows,
      historicalNodes,
      mentionShortnamesByEntityId,
      planningRows,
      products,
      settings: {
        currency,
        excludeLowSamples,
        excludeOutliers,
        procurementBasis,
        storageCost,
        timeRange,
        waccRate,
      },
      siteId: siteSlug,
      statusHistory: opportunityStatusHistory,
    });
    downloadCsv(csv, `${siteSlug}_supply_chain_${timeRange}.csv`);
    trackSupplyChainInteraction({
      interaction: "csv_exported",
      siteId,
      source: "site_overview",
    });
  }, [
    dwellRows,
    currency,
    excludeLowSamples,
    excludeOutliers,
    historicalNodes,
    mentionShortnamesByEntityId,
    opportunityStatusHistory,
    planningRows,
    products,
    procurementBasis,
    siteId,
    siteSlug,
    storageCost,
    timeRange,
    waccRate,
  ]);
  const buildBriefHref = useCallback(
    (type: "dwell" | "planning", node: SiteNode, kind?: OpportunityKind) =>
      opportunityBriefHref(siteSlug, type, node, timeRange, searchParams, kind),
    [searchParams, siteSlug, timeRange],
  );
  const generatedOpportunities = useMemo(
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
  const searchMatchers = useMemo(
    () => createSiteSearchMatchers(searchQuery),
    [searchQuery],
  );
  // Options and joins for the shared filter bar draw on every table's rows, so
  // e.g. the supplier filter can match a dwell row through its material.
  const allStepRows = useMemo(
    () => [...dwellRows, ...planningRows, ...trendRows],
    [dwellRows, planningRows, trendRows],
  );
  const stepFilterOptions = useMemo(
    () => buildStepFilterOptions(allStepRows),
    [allStepRows],
  );
  const stepFilterContext = useMemo(
    () =>
      buildStepFilterContext({
        rows: allStepRows,
        measure,
        timeRange,
        waccRate,
        storageCost,
        siteId: siteSlug,
        statusHistory: opportunityStatusHistory,
      }),
    [
      allStepRows,
      measure,
      timeRange,
      waccRate,
      storageCost,
      siteSlug,
      opportunityStatusHistory,
    ],
  );
  const dwellApplication = useMemo(
    () =>
      applyStepFilters(
        dwellRows.filter(searchMatchers.siteNode),
        stepFilters,
        stepFilterContext,
      ),
    [dwellRows, searchMatchers, stepFilters, stepFilterContext],
  );
  const planningApplication = useMemo(
    () =>
      applyStepFilters(
        planningRows.filter(searchMatchers.siteNode),
        stepFilters,
        stepFilterContext,
      ),
    [planningRows, searchMatchers, stepFilters, stepFilterContext],
  );
  const trendApplication = useMemo(
    () =>
      applyStepFilters(
        trendRows.filter(searchMatchers.siteNode),
        stepFilters,
        stepFilterContext,
      ),
    [trendRows, searchMatchers, stepFilters, stepFilterContext],
  );
  const supplierApplication = useMemo(
    () =>
      applyVendorStepFilters(
        supplierRows.filter(searchMatchers.supplier),
        stepFilters,
        stepFilterContext,
      ),
    [supplierRows, searchMatchers, stepFilters, stepFilterContext],
  );
  const opportunityApplication = useMemo(
    () =>
      applyStepFiltersBy(
        generatedOpportunities.filter(searchMatchers.opportunity),
        (opportunity) => opportunity.node,
        stepFilters,
        stepFilterContext,
      ),
    [generatedOpportunities, searchMatchers, stepFilters, stepFilterContext],
  );
  const filteredDwellRows = dwellApplication.rows;
  const filteredPlanningRows = planningApplication.rows;
  const filteredTrendRows = trendApplication.rows;
  const filteredSupplierRows = supplierApplication.rows;
  const opportunities = opportunityApplication.rows;
  const opportunitySkippedKeys = useMemo(
    () => new Set(opportunityApplication.skippedKeys),
    [opportunityApplication],
  );
  const activeTabSkippedKeys = useMemo(() => {
    const application =
      tab === "dwell"
        ? dwellApplication
        : tab === "planning"
          ? planningApplication
          : tab === "trends"
            ? trendApplication
            : supplierApplication;
    return new Set(application.skippedKeys);
  }, [
    tab,
    dwellApplication,
    planningApplication,
    trendApplication,
    supplierApplication,
  ]);
  // One bar instance handed to whichever tabbed table is active; it shares the
  // filter state with the opportunities table's bar above.
  const activeTabFilterBar = (
    <StepFilterBar
      filters={stepFilters}
      onFiltersChange={setStepFilters}
      options={stepFilterOptions}
      skippedKeys={activeTabSkippedKeys}
    />
  );
  const changeTab = (nextTab: Tab) => {
    trackSupplyChainInteraction({
      interaction: "site_tab_changed",
      siteId,
      source: "site_overview",
    });
    setTab(nextTab);
  };
  // Tab cluster handed to the active table's header band, so switching tables
  // keeps the tabs inline with the filter and sort controls.
  const siteTabs = (
    <div className={tabButtons}>
      <TabButton
        active={tab === "dwell"}
        onClick={() => changeTab("dwell")}
        label="Dwell Time / Cost"
        count={filteredDwellRows.length}
      />
      <TabButton
        active={tab === "planning"}
        onClick={() => changeTab("planning")}
        label="Planning Parameters"
        count={filteredPlanningRows.length}
      />
      <TabButton
        active={tab === "trends"}
        onClick={() => changeTab("trends")}
        label="Trend"
        count={filteredTrendRows.length}
      />
      {supplierPerformanceEnabled && (
        <TabButton
          active={tab === "suppliers"}
          onClick={() => changeTab("suppliers")}
          label="Supplier Performance"
          count={filteredSupplierRows.length}
        />
      )}
    </div>
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
      if (opportunityScopeKey || focusedStatusUpdateUuid) {
        onStatusRouteClear();
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
    [
      buildBriefHref,
      focusedStatusUpdateUuid,
      onStatusRouteClear,
      opportunityScopeKey,
      siteId,
    ],
  );

  useEffect(() => {
    if (!opportunityScopeKey && !focusedStatusUpdateUuid) {
      return;
    }
    if (!opportunityScopeKey || !focusedStatusUpdateUuid) {
      setSelectedStep(null);
      onStatusRouteClear();
      return;
    }
    if (loading) {
      return;
    }

    const resolvedRoute = resolveStatusRoute(
      siteSlug,
      opportunityScopeKey,
      historicalNodes,
    );
    if (!resolvedRoute) {
      setSelectedStep(null);
      onStatusRouteClear();
      return;
    }

    const { node, productId } = resolvedRoute;
    setSelectedStep((currentSelection) => {
      if (
        currentSelection?.node === node &&
        currentSelection.productId === productId
      ) {
        return currentSelection;
      }

      return {
        productId,
        stepId: node.id,
        node,
        title: node.label,
        siteContext: { products: node.products },
        briefHref: buildBriefHref(
          isDwellType(node.type) ? "dwell" : "planning",
          node,
        ),
      };
    });
  }, [
    buildBriefHref,
    focusedStatusUpdateUuid,
    historicalNodes,
    loading,
    onStatusRouteClear,
    opportunityScopeKey,
    siteSlug,
  ]);

  const revealOverPlanOpportunities = useCallback(() => {
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
    if (opportunityScopeKey || focusedStatusUpdateUuid) {
      onStatusRouteClear();
    }
  }, [
    focusedStatusUpdateUuid,
    onStatusRouteClear,
    opportunityScopeKey,
    selectedStep?.stepId,
    siteId,
  ]);

  const statusTargetIsSelectedStep =
    selectedStep != null &&
    statusTarget != null &&
    statusTarget.node.id === selectedStep.node.id &&
    statusTarget.productId === selectedStep.productId;

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
          <div className={headerControls}>
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
            <div className={searchControls}>
              <Button
                disabled={usersLoading}
                onClick={handleExport}
                size="sm"
                variant="subtle"
              >
                <span className={css({ textStyle: "xs", color: "fg.subtle" })}>
                  Export
                </span>
              </Button>
              <SupplyChainSearchInput
                ariaLabel="Search site overview tables"
                onChange={setSearchInputValue}
                size="sm"
                value={searchInputValue}
              />
            </div>
          </div>
        </div>
        <div
          className={cx(
            settingsCollapse,
            settingsOpen ? settingsCollapseOpen : settingsCollapseClosed,
          )}
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
          filterBar={
            <StepFilterBar
              filters={stepFilters}
              onFiltersChange={setStepFilters}
              options={stepFilterOptions}
              skippedKeys={opportunitySkippedKeys}
            />
          }
          filtersActive={stepFilters.length > 0}
          revealSectionRequest={oppSectionRevealRequest}
        />

        <div className={chartShrink}>
          <SiteMonthlyCarryCostChart
            data={monthlyCarryCost}
            currency={siteCurrency}
          />
        </div>

        {/* Active detail table; the tab cluster lives inside its header band */}
        <div className={tableSection}>
          {/* Detail tables, each hosting the tabs + shared filter bar in their header band */}
          {tab === "dwell" && (
            <DwellTable
              rows={filteredDwellRows}
              siteId={siteSlug}
              sort={dwellSort}
              onSort={setDwellSort}
              onRowClick={handleStepClick}
              statusHistory={opportunityStatusHistory}
              onStatus={openStatus}
              timeRange={timeRange}
              currency={siteCurrency}
              filterBar={activeTabFilterBar}
              headerTabs={siteTabs}
              filtersActive={stepFilters.length > 0}
            />
          )}
          {tab === "planning" && (
            <PlanningTable
              rows={filteredPlanningRows}
              siteId={siteSlug}
              sort={planSort}
              onSort={setPlanSort}
              onRowClick={handleStepClick}
              statusHistory={opportunityStatusHistory}
              onStatus={openStatus}
              filterBar={activeTabFilterBar}
              headerTabs={siteTabs}
              filtersActive={stepFilters.length > 0}
            />
          )}
          {tab === "trends" && (
            <TrendTable
              rows={filteredTrendRows}
              siteId={siteSlug}
              sort={trendSort}
              onSort={setTrendSort}
              onRowClick={handleStepClick}
              statusHistory={opportunityStatusHistory}
              onStatus={openStatus}
              filterBar={activeTabFilterBar}
              headerTabs={siteTabs}
              filtersActive={stepFilters.length > 0}
            />
          )}
          {supplierPerformanceEnabled && tab === "suppliers" && (
            <SupplierTable
              rows={filteredSupplierRows}
              sort={supplierSort}
              onSort={setSupplierSort}
              onRowClick={(value) =>
                value.vendor_id && setSelectedVendorId(value.vendor_id)
              }
              filterBar={activeTabFilterBar}
              headerTabs={siteTabs}
              filtersActive={stepFilters.length > 0}
            />
          )}
        </div>
      </div>

      {selectedStep && (
        <StepDetailPanel
          key={`${selectedStep.productId}-${selectedStep.stepId}`}
          productId={selectedStep.productId}
          stepId={selectedStep.stepId}
          focusedStatusUpdateUuid={focusedStatusUpdateUuid}
          onClose={handlePanelClose}
          siteContext={selectedStep.siteContext}
          stepMaterial={selectedStep.node.material}
          briefHref={selectedStep.briefHref}
          measureOverride={selectedStep.measureOverride}
          statusEntries={
            opportunityStatusHistory[statusKey(siteSlug, selectedStep.node)] ??
            []
          }
          onStatus={() =>
            openStatus(
              selectedStep.node,
              selectedStep.title,
              selectedStep.productId,
            )
          }
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
                entries={
                  opportunityStatusHistory[
                    statusKey(siteSlug, selectedStepStatusTarget.node)
                  ] ?? []
                }
                inline
                onClose={() => setStatusTarget(null)}
                onSave={(entry) => {
                  opportunityStatusActions.onSaveStatus(
                    selectedStepStatusTarget.node,
                    entry,
                    selectedStepStatusTarget.productId,
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
          entries={
            opportunityStatusHistory[statusKey(siteSlug, statusTarget.node)] ??
            []
          }
          onClose={() => setStatusTarget(null)}
          onSave={(entry) => {
            opportunityStatusActions.onSaveStatus(
              statusTarget.node,
              entry,
              statusTarget.productId,
            );
            setStatusTarget(null);
          }}
        />
      )}
    </div>
  );
};
