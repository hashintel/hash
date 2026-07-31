import { z } from "zod";

const nonEmptyString = z.string().min(1);
const nullableNonEmptyString = nonEmptyString.nullable();
const nonNegativeNumber = z.number().finite().nonnegative();
const isoDate = z.iso.date();

const provenanceSchema = z.strictObject({
  workbook: nonEmptyString.optional(),
  sheet: nonEmptyString.optional(),
  cell: nonEmptyString.optional(),
  raw_text: nonEmptyString.optional(),
  file: nonEmptyString.optional(),
});

export const siteTimelineTimingKindSchema = z.enum([
  "production_window",
  "receipt_event",
]);
export const siteTimelineStartSourceSchema = z.enum([
  "charge_day",
  "waterline",
  "fill_day_fallback",
  "afko_actual",
  "afko_prorated_from_receipt",
  "receipt_date",
  "first_recorded_exit",
]);
export const siteTimelineFinishSourceSchema = z.enum([
  "fill_day",
  "afko_actual",
  "receipt_date",
  "last_recorded_exit",
]);
export const siteTimelineLineConfidenceSchema = z.enum([
  "exact",
  "mapped",
  "candidate",
  "ambiguous",
  "unresolved",
]);
export const siteTimelineLineSourceSchema = z.enum([
  "campaign_sheet",
  "planning_gantt_order",
  "planning_gantt_campaign",
  "sap_order_operation",
  "sap_recipe_operation",
  "recipe_resource",
  "standard_lot",
  "planning_table",
  "unresolved",
]);
export const siteTimelineLineKindSchema = z.enum([
  "internal_line",
  "subcontract",
  "repack",
  "unknown",
]);
export const siteTimelineEdgeConfidenceSchema = z.enum([
  "exact",
  "candidate",
  "unresolved",
]);

export const siteTimelineBuildingSchema = z.strictObject({
  id: nonEmptyString,
  name: nonEmptyString,
});

export const siteTimelineLineSchema = z.strictObject({
  id: nonEmptyString,
  name: nonEmptyString,
  building_id: nullableNonEmptyString,
  aliases: z.array(nonEmptyString),
  kind: siteTimelineLineKindSchema,
  resource_ids: z.array(nonEmptyString),
});

export const siteTimelineResourceSchema = z.strictObject({
  id: nonEmptyString,
  name: nonEmptyString,
  line_id: nullableNonEmptyString,
  building_id: nullableNonEmptyString,
  cost_center: nullableNonEmptyString,
  equipment_name: nullableNonEmptyString,
  operation_category: nullableNonEmptyString,
  source: provenanceSchema,
});

export const siteTimelineProductFamilySchema = z.strictObject({
  bg_code: nullableNonEmptyString,
  bg_name: nullableNonEmptyString,
  group_code: nullableNonEmptyString,
  family_key: nonEmptyString,
  materials: z.array(nonEmptyString),
  default_line_ids: z.array(nonEmptyString),
  source: provenanceSchema,
});

export const siteTimelineProductSchema = z.strictObject({
  id: nonEmptyString,
  name: nonEmptyString,
  material: nonEmptyString,
});

export const siteTimelineBatchSchema = z.strictObject({
  id: nonEmptyString,
  material: nonEmptyString,
  material_name: nullableNonEmptyString.optional(),
  batch: nullableNonEmptyString,
  order: nullableNonEmptyString,
  start: isoDate,
  end: isoDate,
  span_days: z.number().int().positive(),
  quantity: z.number().finite().positive().nullable(),
  uom: nullableNonEmptyString,
  timing_kind: siteTimelineTimingKindSchema,
  start_source: siteTimelineStartSourceSchema,
  finish_source: siteTimelineFinishSourceSchema,
  derivation: nonEmptyString,
  building_id: nullableNonEmptyString,
  line_id: nullableNonEmptyString,
  line_raw: nullableNonEmptyString,
  line_source: siteTimelineLineSourceSchema,
  line_confidence: siteTimelineLineConfidenceSchema,
  candidate_line_ids: z.array(nonEmptyString),
  line_reason: nonEmptyString,
  resource_ids: z.array(nonEmptyString),
  campaign_core: nullableNonEmptyString,
  campaign_id: nullableNonEmptyString,
  product_family_key: nullableNonEmptyString,
  allocated_quantity: nonNegativeNumber,
  unallocated_quantity: nonNegativeNumber.nullable(),
  allocation_overage_quantity: nonNegativeNumber.nullable(),
  allocation_tolerance: z.number().finite().positive(),
  data_quality_flags: z.array(nonEmptyString),
});

