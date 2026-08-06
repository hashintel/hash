import { STEP_TYPE_LABELS } from "../../shared/categories";
import { buildCsvContent } from "../../shared/export-utils";
import { BASE_MEASURES, MEASURE_LABELS } from "../../shared/measure-context";
import { computeTimingTrend, trendDirection } from "../../shared/period-trends";
import { siteNodeKey } from "../../shared/site-node-key";
import {
  deriveStatusActionState,
  statusKey,
  statusTokensToPlainText,
  type StatusEntry,
  type StatusStore,
} from "../../shared/status";

import type { ProcurementBasis } from "../../shared/procurement-basis-context";
import type { TimeRange } from "../../shared/time-range";
import type { DetailColumn, Product, SiteNode } from "../../shared/types";
import type { DwellRow, PlanningRow } from "./shared/row-types";
import type { EntityId } from "@blockprotocol/type-system";

type ExportValue = string | number | null;
type ExportRecord = Record<string, ExportValue>;

export interface SiteOverviewExportSettings {
  currency: string;
  excludeLowSamples: boolean;
  excludeOutliers: boolean;
  procurementBasis: ProcurementBasis;
  storageCost: number;
  timeRange: TimeRange;
  waccRate: number;
}

export interface SiteOverviewExportInput {
  dwellRows: readonly DwellRow[];
  historicalNodes: readonly SiteNode[];
  mentionShortnamesByEntityId?: ReadonlyMap<EntityId, string>;
  planningRows: readonly PlanningRow[];
  products: readonly Product[];
  settings: SiteOverviewExportSettings;
  siteId: string;
  statusHistory: StatusStore;
}

const identityColumns = [
  ["category", "Category"],
  ["step_type", "Step type"],
  ["material_name", "Material name"],
  ["material", "Material number"],
  ["plant", "Plant"],
  ["product_names", "Products"],
  ["supplier_name", "Supplier"],
  ["supplier_id", "Supplier ID"],
  ["receipt_basis", "Receipt basis"],
  ["plan_match_status", "Plan match status"],
  ["planning_source", "Planning source"],
] as const;

const analysisColumns = [["time_range", "Time range"]] as const;

const planningColumns = [
  ["plan_days", "Plan (days)"],
  ["p95_deviation_percent", "P95 vs plan (%)"],
  ["plan_note", "Plan note"],
  ["observations_exceeding_plan_percent", "Observations exceeding plan (%)"],
  ["minimum_order_quantity", "Minimum order quantity"],
  ["minimum_order_uom", "Minimum order UOM"],
  ["order_multiple_quantity", "Order multiple quantity"],
  ["safety_stock_quantity", "Safety stock quantity"],
  ["safety_stock_uom", "Safety stock UOM"],
] as const;

const costColumns = [
  ["period_dwell_cost", "Period dwell cost"],
  ["previous_period_dwell_cost", "Previous period dwell cost"],
  ["dwell_cost_trend_percent", "Dwell cost trend (%)"],
  ["dwell_cost_currency", "Dwell cost currency"],
] as const;

const qualityColumns = [
  ["sample_count", "Sample count"],
  ["previous_sample_count", "Previous sample count"],
] as const;

const outlierColumns = [
  ["outliers_excluded", "Outliers excluded from mean"],
  ["excluded_outlier_count", "Excluded outlier count"],
  ["excluded_outlier_percent", "Excluded outlier (%)"],
] as const;

const statusColumns = [
  ["opportunity_status", "Opportunity status"],
  ["latest_status_category", "Latest status category"],
  ["latest_status_at", "Latest status at"],
  ["latest_status_author", "Latest status author"],
  ["comments", "Comments"],
] as const;

const measureColumnEntries = BASE_MEASURES.flatMap((measure) => {
  const label = MEASURE_LABELS[measure];
  return [
    [`${measure}_current`, `${label} current (days)`],
    [`${measure}_previous`, `${label} previous (days)`],
    [`${measure}_trend_percent`, `${label} trend (%)`],
    [`${measure}_trend_direction`, `${label} trend direction`],
    ...(measure === "p95"
      ? []
      : [[`${measure}_deviation_percent`, `${label} vs plan (%)`] as const]),
  ] as const;
});

