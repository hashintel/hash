import { z } from "zod";

const nonEmptyString = z.string().min(1);
const nullableNonEmptyString = nonEmptyString.nullable();
const nonNegativeNumber = z.number().finite().nonnegative();
const positiveNumber = z.number().finite().positive();
const isoDate = z.iso.date();

export const productionScheduleStatusSchema = z.enum([
  "selected",
  "shared",
  "other",
  "open",
  "unresolved",
]);
export const productionScheduleEventStatusSchema = z.enum([
  "selected",
  "shared",
  "other",
  "unresolved",
]);
export const productionScheduleConfidenceSchema = z.enum([
  "exact",
  "candidate",
  "unresolved",
]);
export const productionScheduleRoleSchema = z.enum([
  "finished_good",
  "intermediate",
  "raw_material",
]);
export const productionScheduleStartSourceSchema = z.enum([
  "charge_day",
  "waterline",
  "fill_day_fallback",
  "afko_actual",
  "afko_prorated_from_receipt",
  "receipt_date",
  "first_recorded_exit",
]);
export const productionScheduleFinishSourceSchema = z.enum([
  "fill_day",
  "afko_actual",
  "receipt_date",
  "last_recorded_exit",
]);
export const productionScheduleTimingKindSchema = z.enum([
  "production_window",
  "receipt_event",
  "lifecycle_only",
]);
const episodeScopeSchema = z.enum([
  "in_episode",
  "pre_receipt",
  "post_depletion",
]);

export const productionScheduleDailyPointSchema = z.strictObject({
  date: isoDate,
  value: nonNegativeNumber,
});

export const productionScheduleCampaignSchema = z.strictObject({
  campaign_core: z.string().nullable(),
  campaign_id: z.string().nullable(),
  building: z.string().nullable(),
  daily_batch_counts: z.array(productionScheduleDailyPointSchema),
  daily_fill_weights: z.array(productionScheduleDailyPointSchema),
});

export const productionScheduleOutputCandidateSchema = z.strictObject({
  material: nonEmptyString,
  batch: nullableNonEmptyString,
  order: nonEmptyString,
  product_relation: z.enum(["selected", "other", "unresolved"]),
  path: z.array(nonEmptyString),
});

export const productionScheduleDirectOutputCandidateSchema = z.strictObject({
  material: nonEmptyString,
  batch: nullableNonEmptyString,
  order: nonEmptyString,
  output_date: isoDate.nullable(),
  quantity: positiveNumber.nullable(),
});

export const productionScheduleAllocationSchema = z.strictObject({
  event_id: nonEmptyString.optional(),
  direct_consumer_materials: z.array(nonEmptyString).optional(),
  consuming_order: nullableNonEmptyString,
  consumption_date: isoDate.nullable(),
  net_quantity: nonNegativeNumber,
  status: productionScheduleStatusSchema,
  confidence: productionScheduleConfidenceSchema,
  reason: nonEmptyString,
  output_candidates: z.array(productionScheduleOutputCandidateSchema),
  direct_output_candidates: z
    .array(productionScheduleDirectOutputCandidateSchema)
    .optional(),
});

const allocationTotalsSchema = z.strictObject({
  selected: nonNegativeNumber,
  shared: nonNegativeNumber,
  other: nonNegativeNumber,
  open: nonNegativeNumber,
  unresolved: nonNegativeNumber,
});

const batchBaseShape = {
  id: nonEmptyString,
  material: nonEmptyString,
  batch: nullableNonEmptyString,
  order: nullableNonEmptyString,
  start: isoDate,
  end: isoDate,
  span_days: z.number().int().positive(),
  quantity: positiveNumber.nullable(),
  uom: z.string().nullable(),
  campaign_core: z.string().nullable(),
  campaign_id: z.string().nullable(),
  building: z.string().nullable(),
  start_source: productionScheduleStartSourceSchema,
  finish_source: productionScheduleFinishSourceSchema,
  derivation: nonEmptyString,
  allocation_status: productionScheduleStatusSchema,
  allocation_totals: allocationTotalsSchema,
  allocated_quantity: nonNegativeNumber,
  unallocated_quantity: nonNegativeNumber,
  allocation_tolerance: positiveNumber,
  allocation_tolerance_reason: nonEmptyString,
} as const;

export const productionScheduleLegacyBatchSchema = z.strictObject({
  ...batchBaseShape,
  timing_kind: productionScheduleTimingKindSchema.optional(),
  allocation_overage_quantity: nonNegativeNumber.optional(),
  allocations: z.array(productionScheduleAllocationSchema),
  lifecycle_start: isoDate.optional(),
  lifecycle_end: isoDate.optional(),
  lifecycle_end_reason: z
    .enum(["depleted", "open", "last_evidence"])
    .optional(),
  remaining_quantity: nonNegativeNumber.optional(),
  last_exit_date: isoDate.nullable().optional(),
});

