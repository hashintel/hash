export interface Product {
  id: string;
  name: string;
  material: string;
}

export interface AnalysisSettings {
  currency?: string | null;
  storage_cost?: number | null;
}

export interface StepStats {
  n: number;
  mean: number | null;
  median: number | null;
  std: number | null;
  min: number | null;
  max: number | null;
  p25: number | null;
  p75: number | null;
  p85: number | null;
  p95: number | null;
}

/**
 * Canonical timing step types. One vocabulary shared by graph nodes and
 * pipeline segments:
 *  - `production`  : real production duration (production start -> finish).
 *  - `qa_hold`     : finished-good receipt -> QA release.
 *  - `post_qa_ship`: QA release -> first shipment.
 */
export type StepType =
  | "procurement"
  | "raw_material_dwell"
  | "production"
  | "intermediate_dwell"
  | "qa_hold"
  | "post_qa_ship"
  | "transit"
  | "destination_dwell";

export interface CostData {
  unit_price: number | null;
  currency: string | null;
  unit_price_source?: string | null;
}

/**
 * Source provenance for a step's durations. Attached by the corresponding
 * `extract_*` function on the backend so the UI can show users where the
 * numbers came from (which source movement chain, delivery schedule, etc.), how
 * many observations underlie the stats, and what outlier filter was applied.
 *
 * Same population also drives the per-batch lookups consumed by the chain
 * trace and post-production block in `build_batch_timelines`, so the lever
 * sliders, KPI tiles and step cards all draw from the same data.
 */
export interface StepSource {
  label: string;
  n: number;
  filter?: string | null;
}

export interface PlanningWarning {
  code: string;
  level: "info" | "warning";
  text: string;
}

export interface ProcurementPlanningSource {
  label: string;
  system: string;
  table: string;
  source_id: string | null;
  material: string;
  site: string;
  supplier_id: string | null;
  basis: string | null;
  plan_days: number | null;
  dock_to_stock_days: number | null;
  match_level: string;
  priority?: number | null;
  effective_in_date?: string | null;
  effective_out_date?: string | null;
  contract_valid_to?: string | null;
}

export interface InventoryPolicySource {
  system: string;
  table: string;
  field?: string;
  minimum_field?: string;
  multiple_field?: string;
}

export interface InventoryPolicy {
  material: string;
  plant: string;
  minimum_order_qty: number | null;
  order_multiple_qty: number | null;
  order_uom: string | null;
  minimum_order_source: InventoryPolicySource | null;
  safety_stock_qty: number | null;
  safety_stock_uom: string | null;
  safety_stock_source: InventoryPolicySource | null;
  warnings: PlanningWarning[];
}

export type ProcurementPlanningAlternative = Record<string, unknown> & {
  label: string;
  plan_days: number | null;
};

export type ProcurementReceiptBasis =
  | "ordinary"
  | "consignment"
  | "subcontract"
  | "mixed"
  | "unknown";

export type ProcurementPlanMatchStatus =
  | "matched"
  | "matched_wrong_basis"
  | "missing_profile"
  | "missing_supplier"
  | "mixed_basis"
  | "ambiguous";

export interface ProcurementPlanningCandidate {
  candidate_id: string;
  supplier_id: string | null;
  basis: string | null;
  plan_days: number | null;
  dock_to_stock_days?: number | null;
  priority?: number | null;
  effective_in_date?: string | null;
  effective_out_date?: string | null;
}

export interface ProcurementPlanningProfile {
  id: string;
  material: string;
  plant: string;
  supplier_id: string | null;
  supplier_name: string | null;
  receipt_basis: ProcurementReceiptBasis;
  plan_days: number | null;
  /** Retained for future use but intentionally not presented as a UI metric. */
  dock_to_stock_days?: number | null;
  provenance: "profile" | "fallback";
  match_status: ProcurementPlanMatchStatus;
  planning_warnings?: PlanningWarning[];
  planning_source?: ProcurementPlanningSource | null;
  planning_alternatives?: ProcurementPlanningAlternative[];
  candidate_ids?: string[];
}

/**
 * Batch-normalisation metadata for production steps. The step's duration
 * observations/stats are reported as `normalized_days` — each batch's raw
 * window scaled to a common `qty` (the median confirmed output, in `unit`), so
 * "days per typical batch" comparisons are not distorted by batch-size changes.
 * `qty` is the exact divisor used (already rounded to 2 sig figs at extract
 * time). Null/absent on non-production steps.
 */
