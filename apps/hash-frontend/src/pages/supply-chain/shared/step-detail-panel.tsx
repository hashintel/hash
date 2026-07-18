import {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
  type ReactNode,
} from "react";

import { Button, Icon } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { Link } from "../../../shared/ui/link";
import {
  BriefLink,
  DocsIconButton,
  StatusActionButton,
} from "./action-buttons";
import { isDwellType, isProductionType } from "./categories";
import { useOutlierSetting } from "./cost";
import { fetchStepDetail } from "./data";
import { detailDateKeyFromColumns } from "./detail-date-key";
import { stepDocTarget } from "./docs/docs-modal/docs-content";
import { useDocs } from "./docs/use-docs";
import { useSupplierPerformanceEnabled } from "./feature-flags";
import { LoadingState, ErrorState } from "./load-state";
import { MaterialTag } from "./material-tag";
import { applyOutlierSelectionToStep } from "./outlier-selection";
import { computePeriodDeltas } from "./period-trends";
import { useProcurementBasis } from "./procurement-basis-context";
import {
  planningWarningTexts,
  procurementStepDisplayLabel,
} from "./procurement-planning-ui";
import {
  dwellStepScopesOpenCarryOnProduct,
  scopeDwellStepToProduct,
} from "./product-dwell-scope";
import {
  filterStepByDateRange,
  applyProcurementBasisToStep,
} from "./range-filter";
import { useRegistry } from "./registry-context";
import { SlideOver, SlideOverClose } from "./slide-over";
import { deriveStatusActionState, type StatusEntry } from "./status";
import { ConsumptionMetricsRow } from "./step-detail-panel/consumption-metrics";
import {
  DataTableSection,
  type DataTableFilters,
  type DataTableSectionHandle,
} from "./step-detail-panel/data-table-section";
import {
  DistributionChart,
  type Dimension,
} from "./step-detail-panel/distribution-chart";
import { MonthlyCostChart } from "./step-detail-panel/monthly-cost-chart";
import { SavingsCalculator } from "./step-detail-panel/savings-calculator";
import {
  StatsRow,
  ObservationCount,
} from "./step-detail-panel/step-detail-primitives";
import { TimeSeriesChart } from "./step-detail-panel/time-series-chart";
import {
  InventoryPolicyRow,
  KeyMetricsRow,
} from "./step-detail-panel/timing-metrics";
import { YieldMetricsRow } from "./step-detail-panel/yield-metrics";
import { SupplierDimensionView } from "./supplier-dimension-view";
import { recomputeSupplierBlock } from "./supplier-otif";
import { TIME_RANGE_OPTIONS, timeRangeLongLabel } from "./time-range";
import { useTimeRange } from "./time-range-context";

import type { BaseMeasure } from "./measure-context";
import type {
  StepDetail as StepDetailType,
  StepStats,
  Observation,
  DetailRows,
} from "./types";

