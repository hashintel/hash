// oxlint-disable max-lines -- a single contract validator whose reconciliation rules read best as one top-to-bottom module
import { z } from "zod";

import { siteProductionTimelineSchema } from "./schema.js";

import type { SiteProductionTimeline } from "./schema.js";

const DayMs = 86_400_000;

const inclusiveSpanDays = (start: string, end: string): number =>
  Math.floor(
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DayMs,
  ) + 1;

const addIssue = (
  context: z.RefinementCtx,
  path: (string | number)[],
  message: string,
): void => {
  context.addIssue({ code: "custom", message, path });
};

const uniqueIds = (
  values: readonly { id: string }[],
  path: string,
  context: z.RefinementCtx,
): Set<string> => {
  const seen = new Set<string>();
  for (const [index, { id }] of values.entries()) {
    if (seen.has(id)) {
      addIssue(context, [path, index, "id"], `${path} id must be unique`);
    }
    seen.add(id);
  }
  return seen;
};

const countBy = <Value>(
  values: readonly Value[],
  key: (value: Value) => string,
): Record<string, number> => {
  const counts = new Map<string, number>();
  for (const value of values) {
    const valueKey = key(value);
    counts.set(valueKey, (counts.get(valueKey) ?? 0) + 1);
  }
  return Object.fromEntries(
    [...counts].toSorted(([left], [right]) => left.localeCompare(right)),
  );
};

const sameCountRecord = (
  actual: Record<string, number>,
  expected: Record<string, number>,
): boolean =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(actual).toSorted(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  ) === JSON.stringify(expected);

/** Whether the values are already unique and in sorted order. */
const isUniqueAndSorted = (values: readonly string[]): boolean =>
  values.join("\0") === [...new Set(values)].toSorted().join("\0");

type Timeline = SiteProductionTimeline;
type Batch = Timeline["batches"][number];
type Edge = Timeline["consumption_edges"][number];
type DataQuality = Timeline["data_quality"];

interface ReferenceIds {
  buildingIds: ReadonlySet<string>;
  lineIds: ReadonlySet<string>;
  resourceIds: ReadonlySet<string>;
  familyIds: ReadonlySet<string>;
}

interface BatchCheck {
  batch: Batch;
  index: number;
  context: z.RefinementCtx;
  referenceIds: ReferenceIds;
  familyByMaterial: ReadonlyMap<string, string>;
  dateBounds: Timeline["date_bounds"];
}

interface EdgeCheck {
  edge: Edge;
  index: number;
  context: z.RefinementCtx;
  batchIds: ReadonlySet<string>;
}

const checkDateBounds = (
  timeline: Timeline,
  context: z.RefinementCtx,
): void => {
  const { start: boundsStart, end: boundsEnd } = timeline.date_bounds;
  if ((boundsStart === null) !== (boundsEnd === null)) {
    addIssue(
      context,
      ["date_bounds"],
      "date bounds start and end must either both be null or both be ISO dates",
    );
  } else if (
    boundsStart !== null &&
    boundsEnd !== null &&
    boundsStart > boundsEnd
  ) {
    addIssue(
      context,
      ["date_bounds", "start"],
      "date bounds start must not be after end",
    );
  }
};

const checkLines = (
  timeline: Timeline,
  context: z.RefinementCtx,
  referenceIds: ReferenceIds,
): void => {
  for (const [index, line] of timeline.lines.entries()) {
    if (
      line.building_id !== null &&
      !referenceIds.buildingIds.has(line.building_id)
    ) {
      addIssue(
        context,
        ["lines", index, "building_id"],
        "line building_id must identify an existing building",
      );
    }
    for (const resourceId of line.resource_ids) {
      if (!referenceIds.resourceIds.has(resourceId)) {
        addIssue(
          context,
          ["lines", index, "resource_ids"],
          "line resource_ids must identify existing resources",
        );
      }
    }
  }
};