export interface StepNormalization {
  /** Normalisation quantity — the exact divisor the durations are scaled to. */
  qty: number;
  /** Unit of measure of `qty`, e.g. "KG". */
  unit: string | null;
  /** Human-readable basis, e.g. "median confirmed output". */
  basis: string;
  /** Window the median was taken over: "6m" | "12m" | "all". */
  window: string;
  /** Number of confirmed batches in the median window. */
  n_batches: number;
}

export interface GraphNode {
  id: string;
  label: string;
  type: StepType;
  material: string | null;
  plant: string;
  stats: StepStats;
  plan: number | null;
  plan_note: string | null;
  /** Client-derived from the active timing series and `plan`; omitted on the wire. */
  pct_exceeding_plan?: number | null;
  cost: CostData | null;
  observations?: Observation[];
  /** Client-side cache of combined procurement node observations from the wire. */
  procurement_observations?: ProcurementNodeObservation[];
  monthly?: MonthlyBucket[];
  /** Client-computed by the Tukey IQR outlier selection (lib/utils); not shipped by the generator. */
  excluded_count?: number;
  /** Client-computed exclusion rate (%) under the current outlier setting. */
  excluded_pct?: number;
  n_batches?: number;
  n_movements?: number;
  /** Recomputed client-side from `yield_series` under window + outlier; not shipped by the generator. */
  yield_summary?: YieldSummary | null;
  /** Recomputed client-side from `consumption_series` under window + outlier; not shipped by the generator. */
  consumption_summary?: ConsumptionSummary | null;
  /**
   * Raw per-observation yield/consumption series (production nodes only) used to
   * recompute the R:/C: badge summaries client-side under window + outlier. When
   * absent (e.g. non-production nodes), no summary is shown.
   */
  yield_series?: NodeYieldSeries | null;
  consumption_series?: NodeConsumptionSeries | null;
  /**
   * Per-route binding scores keyed by route_code (a destination-hub code,
   * "direct", or "all"). Used by the E2E what-if simulator to rank levers and
   * annotate impact.
   */
  binding?: Record<string, BindingScore> | null;
  /** Provenance for this step's durations (data source + filter + n). */
  source?: StepSource | null;
  /**
   * Batch-normalisation metadata (production nodes only): the quantity the
   * `normalized_days` durations are scaled to. Null/absent otherwise.
   */
  normalization?: StepNormalization | null;
  /**
   * Whether this step's material is reachable from the finished good in the
   * current BOM/recipe. False means the step appears in historical batches but
   * is no longer in the current recipe, so simulated reductions may not affect
   * future batches.
   */
  in_current_recipe?: boolean | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  receipt_basis?: ProcurementReceiptBasis | null;
  planning_profile_id?: string | null;
  plan_match_status?: ProcurementPlanMatchStatus | null;
  planning_source?: ProcurementPlanningSource | null;
  planning_alternatives?: ProcurementPlanningAlternative[];
  planning_warnings?: PlanningWarning[];
  inventory_policy?: InventoryPolicy | null;
  observation_grain?: string | null;
  po_item_count?: number | null;
  po_item_ids?: string[];
  planning_profile?: ProcurementPlanningProfile | null;
  planning_profiles?: ProcurementPlanningCandidate[];
  /** Retained for a future receiving-process comparison; not rendered directly. */
  dock_to_stock_days?: number | null;
}

export interface GraphEdge {
  source: string;
  target: string;
  label?: string;
}

export interface PipelineStage {
  id: string;
  label: string;
  type: StepType;
  mean: number;
  median: number;
  pct_of_total: number;
  n?: number;
}

export interface PipelineSummary {
  label: string;
  stages: PipelineStage[];
  total_mean: number;
  total_median: number;
}

export interface BatchTimelineSegment {
  label: string;
  mean: number;
  median: number;
  p25: number;
  p75: number;
  n: number;
}

export interface BatchTimelineRoute {
  label: string;
  /** Per-route segments are recomputed client-side; the wire ships labels only. */
  segments?: Record<string, BatchTimelineSegment>;
}

export interface ChainStep {
  step_id: string;
  duration: number;
  type: StepType;
  material?: string | null;
}

/**
 * One leaf-to-FG path through the upstream production tree. Steps are
 * ordered leaf-first; the chain's `total_days` is the contribution of this
 * path to the "Production Start -> consumed by FG" window. Procurement and
 * raw-material dwell are intentionally NOT modelled as chain steps -- they
 * sit before the production window and are out of scope for the what-if
 * simulator.
 */