export const productionScheduleV12BatchSchema = z.strictObject({
  ...batchBaseShape,
  timing_kind: productionScheduleTimingKindSchema,
  allocation_overage_quantity: nonNegativeNumber,
  consumption_event_ids: z.array(nonEmptyString),
  lifecycle_start: isoDate,
  lifecycle_end: isoDate,
  lifecycle_end_reason: z.enum(["depleted", "open", "last_evidence"]),
  lifecycle_balance_status: z.enum([
    "balanced",
    "over_depleted",
    "unknown_opening_balance",
  ]),
  lifecycle_overage_quantity: nonNegativeNumber,
  remaining_quantity: nonNegativeNumber.nullable(),
  last_exit_date: isoDate.nullable(),
  lifecycle_exit_quantity: nonNegativeNumber,
});

const laneShape = {
  material: nonEmptyString,
  name: nonEmptyString,
  bom_depth: z.number().int().nonnegative(),
  role: productionScheduleRoleSchema,
  uom: z.string().nullable(),
  campaigns: z.array(productionScheduleCampaignSchema),
} as const;

export const productionScheduleLegacyLaneSchema = z.strictObject({
  ...laneShape,
  batches: z.array(productionScheduleLegacyBatchSchema),
});

export const productionScheduleV12LaneSchema = z.strictObject({
  ...laneShape,
  batches: z.array(productionScheduleV12BatchSchema),
});

export const productionScheduleConsumptionEvidenceSchema =
  productionScheduleAllocationSchema.extend({
    source_batch_id: nonEmptyString,
    source_material: nonEmptyString,
    source_batch: nullableNonEmptyString,
  });

export const productionScheduleConsumptionEventSchema = z.strictObject({
  id: nonEmptyString,
  source_batch_id: nonEmptyString,
  consuming_order: nullableNonEmptyString,
  consumption_date: isoDate,
  episode_scope: episodeScopeSchema,
  net_quantity: positiveNumber,
  status: productionScheduleEventStatusSchema,
  confidence: productionScheduleConfidenceSchema,
  reason: nonEmptyString,
  direct_consumer_materials: z.array(nonEmptyString),
});

export const productionScheduleBatchLinkSchema = z.strictObject({
  id: nonEmptyString,
  event_id: nonEmptyString,
  target_batch_ids: z.array(nonEmptyString).min(1),
});

export const productionScheduleDeliverySchema = z.strictObject({
  delivery_number: nonEmptyString,
  delivery_item: nonEmptyString,
  shipment_number: nonEmptyString.optional(),
  ship_to: nonEmptyString.optional(),
  sold_to: nonEmptyString.optional(),
  customer_name: nonEmptyString.optional(),
  customer_city: nonEmptyString.optional(),
  customer_country: nonEmptyString.optional(),
  incoterms_1: nonEmptyString.optional(),
  incoterms_2: nonEmptyString.optional(),
  shipping_point: nonEmptyString.optional(),
  shipment_type: nonEmptyString.optional(),
  service_agent: nonEmptyString.optional(),
  destination_class: nonEmptyString.optional(),
  quantity: positiveNumber.optional(),
  uom: nonEmptyString.optional(),
  departure_date: isoDate.optional(),
  actual_arrival_date: isoDate.optional(),
  planned_arrival_date: isoDate.optional(),
  arrival_date: isoDate.optional(),
  arrival_source: nonEmptyString.optional(),
});

export const productionScheduleDispatchEventSchema = z.strictObject({
  id: nonEmptyString,
  batch_id: nonEmptyString,
  material: nonEmptyString,
  batch: nonEmptyString,
  dispatch_date: isoDate,
  quantity: positiveNumber,
  uom: nullableNonEmptyString,
  bwart: z.literal("601"),
  episode_scope: episodeScopeSchema,
  delivery_coverage: z.enum([
    "exact",
    "partial",
    "over",
    "uom_incomparable",
    "none",
  ]),
  deliveries: z.array(productionScheduleDeliverySchema),
});

const scheduleBaseShape = {
  schema_version: z.literal("1.1"),
  artifact_type: z.literal("production_schedule"),
  product_id: nonEmptyString,
  product_name: nonEmptyString,
  product_material: nonEmptyString,
  plant: nonEmptyString,
  quantity_tolerance: positiveNumber,
  material_names: z.record(nonEmptyString, nonEmptyString).optional(),
} as const;

const sourceBaseShape = {
  production_windows: nonEmptyString,
  cadence: nonEmptyString,
  order_outputs: nonEmptyString,
  dispatches: nonEmptyString.optional(),
} as const;