const checkResources = (
  timeline: Timeline,
  context: z.RefinementCtx,
  referenceIds: ReferenceIds,
): void => {
  for (const [index, resource] of timeline.resources.entries()) {
    if (
      resource.line_id !== null &&
      !referenceIds.lineIds.has(resource.line_id)
    ) {
      addIssue(
        context,
        ["resources", index, "line_id"],
        "resource line_id must identify an existing line",
      );
    }
    if (
      resource.building_id !== null &&
      !referenceIds.buildingIds.has(resource.building_id)
    ) {
      addIssue(
        context,
        ["resources", index, "building_id"],
        "resource building_id must identify an existing building",
      );
    }
  }
};

const checkFamilies = (
  timeline: Timeline,
  context: z.RefinementCtx,
  lineIds: ReadonlySet<string>,
): void => {
  for (const [index, family] of timeline.product_families.entries()) {
    if (family.materials.length === 0 || !isUniqueAndSorted(family.materials)) {
      addIssue(
        context,
        ["product_families", index, "materials"],
        "family materials must be non-empty, unique and sorted",
      );
    }
    if (
      new Set(family.default_line_ids).size !== family.default_line_ids.length
    ) {
      addIssue(
        context,
        ["product_families", index, "default_line_ids"],
        "default line ids must be unique",
      );
    }
    for (const lineId of family.default_line_ids) {
      if (!lineIds.has(lineId)) {
        addIssue(
          context,
          ["product_families", index, "default_line_ids"],
          "default line ids must identify existing lines",
        );
      }
    }
  }
};

const mapFamiliesByMaterial = (
  timeline: Timeline,
  context: z.RefinementCtx,
): Map<string, string> => {
  const familyByMaterial = new Map<string, string>();
  for (const [index, family] of timeline.product_families.entries()) {
    for (const material of family.materials) {
      if (familyByMaterial.has(material)) {
        addIssue(
          context,
          ["product_families", index, "materials"],
          "a material may belong to only one product family",
        );
      }
      familyByMaterial.set(material, family.family_key);
    }
  }
  return familyByMaterial;
};

const checkBatchTiming = ({
  batch,
  index,
  context,
  dateBounds,
}: BatchCheck): void => {
  if (batch.start > batch.end) {
    addIssue(
      context,
      ["batches", index, "start"],
      "batch start must not be after end",
    );
  }
  if (batch.span_days !== inclusiveSpanDays(batch.start, batch.end)) {
    addIssue(
      context,
      ["batches", index, "span_days"],
      "span_days must equal the inclusive start/end span",
    );
  }
  if (
    batch.timing_kind === "receipt_event" &&
    (batch.start !== batch.end || batch.span_days !== 1)
  ) {
    addIssue(
      context,
      ["batches", index, "timing_kind"],
      "receipt_event must be a one-day point event",
    );
  }
  if (
    dateBounds.start !== null &&
    dateBounds.end !== null &&
    (batch.start < dateBounds.start || batch.end > dateBounds.end)
  ) {
    addIssue(
      context,
      ["batches", index, "start"],
      "batch dates must be within artifact date bounds",
    );
  }
};

const checkBatchLine = ({
  batch,
  index,
  context,
  referenceIds,
}: BatchCheck): void => {
  if (batch.line_id !== null && !referenceIds.lineIds.has(batch.line_id)) {
    addIssue(
      context,
      ["batches", index, "line_id"],
      "batch line_id must identify an existing line",
    );
  }
  if (
    (batch.line_confidence === "exact" || batch.line_confidence === "mapped") &&
    (batch.line_id === null || batch.candidate_line_ids.length > 0)
  ) {
    addIssue(
      context,
      ["batches", index, "line_confidence"],
      "exact or mapped line confidence requires one line_id and no candidates",
    );
  }
  if (
    (batch.line_confidence === "candidate" ||
      batch.line_confidence === "ambiguous" ||
      batch.line_confidence === "unresolved") &&
    batch.line_id !== null
  ) {
    addIssue(
      context,
      ["batches", index, "line_id"],
      "uncertain line confidence must not claim a line_id",
    );
  }
  if (
    batch.building_id !== null &&
    !referenceIds.buildingIds.has(batch.building_id)
  ) {
    addIssue(
      context,
      ["batches", index, "building_id"],
      "batch building_id must identify an existing building",
    );
  }
};