const sectionBorder = css({
  borderBottomWidth: "1px",
  borderBottomStyle: "solid",
  borderBottomColor: "bd.subtle",
});
const headerStyles = css({ p: "6" });
const headerRow = css({
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
});
const headerMain = css({ flex: "1", minWidth: "0" });
// Bottom spacing only — the back control itself is now a ds `Button` (linkSubtle).
const backLink = css({ mb: "2" });
const usedByRow = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  flexWrap: "wrap",
  mb: "2",
  textStyle: "xs",
});
const productLink = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.5",
  fontWeight: "medium",
  color: "fg.heading",
  textDecoration: "underline",
  textUnderlineOffset: "[2px]",
  _hover: { color: "fg.muted" },
});
const titleRow = css({
  display: "flex",
  alignItems: "center",
  gap: "3",
  flexWrap: "wrap",
  mt: "2",
});
const titleStyles = css({
  fontFamily: "display",
  textStyle: "2xl",
  fontWeight: "medium",
  color: "fg.heading",
  lineHeight: "[30px]",
});
const titleActions = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "2",
  flexShrink: "0",
});
const metaRow = css({
  display: "flex",
  flexWrap: "nowrap",
  alignItems: "center",
  columnGap: "4",
  mt: "4",
  textStyle: "sm",
});
const metaItem = css({
  display: "inline-flex",
  flexShrink: "0",
  alignItems: "center",
  gap: "4",
  whiteSpace: "nowrap",
});
const metaDivider = css({ width: "[1px]", height: "3", bg: "bd.subtle" });
const procurementMetaStack = css({
  display: "inline-grid",
  gridTemplateColumns: "[auto auto]",
  columnGap: "2",
  rowGap: "0.5",
  alignItems: "baseline",
});
const metaLabel = css({ color: "fg.subtle" });
const lastUpdatedStack = css({
  display: "inline-flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "0.5",
});
const strongText = css({ fontWeight: "medium", color: "fg.max" });
const headerActions = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  ml: "4",
  flexShrink: "0",
});
const docsAction = css({ ml: "2" });
const statusSection = css({
  borderTopWidth: "1px",
  borderTopStyle: "solid",
  borderTopColor: "bd.subtle",
  p: "6",
  display: "flex",
  flexDirection: "column",
  gap: "3",
});
const statusSectionTitle = css({
  textStyle: "base",
  fontWeight: "semibold",
  color: "fg.heading",
});
const statusEmpty = css({ textStyle: "sm", color: "fg.subtle" });
const statusList = css({ display: "flex", flexDirection: "column", gap: "3" });
const statusItem = css({
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  borderRadius: "md",
  p: "3",
  display: "flex",
  flexDirection: "column",
  gap: "1",
});
const statusMeta = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "2",
  textStyle: "xs",
  color: "fg.subtle",
});
const statusCategory = css({ fontWeight: "semibold", color: "fg.heading" });
const statusBody = css({
  textStyle: "sm",
  color: "fg.heading",
  lineHeight: "relaxed",
  whiteSpace: "pre-wrap",
});
const statusDot = css({ color: "bd.subtle" });
const metricsSection = css({
  borderBottomWidth: "1px",
  borderBottomStyle: "solid",
  borderBottomColor: "bd.subtle",
  p: "6",
  display: "flex",
  flexDirection: "column",
  gap: "3",
});
const planningWarnings = css({
  display: "flex",
  flexDirection: "column",
  gap: "1.5",
  mb: "2",
});
const planningWarning = css({
  display: "flex",
  alignItems: "flex-start",
  gap: "2",
  textStyle: "xs",
  lineHeight: "relaxed",
  color: "status.warning.fg.body",
});
const planningWarningIcon = css({ mt: "0.5", flexShrink: "0" });
const chartsRow = css({ display: "flex" });
const chartCellLeft = css({
  flex: "1",
  borderRightWidth: "1px",
  borderRightStyle: "solid",
  borderRightColor: "bd.subtle",
});
const chartCell = css({ flex: "1" });

const segGroup = css({
  display: "flex",
  alignItems: "center",
  borderRadius: "md",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  bg: "bg.surface",
  p: "0.5",
  gap: "0.5",
});
const segButton = css({
  px: "3",
  py: "1",
  textStyle: "xs",
  fontWeight: "medium",
  borderRadius: "[5px]",
  transition: "colors",
  whiteSpace: "nowrap",
  cursor: "pointer",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "[transparent]",
});
const segButtonActive = css({
  bg: "bgSolid.min",
  borderColor: "bd.subtle",
  color: "fg.heading",
  boxShadow: "sm",
});
const segButtonInactive = css({
  color: "fg.subtle",
  _hover: { color: "fg.muted" },
});

function filenameToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getDetailDateKey(
  step: StepDetailType,
  rows: DetailRows,
  dimension: Dimension,
): string | null {
  return detailDateKeyFromColumns(
    rows,
    dimension === "timing" ? step.ref_date_col : null,
  );
}

function detailRowsFromObservations(
  observations: Observation[],
): DetailRows | null {
  if (observations.length === 0) {
    return null;
  }
  return {
    columns: [
      {
        key: "date",
        source_field: "date",
        source_table: null,
        label: "Date",
      },
      {
        key: "value",
        source_field: "value",
        source_table: null,
        label: "Observed days",
        unit: "d",
      },
    ],
    rows: observations.map((observation) => ({
      date: observation.date,
      value: observation.value,
    })),
  };
}

export interface SiteContext {
  products: Array<{ id: string; name: string }>;
}