export interface UpstreamChain {
  chain_id: string;
  steps: ChainStep[];
  total_days: number;
  production_days: number;
  earliest_event_date: string | null;
}

export interface StepContributions {
  /** Parallel chains -- E2E upstream contribution = max(chain.total_days). */
  upstream_chains: UpstreamChain[];
  /** step_id -> step duration. Serial -- total is sum. */
  post_production: Record<string, number>;
}

/** Numeric per-batch segment durations (days) usable for segment rollups. */
export type BatchSegmentKey =
  | "seg_proc_to_prodstart"
  | "seg_prodstart_to_prodfinish"
  | "seg_prodfinish_to_qa"
  | "seg_qa_to_customer"
  | "total_days"
  | "total_from_po";

/**
 * One row of the batch_timelines.batches array. Carries the original
 * primitive-valued detail columns plus the structured `step_contributions`
 * block used by the E2E what-if simulator.
 */
export interface BatchRow {
  batch: string;
  route: string | null;
  n_traced_materials: number | null;
  earliest_po_date: string | null;
  earliest_gr_date: string | null;
  earliest_production_start: string | null;
  fg_receipt_date: string | null;
  qa_release_date: string | null;
  delivery_date: string | null;
  delivery_source: string | null;
  seg_proc_to_prodstart: number | null;
  seg_prodstart_to_prodfinish: number | null;
  seg_prodfinish_to_qa: number | null;
  seg_qa_to_customer: number | null;
  total_days: number | null;
  total_from_po: number | null;
  step_contributions?: StepContributions;
}

export interface BatchTimelines {
  batches: BatchRow[];
  /** Recomputed client-side (recompute-batch-timelines); omitted from the wire. */
  segments?: Record<string, BatchTimelineSegment>;
  per_route: Record<string, BatchTimelineRoute>;
  /** Recomputed client-side; omitted from the wire. */
  coverage?: { traced: number; total: number };
  /** Per-route trace coverage; recomputed client-side, omitted from the wire. */
  coverage_by_route?: Record<string, { traced: number; total: number }>;
  detail_columns?: DetailColumn[];
}

/** One candidate "next-binding chain" entry. The chain is identified by
 * its leaf step (chains are leaf-first); `label` is the leaf step's
 * human-readable name; `share` is the fraction of binding batches where
 * this chain was the next to bind. */
export interface NextBottleneckChain {
  label: string;
  step_id: string;
  share: number;
}

export interface BindingScore {
  /** 0..1 fraction of batches where this step is on the binding chain. */
  binding_share: number;
  /** Mean (binding_chain_total − chain_containing_step_total) when not binding. */
  mean_slack: number | null;
  /**
   * Marginal-return headroom in days. For upstream steps: mean across
   * binding batches of (binding_chain_total − next_chain_total). For
   * serial post-prod steps: `null` (no parallel competitor; slider cap
   * is derived from median/mean on the frontend).
   */
  next_bottleneck_days: number | null;
  /** Expected E2E days saved per day of step reduction (0..1). */
  expected_marginal_per_day: number;
  /**
   * Top-k candidate chains that become binding once this step's
   * headroom is consumed (upstream steps only). Ordered by share desc;
   * entries below 10% are dropped; capped at 3. `null` / undefined when
   * unavailable (post-prod steps, single-chain batches, or the
   * frontend is reading old data).
   */
  next_bottleneck_chains?: NextBottleneckChain[] | null;
}

export interface GraphData {
  /** Procurement planning data contract version. */
  schema_version?: "1.1";
  analysis_settings?: AnalysisSettings | null;
  product_id: string;
  product_name: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  pipeline_summary: Record<string, PipelineSummary>;
  batch_timelines?: BatchTimelines;
}

export type RawGraphData = Omit<GraphData, "pipeline_summary"> & {
  pipeline_summary?: Record<string, PipelineSummary>;
};