const unresolvedOutputSchema = z.strictObject({
  material: nonEmptyString,
  batch: nullableNonEmptyString,
  output_date: isoDate.nullable(),
  quantity: z.number().finite().positive().nullable(),
});

export const siteTimelineConsumptionEdgeSchema = z.strictObject({
  id: nonEmptyString,
  source_batch_id: nonEmptyString,
  target_batch_id: nullableNonEmptyString,
  candidate_target_batch_ids: z.array(nonEmptyString),
  unresolved_outputs: z.array(unresolvedOutputSchema),
  consuming_order: nullableNonEmptyString,
  consumption_date: isoDate,
  quantity: z.number().finite().positive(),
  uom: nullableNonEmptyString,
  confidence: siteTimelineEdgeConfidenceSchema,
  reason: nonEmptyString,
  waiting_days: z.number().int(),
  evidence_ids: z.array(nonEmptyString),
});

const countRecordSchema = z.record(
  nonEmptyString,
  z.number().int().nonnegative(),
);

export const siteTimelineDataQualitySchema = z.strictObject({
  batch_count: z.number().int().nonnegative(),
  edge_count: z.number().int().nonnegative(),
  timing_kind_counts: countRecordSchema,
  line_confidence_counts: countRecordSchema,
  edge_confidence_counts: countRecordSchema,
  batches_with_allocation_overage: z.number().int().nonnegative(),
  batches_missing_family: z.number().int().nonnegative(),
  negative_waiting_intervals: z.number().int().nonnegative(),
  materials_with_multiple_lines: z.array(nonEmptyString),
  products_missing_family: z.array(nonEmptyString),
  unidentifiable_receipt_events: z.number().int().nonnegative(),
});

export const siteProductionTimelineSchema = z.strictObject({
  schema_version: z.literal("1.3"),
  artifact_type: z.literal("site_production_timeline"),
  artifact_version: z.literal("1.2"),
  site_id: nonEmptyString,
  plant: nonEmptyString,
  generated_at: z.iso.datetime({ offset: true }),
  date_bounds: z.strictObject({
    start: isoDate.nullable(),
    end: isoDate.nullable(),
  }),
  buildings: z.array(siteTimelineBuildingSchema),
  lines: z.array(siteTimelineLineSchema),
  resources: z.array(siteTimelineResourceSchema),
  product_families: z.array(siteTimelineProductFamilySchema),
  products: z.array(siteTimelineProductSchema),
  batches: z.array(siteTimelineBatchSchema),
  consumption_edges: z.array(siteTimelineConsumptionEdgeSchema),
  data_quality: siteTimelineDataQualitySchema,
  source: z.strictObject({
    production_windows: nonEmptyString,
    receipt_events: nonEmptyString,
    consumption_edges: nonEmptyString,
    metadata: z.record(nonEmptyString, z.string()),
    unidentifiable_receipt_events: z.number().int().nonnegative(),
    metadata_warnings: z.array(nonEmptyString).optional(),
    receipt_warnings: z.array(nonEmptyString).optional(),
  }),
});

export type SiteProductionTimeline = z.infer<
  typeof siteProductionTimelineSchema
>;
export type SiteTimelineBatch = z.infer<typeof siteTimelineBatchSchema>;
export type SiteTimelineBuilding = z.infer<typeof siteTimelineBuildingSchema>;
export type SiteTimelineLine = z.infer<typeof siteTimelineLineSchema>;
export type SiteTimelineProductFamily = z.infer<
  typeof siteTimelineProductFamilySchema
>;
export type SiteTimelineResource = z.infer<typeof siteTimelineResourceSchema>;
export type SiteTimelineLineConfidence = z.infer<
  typeof siteTimelineLineConfidenceSchema
>;
export type SiteTimelineTimingKind = z.infer<
  typeof siteTimelineTimingKindSchema
>;