const checkBatchFamily = ({
  batch,
  index,
  context,
  referenceIds,
  familyByMaterial,
}: BatchCheck): void => {
  if (
    batch.product_family_key !== null &&
    !referenceIds.familyIds.has(batch.product_family_key)
  ) {
    addIssue(
      context,
      ["batches", index, "product_family_key"],
      "batch product_family_key must identify an existing family",
    );
  }
  if (
    batch.product_family_key !== null &&
    familyByMaterial.get(batch.material) !== batch.product_family_key
  ) {
    addIssue(
      context,
      ["batches", index, "product_family_key"],
      "batch material must belong to its product family",
    );
  }
};

const checkBatchReferences = ({
  batch,
  index,
  context,
  referenceIds,
}: BatchCheck): void => {
  if (
    new Set(batch.candidate_line_ids).size !== batch.candidate_line_ids.length
  ) {
    addIssue(
      context,
      ["batches", index, "candidate_line_ids"],
      "candidate line ids must be unique",
    );
  }
  for (const lineId of batch.candidate_line_ids) {
    if (!referenceIds.lineIds.has(lineId)) {
      addIssue(
        context,
        ["batches", index, "candidate_line_ids"],
        "candidate line ids must identify existing lines",
      );
    }
  }
  for (const resourceId of batch.resource_ids) {
    if (!referenceIds.resourceIds.has(resourceId)) {
      addIssue(
        context,
        ["batches", index, "resource_ids"],
        "batch resource_ids must identify existing resources",
      );
    }
  }
};

const checkBatches = (
  timeline: Timeline,
  context: z.RefinementCtx,
  checkContext: Omit<BatchCheck, "batch" | "index" | "context">,
): void => {
  for (const [index, batch] of timeline.batches.entries()) {
    const check = { ...checkContext, batch, index, context };
    checkBatchTiming(check);
    checkBatchLine(check);
    checkBatchFamily(check);
    checkBatchReferences(check);
  }
};

const checkEdgeTargets = ({
  edge,
  index,
  context,
  batchIds,
}: EdgeCheck): void => {
  if (!batchIds.has(edge.source_batch_id)) {
    addIssue(
      context,
      ["consumption_edges", index, "source_batch_id"],
      "source_batch_id must identify an existing batch",
    );
  }
  const targets = [...edge.candidate_target_batch_ids];
  if (edge.target_batch_id !== null && edge.target_batch_id !== "") {
    targets.unshift(edge.target_batch_id);
  }
  for (const targetId of targets) {
    if (!batchIds.has(targetId)) {
      addIssue(
        context,
        ["consumption_edges", index, "target_batch_id"],
        "edge targets must identify existing batches",
      );
    }
  }
};

const checkEdgeConfidence = ({ edge, index, context }: EdgeCheck): void => {
  if (
    edge.confidence === "exact" &&
    (edge.target_batch_id === null ||
      edge.candidate_target_batch_ids.length > 0 ||
      edge.unresolved_outputs.length > 0)
  ) {
    addIssue(
      context,
      ["consumption_edges", index, "confidence"],
      "exact edge requires one target and no candidate metadata",
    );
  }
  if (edge.confidence !== "exact" && edge.target_batch_id !== null) {
    addIssue(
      context,
      ["consumption_edges", index, "target_batch_id"],
      "non-exact edge must not claim a target_batch_id",
    );
  }
  if (
    edge.confidence === "candidate" &&
    edge.candidate_target_batch_ids.length === 0 &&
    edge.unresolved_outputs.length === 0
  ) {
    addIssue(
      context,
      ["consumption_edges", index, "confidence"],
      "candidate edge requires candidates or unresolved outputs",
    );
  }
  if (
    edge.confidence === "unresolved" &&
    (edge.candidate_target_batch_ids.length > 0 ||
      edge.unresolved_outputs.length > 0)
  ) {
    addIssue(
      context,
      ["consumption_edges", index, "confidence"],
      "unresolved edge must not claim output candidates",
    );
  }
  if (!isUniqueAndSorted(edge.candidate_target_batch_ids)) {
    addIssue(
      context,
      ["consumption_edges", index, "candidate_target_batch_ids"],
      "candidate target ids must be unique and sorted",
    );
  }
};