export interface MonthlyBucket {
  month: string;
  mean: number | null;
  median: number | null;
  n: number;
  /**
   * Carrying kg-days for cost. On product-scoped dwell steps/nodes this is the
   * realized, finished-good-scoped total rebuilt from the detail rows. On site
   * overview nodes it is stamped during deduplication to the exit-typed split
   * this node type owns (see the split fields below + site-aggregation).
   */
  total_kg_days?: number | null;
  /**
   * Exit-typed carrying kg-days split (dwell nodes on the site overview). The
   * site aggregation attributes each bucket to the right node: `consumed` ->
   * intermediate/raw dwell, `dispatched` + `open` -> post-QA for FG-intermediates.
   */
  consumed_kg_days?: number | null;
  dispatched_kg_days?: number | null;
  other_exit_kg_days?: number | null;
  open_kg_days?: number | null;
  actual_qty?: number | null;
  expected_qty?: number | null;
  weighted_variance_pct?: number | null;
}

export interface Observation {
  date: string;
  value: number;
  actual_qty?: number | null;
  expected_qty?: number | null;
}

export interface ProcurementNodeObservation {
  first_receipt_date: string;
  first_receipt_value: number;
  last_receipt_date: string;
  last_receipt_value: number;
}

/**
 * A lightweight, self-contained timing series (observations + monthly buckets +
 * stats) carried alongside a step's headline series. Flows through the same
 * outlier + window pipeline as the primary series so its stats stay consistent
 * with the active toggles. Used for procurement's full-receipt lead time.
 */
export interface TimingSeries {
  label?: string;
  observations: Observation[];
  monthly: MonthlyBucket[];
  stats: StepStats;
}

export interface DetailColumn {
  key: string;
  source_field: string | null;
  source_table: string | null;
  label: string;
  /** Optional unit suffix for numeric columns (e.g. "kg", "d", "%", "kg·d"). */
  unit?: string | null;
}

export interface DetailRows {
  columns: DetailColumn[];
  rows: Record<string, string | number | null>[];
}

export interface YieldData {
  values: number[];
  observations: Observation[];
  monthly: MonthlyBucket[];
  stats: StepStats;
  reference: number;
  detail_rows?: DetailRows | null;
}

export interface ComponentConsumption {
  material: string;
  name: string;
  planned_per_unit: number | null;
  uom: string;
  values: number[];
  observations: Observation[];
  monthly: MonthlyBucket[];
  stats: StepStats;
  detail_rows?: DetailRows | null;
  source?: string;
  in_current_bom?: boolean;
  n_reconciliation_events?: number;
  n_orders_planned?: number;
  n_orders_consumed?: number;
  n_orders_off_bom?: number;
  n_orders_planned_not_consumed?: number;
  n_orders_unplanned?: number;
  n_variance_outliers?: number;
}

export interface OffBomComponent {
  material: string;
  name: string;
  n_orders: number;
  first_date?: string | null;
  last_date?: string | null;
}

export interface ConsumptionOrder {
  date: string;
  aufnr: string;
  weighted_variance_pct?: number | null;
  off_bom: boolean;
  planned_not_consumed: boolean;
  unplanned: boolean;
  substitution: boolean;
}

export interface ConsumptionData {
  components: ComponentConsumption[];
  aggregate: {
    values: number[];
    observations: Observation[];
    monthly: MonthlyBucket[];
    stats: StepStats;
    weighted_variance_pct?: number | null;
    unweighted_values?: number[];
    unweighted_stats?: StepStats;
    detail_rows?: DetailRows | null;
    n_orders?: number;
    n_orders_off_bom?: number;
    n_orders_planned_not_consumed?: number;
    n_orders_unplanned?: number;
    n_orders_substitution?: number;
    off_bom_components?: OffBomComponent[];
    orders?: ConsumptionOrder[];
  };
}

export interface YieldSummary {
  median: number;
  mean: number;
  reference: number;
  n: number;
}

export interface ConsumptionSummary {
  median_variance: number;
  mean_variance: number;
  weighted_variance?: number | null;
  n_components: number;
  n: number;
}

/**
 * Minimal per-observation yield series carried on production graph nodes so the
 * product card R: badge can recompute `yield_summary` under the active window +
 * outlier rule (the slideover's full `yield_data` is fetched separately from
 * `steps/{id}.json`). Only production-type nodes carry this; the site
 * `summary.json` intentionally omits it (the site overview has no R:/C: badges).
 */
export interface NodeYieldSeries {
  observations: Observation[];
  reference: number;
}

/**
 * Minimal per-observation consumption-variance series carried on production
 * graph nodes (aggregate across components) so the product card C: badge can
 * recompute `consumption_summary` under the active window + outlier rule.
 * Observations carry `actual_qty`/`expected_qty` for the weighted variance.
 */