const exportSettingsColumns = [
  ["procurement_basis", "Procurement timing basis"],
  ["low_samples_excluded", "Low samples excluded"],
  ["wacc_percent", "WACC (%)"],
  ["storage_cost", "Storage cost per tonne per day"],
  ["analysis_currency", "Analysis currency"],
  ["period_material_value", "Period material value"],
  ["material_value_currency", "Material value currency"],
  ["unit_price", "Unit price"],
  ["unit_price_currency", "Unit price currency"],
] as const;

const outlierColumnsIndex =
  measureColumnEntries.findIndex(([key]) => key === "mean_deviation_percent") +
  1;

const columnEntries = [
  ...identityColumns,
  ...analysisColumns,
  ...planningColumns,
  ...costColumns,
  ...qualityColumns,
  ...measureColumnEntries.slice(0, outlierColumnsIndex),
  ...outlierColumns,
  ...measureColumnEntries.slice(outlierColumnsIndex),
  ...statusColumns,
  ...exportSettingsColumns,
] as const;

export const SITE_OVERVIEW_EXPORT_COLUMNS: DetailColumn[] = columnEntries.map(
  ([key, label]) => ({
    key,
    label,
    source_field: null,
    source_table: null,
  }),
);

const latestEntry = (
  entries: readonly StatusEntry[] | undefined,
): StatusEntry | null =>
  entries
    ? ([...entries]
        .sort((left, right) => left.at.localeCompare(right.at))
        .at(-1) ?? null)
    : null;

const formatComments = (
  entries: readonly StatusEntry[] | undefined,
  mentionShortnamesByEntityId: ReadonlyMap<EntityId, string>,
): string =>
  [...(entries ?? [])]
    .sort((left, right) => left.at.localeCompare(right.at))
    .map((entry) => {
      const text = entry.tokens.length
        ? statusTokensToPlainText(
            entry.tokens,
            (entityId) =>
              `@${mentionShortnamesByEntityId.get(entityId) ?? "user"}`,
          )
        : entry.text;
      return `${entry.at} | ${entry.user} | ${entry.category} | ${
        text || "(no comment)"
      }`;
    })
    .join("\n");

const planningSourceLabel = (node: SiteNode): string | null => {
  const source = node.planning_source;
  if (!source) {
    return null;
  }
  return [source.label, source.system, source.table]
    .filter(Boolean)
    .join(" | ");
};

const buildMaterialNamesByNumber = (
  products: readonly Product[],
  nodes: readonly SiteNode[],
): ReadonlyMap<string, string> => {
  const materialNames = new Map<string, string>();

  for (const product of products) {
    if (product.material && product.name.trim()) {
      materialNames.set(product.material, product.name.trim());
    }
  }
  for (const node of nodes) {
    const materialName = node.material_name?.trim();
    if (node.material && materialName) {
      materialNames.set(node.material, materialName);
    }
  }

  return materialNames;
};

const unroundedNumericColumns = new Set([
  "period_material_value",
  "unit_price",
]);

const roundExportValues = (record: ExportRecord): ExportRecord =>
  Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      typeof value === "number" && !unroundedNumericColumns.has(key)
        ? Number(value.toFixed(1))
        : value,
    ]),
  );

const measureValues = (
  node: SiteNode,
  historicalNode: SiteNode,
  timeRange: TimeRange,
): ExportRecord => {
  const values: ExportRecord = {};
  for (const measure of BASE_MEASURES) {
    const trend = computeTimingTrend(historicalNode, timeRange, measure);
    const current = node.stats[measure] ?? null;
    values[`${measure}_current`] = current;
    values[`${measure}_previous`] = trend.previousValue;
    values[`${measure}_trend_percent`] = trend.pctChange;
    values[`${measure}_trend_direction`] = trendDirection(trend.pctChange);
    values[`${measure}_deviation_percent`] =
      node.plan != null && node.plan > 0 && current != null
        ? ((current - node.plan) / node.plan) * 100
        : null;
  }
  return values;
};