/** Checks every consumption edge, returning the quantity each source batch has allocated. */
const checkEdges = (
  timeline: Timeline,
  context: z.RefinementCtx,
  batchIds: ReadonlySet<string>,
): Map<string, number> => {
  const allocatedByBatch = new Map<string, number>();
  for (const [index, edge] of timeline.consumption_edges.entries()) {
    const check = { edge, index, context, batchIds };
    checkEdgeTargets(check);
    checkEdgeConfidence(check);
    allocatedByBatch.set(
      edge.source_batch_id,
      (allocatedByBatch.get(edge.source_batch_id) ?? 0) + edge.quantity,
    );
  }
  return allocatedByBatch;
};

const expectedAllocation = (
  batch: Batch,
  allocated: number,
): { unallocated: number | null; overage: number } => {
  if (batch.quantity === null) {
    return { unallocated: batch.unallocated_quantity, overage: 0 };
  }
  return {
    unallocated: Math.max(0, batch.quantity - allocated),
    overage: Math.max(0, allocated - batch.quantity),
  };
};

const allocationReconciles = (batch: Batch, allocated: number): boolean => {
  const tolerance = batch.allocation_tolerance + Number.EPSILON;
  const { unallocated, overage } = expectedAllocation(batch, allocated);
  if (Math.abs(batch.allocated_quantity - allocated) > tolerance) {
    return false;
  }
  if (
    unallocated !== null &&
    (batch.unallocated_quantity === null ||
      Math.abs(batch.unallocated_quantity - unallocated) > tolerance)
  ) {
    return false;
  }
  return !(
    batch.quantity !== null &&
    (batch.allocation_overage_quantity === null ||
      Math.abs(batch.allocation_overage_quantity - overage) > tolerance)
  );
};

/** Checks each batch's allocation totals, returning how many batches are over-allocated. */
const checkAllocations = (
  timeline: Timeline,
  context: z.RefinementCtx,
  allocatedByBatch: ReadonlyMap<string, number>,
): number => {
  let batchesWithAllocationOverage = 0;
  for (const [index, batch] of timeline.batches.entries()) {
    const allocated = allocatedByBatch.get(batch.id) ?? 0;
    const { overage } = expectedAllocation(batch, allocated);
    if (batch.quantity !== null && overage > batch.allocation_tolerance) {
      batchesWithAllocationOverage += 1;
    }
    if (!allocationReconciles(batch, allocated)) {
      addIssue(
        context,
        ["batches", index, "allocated_quantity"],
        "batch allocation totals must reconcile with consumption edges",
      );
    }
  }
  return batchesWithAllocationOverage;
};

const checkExpectedDateBounds = (
  timeline: Timeline,
  context: z.RefinementCtx,
): void => {
  const { start: boundsStart, end: boundsEnd } = timeline.date_bounds;
  const [firstBatch] = timeline.batches;

  if (firstBatch === undefined) {
    if (boundsStart !== null || boundsEnd !== null) {
      addIssue(
        context,
        ["date_bounds"],
        "empty artifacts must have null date bounds",
      );
    }
    return;
  }

  let expectedBoundsStart = firstBatch.start;
  let expectedBoundsEnd = firstBatch.end;
  for (const batch of timeline.batches) {
    if (batch.start < expectedBoundsStart) {
      expectedBoundsStart = batch.start;
    }
    if (batch.end > expectedBoundsEnd) {
      expectedBoundsEnd = batch.end;
    }
  }
  if (boundsStart !== expectedBoundsStart || boundsEnd !== expectedBoundsEnd) {
    addIssue(
      context,
      ["date_bounds"],
      "non-empty artifact bounds must equal the minimum batch start and maximum batch end",
    );
  }
};

