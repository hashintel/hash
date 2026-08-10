import { z } from "zod";

import { siteProductionTimelineSchema } from "./schema.js";

import type { SiteProductionTimeline } from "./schema.js";

const DAY_MS = 86_400_000;

const inclusiveSpanDays = (start: string, end: string): number =>
  Math.floor(
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
      DAY_MS,
  ) + 1;

const addIssue = (
  context: z.RefinementCtx,
  path: (string | number)[],
  message: string,
) => context.addIssue({ code: "custom", message, path });

const uniqueIds = (
  values: readonly { id: string }[],
  path: string,
  context: z.RefinementCtx,
) => {
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
) =>
  Object.fromEntries(
    [
      ...values.reduce((counts, value) => {
        const valueKey = key(value);
        counts.set(valueKey, (counts.get(valueKey) ?? 0) + 1);
        return counts;
      }, new Map<string, number>()),
    ].sort(([left], [right]) => left.localeCompare(right)),
  );

const sameCountRecord = (
  actual: Record<string, number>,
  expected: Record<string, number>,
) =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(actual).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  ) === JSON.stringify(expected);

export const validatedSiteProductionTimelineSchema =
  siteProductionTimelineSchema.superRefine((timeline, context) => {
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

    const buildingIds = uniqueIds(timeline.buildings, "buildings", context);
    const lineIds = uniqueIds(timeline.lines, "lines", context);
    const resourceIds = uniqueIds(timeline.resources, "resources", context);
    const familyIds = uniqueIds(
      timeline.product_families.map((family) => ({
        id: family.family_key,
      })),
      "product_families",
      context,
    );
    uniqueIds(timeline.products, "products", context);
    const batchIds = uniqueIds(timeline.batches, "batches", context);
    uniqueIds(timeline.consumption_edges, "consumption_edges", context);

    for (const [index, line] of timeline.lines.entries()) {
      if (line.building_id !== null && !buildingIds.has(line.building_id)) {
        addIssue(
          context,
          ["lines", index, "building_id"],
          "line building_id must identify an existing building",
        );
      }
      for (const resourceId of line.resource_ids) {
        if (!resourceIds.has(resourceId)) {
          addIssue(
            context,
            ["lines", index, "resource_ids"],
            "line resource_ids must identify existing resources",
          );
        }
      }
    }

    for (const [index, resource] of timeline.resources.entries()) {
      if (resource.line_id !== null && !lineIds.has(resource.line_id)) {
        addIssue(
          context,
          ["resources", index, "line_id"],
          "resource line_id must identify an existing line",
        );
      }
      if (
        resource.building_id !== null &&
        !buildingIds.has(resource.building_id)
      ) {
        addIssue(
          context,
          ["resources", index, "building_id"],
          "resource building_id must identify an existing building",
        );
      }
    }

    for (const [index, family] of timeline.product_families.entries()) {
      if (
        family.materials.length === 0 ||
        family.materials.join("\0") !==
          [...new Set(family.materials)].sort().join("\0")
      ) {
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

    const allocatedByBatch = new Map<string, number>();
    for (const [index, batch] of timeline.batches.entries()) {
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
        boundsStart !== null &&
        boundsEnd !== null &&
        (batch.start < boundsStart || batch.end > boundsEnd)
      ) {
        addIssue(
          context,
          ["batches", index, "start"],
          "batch dates must be within artifact date bounds",
        );
      }
      if (batch.line_id !== null && !lineIds.has(batch.line_id)) {
        addIssue(
          context,
          ["batches", index, "line_id"],
          "batch line_id must identify an existing line",
        );
      }
      if (
        (batch.line_confidence === "exact" ||
          batch.line_confidence === "mapped") &&
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
      if (batch.building_id !== null && !buildingIds.has(batch.building_id)) {
        addIssue(
          context,
          ["batches", index, "building_id"],
          "batch building_id must identify an existing building",
        );
      }
      if (
        batch.product_family_key !== null &&
        !familyIds.has(batch.product_family_key)
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
      if (
        new Set(batch.candidate_line_ids).size !==
        batch.candidate_line_ids.length
      ) {
        addIssue(
          context,
          ["batches", index, "candidate_line_ids"],
          "candidate line ids must be unique",
        );
      }
      for (const lineId of batch.candidate_line_ids) {
        if (!lineIds.has(lineId)) {
          addIssue(
            context,
            ["batches", index, "candidate_line_ids"],
            "candidate line ids must identify existing lines",
          );
        }
      }
      for (const resourceId of batch.resource_ids) {
        if (!resourceIds.has(resourceId)) {
          addIssue(
            context,
            ["batches", index, "resource_ids"],
            "batch resource_ids must identify existing resources",
          );
        }
      }
    }

    for (const [index, edge] of timeline.consumption_edges.entries()) {
      if (!batchIds.has(edge.source_batch_id)) {
        addIssue(
          context,
          ["consumption_edges", index, "source_batch_id"],
          "source_batch_id must identify an existing batch",
        );
      }
      const targets = [
        ...(edge.target_batch_id ? [edge.target_batch_id] : []),
        ...edge.candidate_target_batch_ids,
      ];
      for (const targetId of targets) {
        if (!batchIds.has(targetId)) {
          addIssue(
            context,
            ["consumption_edges", index, "target_batch_id"],
            "edge targets must identify existing batches",
          );
        }
      }
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
      if (
        edge.candidate_target_batch_ids.join("\0") !==
        [...new Set(edge.candidate_target_batch_ids)].sort().join("\0")
      ) {
        addIssue(
          context,
          ["consumption_edges", index, "candidate_target_batch_ids"],
          "candidate target ids must be unique and sorted",
        );
      }
      allocatedByBatch.set(
        edge.source_batch_id,
        (allocatedByBatch.get(edge.source_batch_id) ?? 0) + edge.quantity,
      );
    }

    let batchesWithAllocationOverage = 0;
    for (const [index, batch] of timeline.batches.entries()) {
      const allocated = allocatedByBatch.get(batch.id) ?? 0;
      const tolerance = batch.allocation_tolerance + Number.EPSILON;
      const expectedUnallocated =
        batch.quantity === null
          ? batch.unallocated_quantity
          : Math.max(0, batch.quantity - allocated);
      const expectedOverage =
        batch.quantity === null ? 0 : Math.max(0, allocated - batch.quantity);
      if (
        batch.quantity !== null &&
        expectedOverage > batch.allocation_tolerance
      ) {
        batchesWithAllocationOverage += 1;
      }
      if (
        Math.abs(batch.allocated_quantity - allocated) > tolerance ||
        (expectedUnallocated !== null &&
          (batch.unallocated_quantity === null ||
            Math.abs(batch.unallocated_quantity - expectedUnallocated) >
              tolerance)) ||
        (batch.quantity !== null &&
          (batch.allocation_overage_quantity === null ||
            Math.abs(batch.allocation_overage_quantity - expectedOverage) >
              tolerance))
      ) {
        addIssue(
          context,
          ["batches", index, "allocated_quantity"],
          "batch allocation totals must reconcile with consumption edges",
        );
      }
    }

    if (timeline.batches.length === 0) {
      if (boundsStart !== null || boundsEnd !== null) {
        addIssue(
          context,
          ["date_bounds"],
          "empty artifacts must have null date bounds",
        );
      }
    } else {
      const expectedBoundsStart = timeline.batches.reduce(
        (earliest, batch) => (batch.start < earliest ? batch.start : earliest),
        timeline.batches[0]!.start,
      );
      const expectedBoundsEnd = timeline.batches.reduce(
        (latest, batch) => (batch.end > latest ? batch.end : latest),
        timeline.batches[0]!.end,
      );
      if (
        boundsStart !== expectedBoundsStart ||
        boundsEnd !== expectedBoundsEnd
      ) {
        addIssue(
          context,
          ["date_bounds"],
          "non-empty artifact bounds must equal the minimum batch start and maximum batch end",
        );
      }
    }

    const expectedQuality = {
      batch_count: timeline.batches.length,
      edge_count: timeline.consumption_edges.length,
      timing_kind_counts: countBy(
        timeline.batches,
        (batch) => batch.timing_kind,
      ),
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
      unidentifiable_receipt_events:
        timeline.source.unidentifiable_receipt_events,
      materials_with_multiple_lines: [
        ...new Set(
          timeline.batches
            .filter((batch) => batch.line_id !== null)
            .map((batch) => batch.material),
        ),
      ]
        .filter(
          (material) =>
            new Set(
              timeline.batches
                .filter(
                  (batch) =>
                    batch.material === material && batch.line_id !== null,
                )
                .map((batch) => batch.line_id),
            ).size > 1,
        )
        .sort(),
      products_missing_family: timeline.products
        .filter((product) => !familyByMaterial.has(product.material))
        .map((product) => product.id)
        .sort(),
    };
    if (
      timeline.data_quality.batch_count !== expectedQuality.batch_count ||
      timeline.data_quality.edge_count !== expectedQuality.edge_count ||
      !sameCountRecord(
        timeline.data_quality.timing_kind_counts,
        expectedQuality.timing_kind_counts,
      ) ||
      !sameCountRecord(
        timeline.data_quality.line_confidence_counts,
        expectedQuality.line_confidence_counts,
      ) ||
      !sameCountRecord(
        timeline.data_quality.edge_confidence_counts,
        expectedQuality.edge_confidence_counts,
      ) ||
      timeline.data_quality.batches_with_allocation_overage !==
        expectedQuality.batches_with_allocation_overage ||
      timeline.data_quality.batches_missing_family !==
        expectedQuality.batches_missing_family ||
      timeline.data_quality.negative_waiting_intervals !==
        expectedQuality.negative_waiting_intervals ||
      timeline.data_quality.unidentifiable_receipt_events !==
        expectedQuality.unidentifiable_receipt_events ||
      timeline.data_quality.materials_with_multiple_lines.join("\0") !==
        expectedQuality.materials_with_multiple_lines.join("\0") ||
      timeline.data_quality.products_missing_family.join("\0") !==
        expectedQuality.products_missing_family.join("\0")
    ) {
      addIssue(
        context,
        ["data_quality"],
        "data quality totals must reconcile with artifact contents",
      );
    }
  });

export const parseSiteProductionTimeline = (
  value: unknown,
  siteId?: string,
): SiteProductionTimeline => {
  if (typeof value === "object" && value !== null) {
    const versions = value as {
      artifact_version?: unknown;
      schema_version?: unknown;
    };
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

export const safeParseSiteProductionTimeline = (
  value: unknown,
  siteId?: string,
) => {
  try {
    return {
      success: true as const,
      data: parseSiteProductionTimeline(value, siteId),
    };
  } catch (error) {
    return { success: false as const, error };
  }
};