export interface NodeConsumptionSeries {
  observations: Observation[];
  n_components: number;
}

export interface SiteNode extends GraphNode {
  products: Array<{ id: string; name: string }>;
}

export interface SiteData {
  analysis_settings?: AnalysisSettings | null;
  graphs: Array<{ product: Product; graph: GraphData }>;
}

export interface StepDetail {
  /** Procurement planning data contract version. */
  schema_version?: "1.1";
  id: string;
  label: string;
  type: StepType;
  durations: number[];
  observations: Observation[];
  monthly: MonthlyBucket[];
  stats: StepStats;
  /** Client-computed by the Tukey IQR outlier selection (lib/utils); not shipped by the generator. */
  excluded_count?: number;
  /** Client-computed exclusion rate (%) under the current outlier setting. */
  excluded_pct?: number;
  plan: number | null;
  plan_note: string | null;
  /** Client-derived from the active timing series and `plan`; omitted on the wire. */
  pct_exceeding_plan?: number | null;
  cost: CostData | null;
  detail_rows?: DetailRows | null;
  ref_date_col?: string | null;
  /**
   * Canonical value column within `detail_rows.rows`. With `ref_date_col`, the
   * timing series (observations/durations/monthly/stats) is fully derivable from
   * `detail_rows` on load.
   */
  value_col?: string | null;
  /**
   * Global data horizon (max posting date, `YYYY-MM-DD`) shipped on dwell steps.
   * Lets the client accrue each open-carry row's kg-days across calendar months
   * from `detail_rows` alone: the open interval is
   * `[horizon - open_days + 1, horizon]`. Absent on non-dwell steps.
   */
  data_horizon?: string | null;
  /**
   * Client-derived secondary timing series. For procurement steps this carries
   * the inactive first/last receipt basis after deriving both from detail rows.
   */
  complete_timing?: TimingSeries | null;
  n_batches?: number;
  n_movements?: number;
  yield_data?: YieldData | null;
  consumption_data?: ConsumptionData | null;
  supplier_otif?: ProcurementSupplierBlock | null;
  source?: StepSource | null;
  /**
   * Batch-normalisation metadata (production steps only): the quantity the
   * `normalized_days` value column is scaled to. Null/absent otherwise.
   */
  normalization?: StepNormalization | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  receipt_basis?: ProcurementReceiptBasis | null;
  planning_profile_id?: string | null;
  plan_match_status?: ProcurementPlanMatchStatus | null;
  planning_source?: ProcurementPlanningSource | null;
  planning_alternatives?: ProcurementPlanningAlternative[];
  planning_warnings?: PlanningWarning[];
  inventory_policy?: InventoryPolicy | null;
  observation_grain?: string | null;
  po_item_count?: number | null;
  po_item_ids?: string[];
  planning_profile?: ProcurementPlanningProfile | null;
  planning_profiles?: ProcurementPlanningCandidate[];
  /** Retained for a future receiving-process comparison; not rendered directly. */
  dock_to_stock_days?: number | null;
}

/**
 * Raw step-detail payload from the analysis artifact store.
 *
 * The wire contract may omit timing fields that are derivable from
 * `detail_rows` + `ref_date_col` + `value_col`. `ensureStepStats` normalizes
 * this into a full `StepDetail` before React components consume it.
 */
export type StepDetailWire = Omit<
  StepDetail,
  "durations" | "observations" | "monthly" | "stats"
> &
  Partial<Pick<StepDetail, "durations" | "observations" | "monthly" | "stats">>;

/**
 * Per-vendor OTIF record. Conditional-on-late means the metric is computed
 * across only the late deliveries (n_late) -- treat as "when this vendor is
 * late, how late?". The unconditional `mean_days_late_all` reads as
 * expected delay per delivery (frequency x severity).
 */
export interface VendorOtifStats {
  vendor_id: string | null;
  vendor_name: string | null;
  n_lines: number;
  n_late: number;
  on_time_pct: number | null;
  in_full_pct: number | null;
  otif_pct: number | null;
  mean_days_late_all: number | null;
  mean_days_late_when_late: number | null;
  median_days_late_when_late: number | null;
  max_days_late: number;
  fill_rate_pct: number | null;
  late_buckets: {
    ge_1d_pct: number | null;
    ge_3d_pct: number | null;
    ge_7d_pct: number | null;
    ge_14d_pct: number | null;
  };
  /** Client-derived from supplier `lines[]`; omitted on the wire. */
  monthly?: Array<{ month: string; n: number; on_time_pct: number | null }>;
  /** Client-derived top-N late events; omitted on the wire. */
  worst_events?: SupplierWorstEvent[];
  /** Client-derived per-material breakdown; omitted on the wire. */
  materials?: Array<{
    matnr: string;
    name: string;
    n_lines: number;
    on_time_pct: number | null;
    otif_pct: number | null;
  }>;
}