const materialsWithMultipleLines = (timeline: Timeline): string[] => {
  const materials = new Set(
    timeline.batches
      .filter((batch) => batch.line_id !== null)
      .map((batch) => batch.material),
  );
  return [...materials]
    .filter(
      (material) =>
        new Set(
          timeline.batches
            .filter(
              (batch) => batch.material === material && batch.line_id !== null,
            )
            .map((batch) => batch.line_id),
        ).size > 1,
    )
    .toSorted();
};

const expectedDataQuality = (
  timeline: Timeline,
  batchesWithAllocationOverage: number,
  familyByMaterial: ReadonlyMap<string, string>,
): DataQuality => ({
  batch_count: timeline.batches.length,
  edge_count: timeline.consumption_edges.length,
  timing_kind_counts: countBy(timeline.batches, (batch) => batch.timing_kind),
  line_confidence_counts: countBy(
    timeline.batches,
    (batch) => batch.line_confidence,
  ),
  edge_confidence_counts: countBy(
    timeline.consumption_edges,
    (edge) => edge.confidence,
  ),
  batches_with_allocation_overage: batchesWithAllocationOverage,
  batches_missing_family: timeline.batches.filter(
    (batch) => batch.product_family_key === null,
  ).length,
  negative_waiting_intervals: timeline.consumption_edges.filter(
    (edge) => edge.waiting_days < 0,
  ).length,
  unidentifiable_receipt_events: timeline.source.unidentifiable_receipt_events,
  materials_with_multiple_lines: materialsWithMultipleLines(timeline),
  products_missing_family: timeline.products
    .filter((product) => !familyByMaterial.has(product.material))
    .map((product) => product.id)
    .toSorted(),
});

const sameQualityTotals = (
  actual: DataQuality,
  expected: DataQuality,
): boolean =>
  actual.batch_count === expected.batch_count &&
  actual.edge_count === expected.edge_count &&
  actual.batches_with_allocation_overage ===
    expected.batches_with_allocation_overage &&
  actual.batches_missing_family === expected.batches_missing_family &&
  actual.negative_waiting_intervals === expected.negative_waiting_intervals &&
  actual.unidentifiable_receipt_events ===
    expected.unidentifiable_receipt_events;

const sameQualityBreakdowns = (
  actual: DataQuality,
  expected: DataQuality,
): boolean =>
  sameCountRecord(actual.timing_kind_counts, expected.timing_kind_counts) &&
  sameCountRecord(
    actual.line_confidence_counts,
    expected.line_confidence_counts,
  ) &&
  sameCountRecord(
    actual.edge_confidence_counts,
    expected.edge_confidence_counts,
  ) &&
  actual.materials_with_multiple_lines.join("\0") ===
    expected.materials_with_multiple_lines.join("\0") &&
  actual.products_missing_family.join("\0") ===
    expected.products_missing_family.join("\0");

