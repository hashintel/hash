export type ProductionScheduleStatus =
  | "selected"
  | "shared"
  | "other"
  | "open"
  | "unresolved";

export type ProductionScheduleConfidence = "exact" | "candidate" | "unresolved";

export type ProductionScheduleStartSource =
  | "charge_day"
  | "waterline"
  | "fill_day_fallback"
  | "afko_actual";

export type ProductionScheduleFinishSource = "fill_day" | "afko_actual";

export interface ProductionScheduleDailyPoint {
  date: string;
  value: number;
}

export interface ProductionScheduleOutputCandidate {
  material: string;
  batch: string | null;
  order: string;
  product_relation: "selected" | "other" | "unresolved";
  path: string[];
}

export interface ProductionScheduleDirectOutputCandidate {
  material: string;
  batch: string | null;
  order: string;
  output_date: string | null;
  quantity: number | null;
}

export interface ProductionScheduleAllocation {
  consuming_order: string | null;
  consumption_date: string | null;
  net_quantity: number;
  status: ProductionScheduleStatus;
  confidence: ProductionScheduleConfidence;
  reason: string;
  output_candidates: ProductionScheduleOutputCandidate[];
  direct_output_candidates?: ProductionScheduleDirectOutputCandidate[];
}

export type ProductionScheduleAllocationTotals = Record<
  ProductionScheduleStatus,
  number
>;

export interface ProductionScheduleBatch {
  id: string;
  material: string;
  batch: string | null;
  order: string;
  start: string;
  end: string;
  span_days: number;
  quantity: number | null;
  uom: string | null;
  campaign_core: string | null;
  campaign_id: string | null;
  building: string | null;
  start_source: ProductionScheduleStartSource;
  finish_source: ProductionScheduleFinishSource;
  derivation: string;
  allocation_status: ProductionScheduleStatus;
  allocations: ProductionScheduleAllocation[];
  allocation_totals: ProductionScheduleAllocationTotals;
  allocated_quantity: number;
  unallocated_quantity: number;
  allocation_tolerance: number;
  allocation_overage_quantity?: number;
  allocation_tolerance_reason: string;
}

export interface ProductionScheduleCampaign {
  campaign_core: string | null;
  campaign_id: string | null;
  building: string | null;
  daily_batch_counts: ProductionScheduleDailyPoint[];
  daily_fill_weights: ProductionScheduleDailyPoint[];
}

export interface ProductionScheduleLane {
  material: string;
  name: string;
  bom_depth: number;
  role: "finished_good" | "intermediate";
  uom: string | null;
  campaigns: ProductionScheduleCampaign[];
  batches: ProductionScheduleBatch[];
}

export interface ProductionScheduleConsumptionEvidence extends ProductionScheduleAllocation {
  source_batch_id: string;
  source_material: string;
  source_batch: string | null;
}

export interface ProductionScheduleSource {
  production_windows: string;
  cadence: string;
  allocations: string;
  order_outputs: string;
}

export interface ProductionSchedule {
  schema_version: "1.1";
  artifact_type: "production_schedule";
  artifact_version: "1.0" | "1.1";
  product_id: string;
  product_name: string;
  product_material: string;
  plant: string;
  quantity_tolerance: number;
  lanes: ProductionScheduleLane[];
  consumption_evidence: ProductionScheduleConsumptionEvidence[];
  source: ProductionScheduleSource;
}