const rowToExportRecord = ({
  category,
  historicalNode,
  mentionShortnamesByEntityId,
  node,
  materialNamesByNumber,
  settings,
  siteId,
  statusHistory,
}: {
  category: "Dwell" | "Planning";
  historicalNode: SiteNode;
  mentionShortnamesByEntityId: ReadonlyMap<EntityId, string>;
  node: DwellRow | PlanningRow;
  materialNamesByNumber: ReadonlyMap<string, string>;
  settings: SiteOverviewExportSettings;
  siteId: string;
  statusHistory: StatusStore;
}): ExportRecord => {
  const entries = statusHistory[statusKey(siteId, node)];
  const latest = latestEntry(entries);
  const dwell = category === "Dwell" ? (node as DwellRow) : null;
  const planning = category === "Planning" ? (node as PlanningRow) : null;

  return roundExportValues({
    category,
    step_type: STEP_TYPE_LABELS[node.type],
    material_name: node.material
      ? (materialNamesByNumber.get(node.material) ?? null)
      : null,
    material: node.material,
    plant: node.plant,
    product_names: node.products.map((product) => product.name).join("; "),
    supplier_name: node.supplier_name ?? null,
    supplier_id: node.supplier_id ?? null,
    receipt_basis: node.receipt_basis ?? null,
    plan_match_status: node.plan_match_status ?? null,
    planning_source: planningSourceLabel(node),
    time_range: settings.timeRange,
    procurement_basis: settings.procurementBasis,
    low_samples_excluded: settings.excludeLowSamples ? "Yes" : "No",
    outliers_excluded: settings.excludeOutliers ? "Yes" : "No",
    wacc_percent: settings.waccRate * 100,
    storage_cost: settings.storageCost,
    analysis_currency: settings.currency,
    plan_days: node.plan,
    plan_note: node.plan_note,
    observations_exceeding_plan_percent: node.pct_exceeding_plan ?? null,
    period_material_value: planning?.periodMaterialValue ?? null,
    material_value_currency: node.material_value?.currency ?? null,
    minimum_order_quantity: node.inventory_policy?.minimum_order_qty ?? null,
    minimum_order_uom: node.inventory_policy?.order_uom ?? null,
    order_multiple_quantity: node.inventory_policy?.order_multiple_qty ?? null,
    safety_stock_quantity: node.inventory_policy?.safety_stock_qty ?? null,
    safety_stock_uom: node.inventory_policy?.safety_stock_uom ?? null,
    unit_price: node.cost?.unit_price ?? null,
    unit_price_currency: node.cost?.currency ?? null,
    period_dwell_cost: dwell?.periodCost ?? null,
    previous_period_dwell_cost: dwell?.previousPeriodCost ?? null,
    dwell_cost_trend_percent: dwell?.costTrendPct ?? null,
    dwell_cost_currency: node.cost?.currency ?? settings.currency,
    sample_count: node.stats.n,
    previous_sample_count: node.previousTrendN,
    excluded_outlier_count: node.excluded_count ?? null,
    excluded_outlier_percent: node.excluded_pct ?? null,
    ...measureValues(node, historicalNode, settings.timeRange),
    opportunity_status: deriveStatusActionState(entries).label,
    latest_status_category: latest?.category ?? null,
    latest_status_at: latest?.at ?? null,
    latest_status_author: latest?.user ?? null,
    comments: formatComments(entries, mentionShortnamesByEntityId),
  });
};

export const buildSiteOverviewExportRows = ({
  dwellRows,
  historicalNodes,
  mentionShortnamesByEntityId = new Map(),
  planningRows,
  products,
  settings,
  siteId,
  statusHistory,
}: SiteOverviewExportInput): ExportRecord[] => {
  const historicalNodesByKey = new Map(
    historicalNodes.map((node) => [siteNodeKey(node), node]),
  );
  const materialNamesByNumber = buildMaterialNamesByNumber(products, [
    ...historicalNodes,
    ...dwellRows,
    ...planningRows,
  ]);
  const exportRow = (
    node: DwellRow | PlanningRow,
    category: "Dwell" | "Planning",
  ) =>
    rowToExportRecord({
      category,
      historicalNode: historicalNodesByKey.get(siteNodeKey(node)) ?? node,
      materialNamesByNumber,
      mentionShortnamesByEntityId,
      node,
      settings,
      siteId,
      statusHistory,
    });

  return [
    ...dwellRows.map((row) => exportRow(row, "Dwell")),
    ...planningRows.map((row) => exportRow(row, "Planning")),
  ];
};

export const buildSiteOverviewCsv = (input: SiteOverviewExportInput): string =>
  buildCsvContent(
    SITE_OVERVIEW_EXPORT_COLUMNS,
    buildSiteOverviewExportRows(input),
  );