export const validatedSiteProductionTimelineSchema =
  siteProductionTimelineSchema.superRefine((timeline, context) => {
    checkDateBounds(timeline, context);

    const referenceIds: ReferenceIds = {
      buildingIds: uniqueIds(timeline.buildings, "buildings", context),
      lineIds: uniqueIds(timeline.lines, "lines", context),
      resourceIds: uniqueIds(timeline.resources, "resources", context),
      familyIds: uniqueIds(
        timeline.product_families.map((family) => ({
          id: family.family_key,
        })),
        "product_families",
        context,
      ),
    };
    uniqueIds(timeline.products, "products", context);
    const batchIds = uniqueIds(timeline.batches, "batches", context);
    uniqueIds(timeline.consumption_edges, "consumption_edges", context);

    checkLines(timeline, context, referenceIds);
    checkResources(timeline, context, referenceIds);
    checkFamilies(timeline, context, referenceIds.lineIds);

    const familyByMaterial = mapFamiliesByMaterial(timeline, context);

    checkBatches(timeline, context, {
      referenceIds,
      familyByMaterial,
      dateBounds: timeline.date_bounds,
    });

    const allocatedByBatch = checkEdges(timeline, context, batchIds);
    const batchesWithAllocationOverage = checkAllocations(
      timeline,
      context,
      allocatedByBatch,
    );

    checkExpectedDateBounds(timeline, context);

    const expectedQuality = expectedDataQuality(
      timeline,
      batchesWithAllocationOverage,
      familyByMaterial,
    );
    if (
      !sameQualityTotals(timeline.data_quality, expectedQuality) ||
      !sameQualityBreakdowns(timeline.data_quality, expectedQuality)
    ) {
      addIssue(
        context,
        ["data_quality"],
        "data quality totals must reconcile with artifact contents",
      );
    }
  });

interface UnsupportedVersions {
  // oxlint-disable-next-line typescript/no-restricted-types -- read from untrusted JSON before it is validated
  artifact_version?: unknown;
  // oxlint-disable-next-line typescript/no-restricted-types -- read from untrusted JSON before it is validated
  schema_version?: unknown;
}

/** Describes each contract version in `value` that this parser does not support. */
const unsupportedVersions = (versions: UnsupportedVersions): string[] => {
  const unsupported: string[] = [];
  if (versions.schema_version !== "1.3") {
    unsupported.push(
      `shared schema version ${String(versions.schema_version)} (supported: 1.3)`,
    );
  }
  if (versions.artifact_version !== "1.2") {
    unsupported.push(
      `site timeline artifact version ${String(versions.artifact_version)} (supported: 1.2)`,
    );
  }
  return unsupported;
};

export const parseSiteProductionTimeline = (
  // oxlint-disable-next-line typescript/no-restricted-types -- the value is parsed JSON of unknown shape, validated here
  value: unknown,
  // oxlint-disable-next-line hash/prefer-options-object -- public signature already used by callers in hash-api and hash-frontend
  siteId?: string,
): SiteProductionTimeline => {
  if (typeof value === "object" && value !== null) {
    const unsupported = unsupportedVersions({
      schema_version:
        "schema_version" in value ? value.schema_version : undefined,
      artifact_version:
        "artifact_version" in value ? value.artifact_version : undefined,
    });
    if (unsupported.length > 0) {
      throw new Error(
        `Unsupported site production timeline contract: ${unsupported.join("; ")}`,
      );
    }
  }
  const timeline = validatedSiteProductionTimelineSchema.parse(value);
  if (siteId !== undefined && timeline.site_id !== siteId) {
    throw new z.ZodError([
      {
        code: "custom",
        message: `site_id must equal ${siteId}`,
        path: ["site_id"],
      },
    ]);
  }
  return timeline;
};

export type SafeParseSiteProductionTimelineResult =
  | { success: true; data: SiteProductionTimeline }
  // oxlint-disable-next-line typescript/no-restricted-types -- the error is whatever was thrown while parsing
  | { success: false; error: unknown };

export const safeParseSiteProductionTimeline = (
  // oxlint-disable-next-line typescript/no-restricted-types -- the value is parsed JSON of unknown shape, validated by the parser
  value: unknown,
  // oxlint-disable-next-line hash/prefer-options-object -- public signature already used by callers
  siteId?: string,
): SafeParseSiteProductionTimelineResult => {
  try {
    return {
      success: true,
      data: parseSiteProductionTimeline(value, siteId),
    };
  } catch (error) {
    return { success: false, error };
  }
};