export const productionScheduleLegacySchema = z.strictObject({
  ...scheduleBaseShape,
  artifact_version: z.union([z.literal("1.0"), z.literal("1.1")]),
  lanes: z.array(productionScheduleLegacyLaneSchema).min(1),
  consumption_evidence: z.array(productionScheduleConsumptionEvidenceSchema),
  dispatch_events: z.array(productionScheduleDispatchEventSchema).optional(),
  source: z.strictObject({
    ...sourceBaseShape,
    allocations: nonEmptyString,
  }),
});

export const productionScheduleV12Schema = z.strictObject({
  ...scheduleBaseShape,
  artifact_version: z.literal("1.2"),
  lanes: z.array(productionScheduleV12LaneSchema).min(1),
  consumption_events: z.array(productionScheduleConsumptionEventSchema),
  batch_links: z.array(productionScheduleBatchLinkSchema),
  dispatch_events: z.array(productionScheduleDispatchEventSchema),
  source: z.strictObject({
    ...sourceBaseShape,
    consumption_events: nonEmptyString,
  }),
});

export const productionScheduleSchema = z.discriminatedUnion(
  "artifact_version",
  [productionScheduleLegacySchema, productionScheduleV12Schema],
);

export type ProductionScheduleStatus = z.infer<
  typeof productionScheduleStatusSchema
>;
export type ProductionScheduleEventStatus = z.infer<
  typeof productionScheduleEventStatusSchema
>;
export type ProductionScheduleConfidence = z.infer<
  typeof productionScheduleConfidenceSchema
>;
export type ProductionScheduleRole = z.infer<
  typeof productionScheduleRoleSchema
>;
export type ProductionScheduleStartSource = z.infer<
  typeof productionScheduleStartSourceSchema
>;
export type ProductionScheduleFinishSource = z.infer<
  typeof productionScheduleFinishSourceSchema
>;
export type ProductionScheduleTimingKind = z.infer<
  typeof productionScheduleTimingKindSchema
>;
export type ProductionScheduleDailyPoint = z.infer<
  typeof productionScheduleDailyPointSchema
>;
export type ProductionScheduleOutputCandidate = z.infer<
  typeof productionScheduleOutputCandidateSchema
>;
export type ProductionScheduleDirectOutputCandidate = z.infer<
  typeof productionScheduleDirectOutputCandidateSchema
>;
export type ProductionScheduleAllocation = z.infer<
  typeof productionScheduleAllocationSchema
>;
export type ProductionScheduleAllocationTotals = z.infer<
  typeof allocationTotalsSchema
>;
export type ProductionScheduleLegacyBatch = z.infer<
  typeof productionScheduleLegacyBatchSchema
>;
export type ProductionScheduleV12Batch = z.infer<
  typeof productionScheduleV12BatchSchema
>;
export type ProductionScheduleBatch =
  | ProductionScheduleLegacyBatch
  | ProductionScheduleV12Batch;
export type ProductionScheduleCampaign = z.infer<
  typeof productionScheduleCampaignSchema
>;
type ProductionScheduleLaneBase = Omit<
  z.infer<typeof productionScheduleV12LaneSchema>,
  "batches"
>;
export type ProductionScheduleLane<
  Batch extends ProductionScheduleBatch = ProductionScheduleBatch,
> = ProductionScheduleLaneBase & { batches: Batch[] };
export type ProductionScheduleConsumptionEvidence = z.infer<
  typeof productionScheduleConsumptionEvidenceSchema
>;
export type ProductionScheduleConsumptionEvent = z.infer<
  typeof productionScheduleConsumptionEventSchema
>;
export type ProductionScheduleBatchLink = z.infer<
  typeof productionScheduleBatchLinkSchema
>;
export type ProductionScheduleDelivery = z.infer<
  typeof productionScheduleDeliverySchema
>;
export type ProductionScheduleDispatchEvent = z.infer<
  typeof productionScheduleDispatchEventSchema
>;
export type ProductionScheduleLegacySource = z.infer<
  typeof productionScheduleLegacySchema.shape.source
>;
export type ProductionScheduleV12Source = z.infer<
  typeof productionScheduleV12Schema.shape.source
>;
export type ProductionScheduleLegacy = Omit<
  z.infer<typeof productionScheduleLegacySchema>,
  "lanes"
> & {
  lanes: ProductionScheduleLane<ProductionScheduleLegacyBatch>[];
};
export type ProductionScheduleV12 = Omit<
  z.infer<typeof productionScheduleV12Schema>,
  "lanes"
> & {
  lanes: ProductionScheduleLane<ProductionScheduleV12Batch>[];
};
export type ProductionSchedule =
  | ProductionScheduleLegacy
  | ProductionScheduleV12;