interface StepDetailPanelProps {
  productId: string;
  stepId: string;
  onClose: () => void;
  siteContext?: SiteContext;
  /**
   * Finished-good / product name used to disambiguate product-scoped steps in
   * the extractable data-table title (e.g. "Post-QA dwell: <FG name>"). Omit
   * for steps that aren't scoped to a single product (e.g. a raw material
   * shared across multiple finished goods) so the title isn't misleading.
   */
  productName?: string;
  /**
   * Material number for the step/node this panel describes (e.g. the
   * procured raw material, intermediate, or finished good).
   * `StepDetail` doesn't carry the material, so callers pass the graph node's
   * `material`. Omit when the step isn't tied to a single material.
   */
  stepMaterial?: string | null;
  briefHref?: string;
  /** Overrides the global headline measure for context-specific entry points. */
  measureOverride?: BaseMeasure;
  /** All status updates left against this step/node (any order; rendered newest-first). */
  statusEntries?: StatusEntry[];
  /** Opens the shared status dialog for this step. */
  onStatus?: () => void;
  /** Inline modal content opened from inside the slide-over. */
  statusDialog?: ReactNode;
}

function formatStatusDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusEntryText(entry: StatusEntry): string {
  const text = entry.text.trim();
  if (text) {
    return text;
  }
  return entry.category === "Investigation started" ? "(no comment)" : "";
}
export const StepDetailPanel = ({
  productId,
  stepId,
  onClose,
  siteContext,
  productName,
  stepMaterial,
  briefHref,
  measureOverride,
  statusEntries = [],
  onStatus,
  statusDialog,
}: StepDetailPanelProps) => {
  const { timeRange, setTimeRange } = useTimeRange();
  const [step, setStep] = useState<StepDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dimension, setDimension] = useState<Dimension>("timing");
  const [selectedComponent, setSelectedComponent] = useState<string | null>(
    null,
  );
  const dataTableRef = useRef<DataTableSectionHandle>(null);
  const { excludeOutliers } = useOutlierSetting();
  const { basis: procurementBasis } = useProcurementBasis();
  const { products } = useRegistry();
  const supplierPerformanceEnabled = useSupplierPerformanceEnabled();
  const { openDocs } = useDocs();
  const selectedProduct = useMemo(
    () => products.find((product) => product.id === productId) ?? null,
    [products, productId],
  );

  const isSiteContext = siteContext != null;

  const materialByProductId = useMemo(() => {
    const lookup = new Map<string, string>();
    for (const product of products) {
      if (product.material) {
        lookup.set(product.id, product.material);
      }
    }
    return lookup;
  }, [products]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchStepDetail(productId, stepId)
      .then((nextStep) => {
        // Rebuild carry from the detail rows. Realized rows always count; open
        // carry is scoped in when it's attributable here -- the site overview
        // always shows it (matching the node's exit-typed split), and on a
        // product view only for FG-specific steps (post-QA / destination).
        // Timing (dwell durations) stays realized-only either way: open rows
        // carry no completed duration.
        const includeOpenCarry =
          isSiteContext || dwellStepScopesOpenCarryOnProduct(nextStep.type);
        setStep(
          scopeDwellStepToProduct(
            nextStep,
            {
              productMaterial: selectedProduct?.material,
              productName,
            },
            { scopeToProduct: Boolean(productName), includeOpenCarry },
          ),
        );
      })
      .catch((event) => setError(event.message))
      .finally(() => setLoading(false));
  }, [
    productId,
    productName,
    selectedProduct?.material,
    stepId,
    isSiteContext,
  ]);
  const filteredStep = useMemo(() => {
    if (!step) {
      return null;
    }
    return filterStepByDateRange(
      step,
      timeRange,
      excludeOutliers,
      procurementBasis,
    );
  }, [step, timeRange, excludeOutliers, procurementBasis]);
  const basisStep = useMemo(() => {
    if (!step) {
      return null;
    }
    return applyProcurementBasisToStep(step, procurementBasis);
  }, [step, procurementBasis]);
  // Basis-selected and outlier-selected, but unwindowed, so previous-period
  // deltas track the same series as the displayed current stats.
  const comparisonStep = useMemo(() => {
    if (!basisStep) {
      return null;
    }
    return applyOutlierSelectionToStep(basisStep, excludeOutliers);
  }, [basisStep, excludeOutliers]);
  const windowedSupplierBlock = useMemo(() => {
    if (!step?.supplier_otif) {
      return null;
    }
    return recomputeSupplierBlock(step.supplier_otif, timeRange);
  }, [step, timeRange]);
  const dimensionObservations = useMemo(() => {
    if (!filteredStep) {
      return null;
    }
    if (dimension === "yield" && filteredStep.yield_data) {
      return filteredStep.yield_data.observations;
    }
    if (dimension === "consumption" && filteredStep.consumption_data) {
      if (selectedComponent) {
        const comp = filteredStep.consumption_data.components.find(
          (component) => component.material === selectedComponent,
        );
        return comp?.observations ?? null;
      }
      return filteredStep.consumption_data.aggregate.observations;
    }
    return filteredStep.observations;
  }, [filteredStep, dimension, selectedComponent]);
  const lastObsDate = useMemo(() => {
    if (!dimensionObservations?.length) {
      return null;
    }
    const now = new Date();
    const pastObs = dimensionObservations.filter(
      (observation) => new Date(observation.date) <= now,
    );
    if (!pastObs.length) {
      return null;
    }
    const sorted = [...pastObs].sort((left, right) =>
      right.date.localeCompare(left.date),
    );
    const latest = sorted[0];
    if (!latest) {
      return null;
    }
    const day = new Date(latest.date);
    const diffDays = Math.floor(
      (now.getTime() - day.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (diffDays === 0) {
      return "today";
    }
    if (diffDays === 1) {
      return "1 day ago";
    }
    return `${diffDays} days ago`;
  }, [dimensionObservations]);
  const availableDimensions = useMemo(() => {
    if (!step) {
      return ["timing"] as Dimension[];
    }
    const dims: Dimension[] = ["timing"];
    if (
      isProductionType(step.type) &&
      step.yield_data &&
      step.yield_data.stats.n > 0
    ) {
      dims.push("yield");
    }
    if (
      isProductionType(step.type) &&
      step.consumption_data &&
      step.consumption_data.aggregate.stats.n > 0
    ) {
      dims.push("consumption");
    }
    if (
      supplierPerformanceEnabled &&
      step.type === "procurement" &&
      step.supplier_otif &&
      step.supplier_otif.vendors.length > 0
    ) {
      dims.push("supplier");
    }
    return dims;
  }, [step, supplierPerformanceEnabled]);
  const dimensionStats = useMemo((): StepStats | null => {
    if (!filteredStep) {
      return null;
    }
    if (dimension === "yield" && filteredStep.yield_data) {
      return filteredStep.yield_data.stats;
    }
    if (dimension === "consumption" && filteredStep.consumption_data) {
      if (selectedComponent) {
        const comp = filteredStep.consumption_data.components.find(
          (component) => component.material === selectedComponent,
        );
        return comp?.stats ?? null;
      }
      return filteredStep.consumption_data.aggregate.stats;
    }
    return filteredStep.stats;
  }, [filteredStep, dimension, selectedComponent]);
  const comparisonObservations = useMemo((): Observation[] => {
    if (!comparisonStep) {
      return [];
    }
    if (dimension === "yield" && comparisonStep.yield_data) {
      return comparisonStep.yield_data.observations;
    }
    if (dimension === "consumption" && comparisonStep.consumption_data) {
      if (selectedComponent) {
        const comp = comparisonStep.consumption_data.components.find(
          (component) => component.material === selectedComponent,
        );
        return comp?.observations ?? [];
      }
      return comparisonStep.consumption_data.aggregate.observations;
    }
    return comparisonStep.observations;
  }, [comparisonStep, dimension, selectedComponent]);
  const periodComparison = useMemo(() => {
    return computePeriodDeltas(comparisonObservations, timeRange);
  }, [comparisonObservations, timeRange]);
  const selectedComponentReconciliationCount = useMemo(() => {
    if (
      dimension !== "consumption" ||
      !selectedComponent ||
      !filteredStep?.consumption_data
    ) {
      return null;
    }
    const comp = filteredStep.consumption_data.components.find(
      (component) => component.material === selectedComponent,
    );
    return comp?.n_reconciliation_events ?? null;
  }, [dimension, filteredStep, selectedComponent]);
  const activeDetailData = useMemo((): {
    detailRows: DetailRows;
    dateKey: string | null;
  } | null => {
    if (!step) {
      return null;
    }
    let dr: DetailRows | null | undefined = null;
    if (dimension === "yield" && step.yield_data?.detail_rows) {
      dr = step.yield_data.detail_rows;
    } else if (dimension === "consumption" && step.consumption_data) {
      if (selectedComponent) {
        const comp = step.consumption_data.components.find(
          (component) => component.material === selectedComponent,
        );
        dr = comp?.detail_rows ?? null;
      } else {
        dr = step.consumption_data.aggregate.detail_rows ?? null;
      }
    } else {
      dr = step.detail_rows ?? null;
    }
    if (!dr && dimension === "timing") {
      dr = detailRowsFromObservations((basisStep ?? step).observations);
    }
    if (!dr) {
      return null;
    }
    return { detailRows: dr, dateKey: getDetailDateKey(step, dr, dimension) };
  }, [step, basisStep, dimension, selectedComponent]);
  const dataTableTitle = useMemo(() => {
    if (!step?.label) {
      return undefined;
    }
    const label =
      step.type === "procurement"
        ? procurementStepDisplayLabel(step.label, "qualified")
        : step.label;
    return productName ? `${label}: ${productName}` : label;
  }, [step, productName]);
  const defaultTableFilters = useMemo(
    (): DataTableFilters => ({ periodRange: timeRange }),
    [timeRange],
  );
  const handleChartMonthClick = useCallback(
    (month: string) => {
      dataTableRef.current?.openWithFilters({ ...defaultTableFilters, month });
    },
    [defaultTableFilters],
  );
  const activeDetailTableMeta = useMemo(() => {
    if (!filteredStep) {
      return null;
    }
    if (dimension === "yield") {
      return {
        label: "Receipt ratio data",
        filename: `${filteredStep.id}_receipt_ratio_data.csv`,
      };
    }
    if (dimension === "consumption") {
      if (selectedComponent) {
        const comp = filteredStep.consumption_data?.components.find(
          (component) => component.material === selectedComponent,
        );
        const token = filenameToken(comp?.name ?? selectedComponent);
        return {
          label: `Consumption data: ${comp?.name ?? selectedComponent}`,
          filename: `${filteredStep.id}_consumption_${token}_data.csv`,
        };
      }
      return {
        label: "Consumption data: all components",
        filename: `${filteredStep.id}_consumption_all_components_data.csv`,
      };
    }
    if (dimension === "supplier") {
      return {
        label: "Supplier OTIF data",
        filename: `${filteredStep.id}_supplier_otif_data.csv`,
      };
    }
    return {
      label: "Timing data",
      filename: `${filteredStep.id}_timing_data.csv`,
    };
  }, [filteredStep, dimension, selectedComponent]);
  const statusActionState = useMemo(
    () => deriveStatusActionState(statusEntries),
    [statusEntries],
  );
  return (
    <SlideOver onClose={onClose} label={step?.label ?? "Step detail"}>
      {/* Header */}
      <div className={cx(sectionBorder, headerStyles)}>
        <div className={headerRow}>
          <div className={headerMain}>
            <SlideOverClose>
              {(close) => (
                <Button
                  variant="linkSubtle"
                  tone="neutral"
                  size="xs"
                  iconName="chevronLeft"
                  onClick={close}
                  className={backLink}
                >
                  Back to overview
                </Button>
              )}
            </SlideOverClose>
            {siteContext && (
              <div className={usedByRow}>
                <span className={css({ color: "fg.subtle" })}>Used by</span>
                {siteContext.products.map((product, index) => (
                  <span
                    key={product.id}
                    className={css({
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "1",
                    })}
                  >
                    {index > 0 && (
                      <span className={css({ color: "bd.subtle" })}>·</span>
                    )}
                    <Link
                      href={`/supply-chain/product/${product.id}?step=${stepId}`}
                      className={productLink}
                    >
                      <MaterialTag
                        material={materialByProductId.get(product.id)}
                      >
                        {product.name}
                      </MaterialTag>
                      <Icon name="externalLink" size="xs" />
                    </Link>
                  </span>
                ))}
              </div>
            )}
            <div className={titleRow}>
              <h2 className={titleStyles}>
                <MaterialTag material={stepMaterial}>
                  {step
                    ? step.type === "procurement"
                      ? procurementStepDisplayLabel(step.label, "qualified")
                      : step.label
                    : "Loading..."}
                </MaterialTag>
              </h2>
              <div className={titleActions}>
                {briefHref && <BriefLink href={briefHref} />}
                {onStatus && (
                  <StatusActionButton
                    onClick={onStatus}
                    state={statusActionState}
                  />
                )}
                {filteredStep &&
                  activeDetailData &&
                  activeDetailData.detailRows.rows.length > 0 && (
                    <DataTableSection
                      ref={dataTableRef}
                      detailRows={activeDetailData.detailRows}
                      stepId={filteredStep.id}
                      title={dataTableTitle}
                      label={activeDetailTableMeta?.label}
                      filename={activeDetailTableMeta?.filename}
                      dateColumnKey={activeDetailData.dateKey}
                      defaultFilters={
                        activeDetailData.dateKey ? defaultTableFilters : {}
                      }
                    />
                  )}
              </div>
            </div>
            {filteredStep && (
              <div className={metaRow}>
                <ObservationCount
                  step={filteredStep}
                  stats={dimensionStats}
                  dimension={dimension}
                  timeRange={timeRange}
                  selectedComponent={selectedComponent != null}
                  countOverride={selectedComponentReconciliationCount}
                  previousCount={periodComparison.previousStats?.n ?? 0}
                />
                {filteredStep.type === "procurement" && (
                  <span className={metaItem}>
                    <span className={metaDivider} />
                    <span className={procurementMetaStack}>
                      <span className={metaLabel}>Supplier</span>
                      <span className={strongText}>
                        {filteredStep.supplier_name ??
                          filteredStep.supplier_id ??
                          "Unknown"}
                      </span>
                      <span className={metaLabel}>Basis</span>
                      <span className={strongText}>
                        {
                          {
                            ordinary: "Buy",
                            consignment: "Consignment",
                            subcontract: "Subcontract",
                            mixed: "Mixed",
                            unknown: "Unknown",
                          }[filteredStep.receipt_basis ?? "unknown"]
                        }
                      </span>
                    </span>
                  </span>
                )}

                {excludeOutliers && (filteredStep.excluded_count ?? 0) > 0 && (
                  <span className={metaItem}>
                    <span className={metaDivider} />
                    <span className={css({ color: "fg.subtle" })}>
                      <span className={strongText}>
                        {filteredStep.excluded_count}
                      </span>{" "}
                      outliers excluded
                    </span>
                  </span>
                )}
                {lastObsDate && (
                  <span className={metaItem}>
                    <span className={metaDivider} />
                    <span className={lastUpdatedStack}>
                      <span className={strongText}>{lastObsDate}</span>
                      <span className={metaLabel}>Last updated</span>
                    </span>
                  </span>
                )}
              </div>
            )}
          </div>
          <div className={headerActions}>
            {availableDimensions.length > 1 && (
              <div className={segGroup}>
                {availableDimensions.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => {
                      setDimension(day);
                      setSelectedComponent(null);
                    }}
                    className={cx(
                      segButton,
                      dimension === day ? segButtonActive : segButtonInactive,
                    )}
                  >
                    {day === "timing"
                      ? "Timing"
                      : day === "yield"
                        ? "Receipt ratio"
                        : day === "consumption"
                          ? "Consumption"
                          : "Supplier"}
                  </button>
                ))}
              </div>
            )}
            <div className={segGroup}>
              {TIME_RANGE_OPTIONS.map((row) => (
                <button
                  key={row.value}
                  type="button"
                  onClick={() => setTimeRange(row.value)}
                  className={cx(
                    segButton,
                    timeRange === row.value
                      ? segButtonActive
                      : segButtonInactive,
                  )}
                >
                  {row.label}
                </button>
              ))}
            </div>
            {step && (
              <DocsIconButton
                label="About this step"
                className={docsAction}
                onClick={() => {
                  const target = stepDocTarget(step.type);
                  openDocs(target.section, target.sub);
                }}
              />
            )}
            <SlideOverClose>
              {(close) => (
                <Button
                  variant="ghost"
                  tone="neutral"
                  size="sm"
                  iconName="close"
                  aria-label="Close"
                  onClick={close}
                />
              )}
            </SlideOverClose>
          </div>
        </div>
      </div>

      {/* Content */}
      <div>
        {loading && (
          <LoadingState message="Loading step data..." className="h-32" />
        )}
        {error && <ErrorState message={error} className="p-6" />}
        {!loading &&
          filteredStep &&
          step &&
          (supplierPerformanceEnabled &&
          dimension === "supplier" &&
          (windowedSupplierBlock ?? step.supplier_otif) ? (
            <SupplierDimensionView
              block={
                (windowedSupplierBlock ?? step.supplier_otif) as NonNullable<
                  typeof step.supplier_otif
                >
              }
              windowLabel={timeRangeLongLabel(timeRange)}
            />
          ) : (
            <>
              {/* Key metrics + stats row */}
              <div className={metricsSection}>
                {dimension === "timing" && (
                  <>
                    <KeyMetricsRow
                      step={filteredStep}
                      unfilteredStep={step}
                      comparison={periodComparison}
                      timeRange={timeRange}
                      measureOverride={measureOverride}
                    />

                    <InventoryPolicyRow step={filteredStep} />

                    {planningWarningTexts(filteredStep.planning_warnings)
                      .length > 0 && (
                      <div className={planningWarnings}>
                        {planningWarningTexts(
                          filteredStep.planning_warnings,
                        ).map((warning) => (
                          <div key={warning} className={planningWarning}>
                            <Icon
                              name="warning"
                              size="xs"
                              className={planningWarningIcon}
                            />
                            <span>{warning}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <StatsRow
                      step={filteredStep}
                      deltas={periodComparison.statDeltas}
                      comparison={periodComparison}
                    />
                  </>
                )}
                {dimension === "yield" && dimensionStats && (
                  <>
                    <YieldMetricsRow
                      stats={dimensionStats}
                      reference={filteredStep.yield_data?.reference ?? 100}
                      comparison={periodComparison}
                    />

                    <StatsRow
                      step={filteredStep}
                      deltas={periodComparison.statDeltas}
                      stats={dimensionStats}
                      unit="%"
                      invertColor
                      comparison={periodComparison}
                    />
                  </>
                )}
                {dimension === "consumption" && dimensionStats && (
                  <>
                    <ConsumptionMetricsRow
                      stats={dimensionStats}
                      components={
                        filteredStep.consumption_data?.components ?? []
                      }
                      weightedVariance={
                        filteredStep.consumption_data?.aggregate
                          .weighted_variance_pct ?? null
                      }
                      aggregate={
                        filteredStep.consumption_data?.aggregate ?? null
                      }
                      selectedComponent={selectedComponent}
                      onSelectComponent={setSelectedComponent}
                      comparison={periodComparison}
                    />

                    <StatsRow
                      step={filteredStep}
                      deltas={periodComparison.statDeltas}
                      stats={dimensionStats}
                      unit="%"
                      comparison={periodComparison}
                    />
                  </>
                )}
              </div>

              {/* Charts row */}
              <div className={sectionBorder}>
                <div className={chartsRow}>
                  <div className={chartCellLeft}>
                    <DistributionChart
                      step={filteredStep}
                      dimension={dimension}
                      selectedComponent={selectedComponent}
                    />
                  </div>
                  <div className={chartCell}>
                    <TimeSeriesChart
                      step={filteredStep}
                      dimension={dimension}
                      selectedComponent={selectedComponent}
                      onMonthClick={
                        activeDetailData?.dateKey
                          ? handleChartMonthClick
                          : undefined
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Monthly carrying cost + savings calculator (dwell + timing only) */}
              {isDwellType(filteredStep.type) && dimension === "timing" && (
                <>
                  <div className={sectionBorder}>
                    <MonthlyCostChart
                      step={filteredStep}
                      onMonthClick={
                        activeDetailData?.dateKey
                          ? handleChartMonthClick
                          : undefined
                      }
                    />
                  </div>
                  <div className={sectionBorder}>
                    <SavingsCalculator
                      step={filteredStep}
                      timeRange={timeRange}
                    />
                  </div>
                </>
              )}
            </>
          ))}
      </div>

      {/* Status updates received for this step (newest first) */}
      {!loading && step && (
        <div className={statusSection}>
          <h3 className={statusSectionTitle}>Status</h3>
          {statusEntries.length === 0 ? (
            <p className={statusEmpty}>
              No status updates yet. Use the Status button above to add the
              first note.
            </p>
          ) : (
            <div className={statusList}>
              {[...statusEntries].reverse().map((entry) => (
                <div
                  key={`${entry.at}-${entry.user}-${entry.category}-${entry.text}`}
                  className={statusItem}
                >
                  <div className={statusMeta}>
                    <span className={statusCategory}>{entry.category}</span>
                    <span className={statusDot}>·</span>
                    <span>{entry.user}</span>
                    <span className={statusDot}>·</span>
                    <span>{formatStatusDate(entry.at)}</span>
                  </div>
                  <p className={statusBody}>{statusEntryText(entry)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {statusDialog}
    </SlideOver>
  );
};