/**
 * One measurable delivery-schedule line — the atomic unit the supplier-OTIF UI
 * windowed-aggregates over. Emitted by the analysis pipeline so the client can
 * recompute metrics for any time window without a fresh extract.
 */
export interface SupplierLine {
  vendor_id: string | null;
  vendor_name: string | null;
  matnr: string | null;
  material_name: string | null;
  po_number: string | null;
  po_item: string | null;
  po_date: string | null;
  promised_date: string | null;
  first_gr_date: string | null;
  /** Days late vs `promised_date`; can be negative (early). */
  days_late: number;
  sched_qty: number | null;
  gr_qty_to_date: number | null;
}

export interface SupplierWorstEvent {
  vendor_id: string | null;
  vendor_name: string | null;
  matnr: string | null;
  material_name: string | null;
  po_number: string | null;
  po_item: string | null;
  po_date: string | null;
  promised_date: string | null;
  first_gr_date: string | null;
  days_late: number;
  sched_qty: number | null;
  gr_qty_to_date: number | null;
}

/**
 * Supplier OTIF block attached to a procurement step. Pools all schedule
 * lines for the step's material across the lookback window.
 */
export interface ProcurementSupplierBlock {
  primary_vendor: { id: string | null; name: string | null } | null;
  vendors: VendorOtifStats[];
  /** Client-derived from `lines[]`; omitted on the wire. */
  worst_events?: SupplierWorstEvent[];
  coverage_pct: number | null;
  n_lines: number;
  /** Auto-set caveat (e.g. flat 100% in-full = likely data-entry artifact). */
  data_quality_note: string | null;
  /** Tolerance applied at extraction time (0d for on-time, 5% under-fill). */
  tolerance_days?: number;
  under_tolerance_pct?: number;
  /** Raw schedule lines for client-side time-window recompute. */
  lines?: SupplierLine[];
}

/**
 * Site-wide supplier performance pooled across every procured material at
 * every plant. Drives the SiteOverview leaderboard and vendor slideover.
 */
export interface SiteSupplierPerformance {
  /** Procurement planning data contract version. */
  schema_version?: "1.1";
  generated_at: string;
  overall: {
    n_lines: number;
    n_vendors: number;
    on_time_pct: number | null;
    in_full_pct: number | null;
    otif_pct: number | null;
    coverage_pct: number | null;
    tolerance_days: number;
    under_tolerance_pct: number;
    min_lines_for_leaderboard: number;
  };
  vendors: VendorOtifStats[];
  /** Raw schedule lines pooled across all products/plants, for client-side
   * time-window recompute of overall + vendor stats. */
  lines?: SupplierLine[];
}

/**
 * Per-product node list inside the site summary. Nodes are the full
 * `GraphNode` shape (one observation series + monthly buckets +
 * stats + cost inputs) — heavy enough for the overview's client-side window
 * filtering, outlier selection, trend and cost recomputation, so the site view
 * loads ONE `summary.json` instead of every product's full `graph.json`
 * (which also carries edges / pipeline_summary / batch_timelines). This is the
 * "enriched summary" tradeoff: more bytes per file, but a single request and
 * no per-product graph fan-out.
 */
export interface SiteSummaryProduct {
  id: string;
  name: string;
  nodes: GraphNode[];
}

export interface SiteSummaryRollups {
  total_dwell_cost: number | null;
  top_dwell_costs: Array<{
    product_id: string;
    node_id: string;
    label: string;
    period_cost: number;
  }>;
  top_planning_mismatches: Array<{
    product_id: string;
    node_id: string;
    label: string;
    deviation_pct: number;
  }>;
  bad_planning_param_count: number;
}

/** `site/{siteId}/summary.json` — the precomputed site overview artifact. */
export interface SiteSummary {
  schema_version?: "1.1";
  analysis_settings?: AnalysisSettings | null;
  site_id: string;
  generated_at: string;
  products: SiteSummaryProduct[];
  rollups?: SiteSummaryRollups;
}
