import type {
  SiteProductionTimeline,
  SiteTimelineBatch,
  SiteTimelineLine,
  SiteTimelineProductFamily,
} from "@local/hash-isomorphic-utils/site-production-timeline";

export interface PackedOccupancyBatch {
  batch: SiteTimelineBatch;
  focused: boolean;
  overlaps: boolean;
  track: number;
}

export interface LineOccupancyRowModel {
  line: SiteTimelineLine;
  batches: PackedOccupancyBatch[];
  trackCount: number;
}

export interface MaterialOccupancyModel {
  rows: LineOccupancyRowModel[];
  uncertainBatches: SiteTimelineBatch[];
  receiptEvents: SiteTimelineBatch[];
  uncertaintySummary: {
    batchCount: number;
    candidateLineIds: string[];
    lineSources: string[];
  };
  emptyArtifact: boolean;
  outsideCoverage: boolean;
}

export interface SiteOccupancyIndex {
  timeline: SiteProductionTimeline;
  lineById: ReadonlyMap<string, SiteTimelineLine>;
  familyByKey: ReadonlyMap<string, SiteTimelineProductFamily>;
  linesByMaterial: ReadonlyMap<string, readonly string[]>;
  uncertainByMaterial: ReadonlyMap<string, readonly SiteTimelineBatch[]>;
  receiptsByMaterial: ReadonlyMap<string, readonly SiteTimelineBatch[]>;
  batchesForLineAndRange: (
    lineId: string,
    start: string,
    end: string,
  ) => readonly SiteTimelineBatch[];
}

export const occupancyBatchIdentity = ({
  batch,
  material,
  order,
}: {
  batch: string | null;
  material: string;
  order: string | null;
}): string | null => {
  if (batch) {
    return `${material}\0batch:${batch}`;
  }
  if (order) {
    return `${material}\0order:${order.replace(/^0+(?=\d)/u, "")}`;
  }
  return null;
};

const indexCache = new WeakMap<SiteProductionTimeline, SiteOccupancyIndex>();

const upperBoundByStart = (
  batches: readonly SiteTimelineBatch[],
  end: string,
): number => {
  let low = 0;
  let high = batches.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (batches[middle]!.start <= end) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
};

export const buildSiteOccupancyIndex = (
  timeline: SiteProductionTimeline,
): SiteOccupancyIndex => {
  const lineById = new Map(timeline.lines.map((line) => [line.id, line]));
  const familyByKey = new Map(
    timeline.product_families.map((family) => [family.family_key, family]),
  );
  const lineSetsByMaterial = new Map<string, Set<string>>();
  const uncertainByMaterial = new Map<string, SiteTimelineBatch[]>();
  const receiptsByMaterial = new Map<string, SiteTimelineBatch[]>();
  const batchesByLine = new Map<string, SiteTimelineBatch[]>();

  for (const batch of timeline.batches) {
    if (batch.timing_kind === "receipt_event") {
      const receipts = receiptsByMaterial.get(batch.material) ?? [];
      receipts.push(batch);
      receiptsByMaterial.set(batch.material, receipts);
      continue;
    }
    if (
      batch.line_id &&
      (batch.line_confidence === "exact" || batch.line_confidence === "mapped")
    ) {
      const materialLines =
        lineSetsByMaterial.get(batch.material) ?? new Set<string>();
      materialLines.add(batch.line_id);
      lineSetsByMaterial.set(batch.material, materialLines);
      const lineBatches = batchesByLine.get(batch.line_id) ?? [];
      lineBatches.push(batch);
      batchesByLine.set(batch.line_id, lineBatches);
    } else if (
      batch.line_confidence === "candidate" ||
      batch.line_confidence === "ambiguous" ||
      batch.line_confidence === "unresolved"
    ) {
      const uncertain = uncertainByMaterial.get(batch.material) ?? [];
      uncertain.push(batch);
      uncertainByMaterial.set(batch.material, uncertain);
    }
  }

  for (const batches of batchesByLine.values()) {
    batches.sort(
      (left, right) =>
        left.start.localeCompare(right.start) ||
        left.end.localeCompare(right.end) ||
        left.id.localeCompare(right.id),
    );
  }
  const linesByMaterial = new Map(
    [...lineSetsByMaterial].map(([material, lineIds]) => [
      material,
      [...lineIds].sort(),
    ]),
  );
  const rangeCache = new Map<string, readonly SiteTimelineBatch[]>();

  return {
    timeline,
    lineById,
    familyByKey,
    linesByMaterial,
    uncertainByMaterial,
    receiptsByMaterial,
    batchesForLineAndRange: (lineId, start, end) => {
      const cacheKey = `${lineId}\0${start}\0${end}`;
      const cached = rangeCache.get(cacheKey);
      if (cached) {
        return cached;
      }
      const batches = batchesByLine.get(lineId) ?? [];
      const limit = upperBoundByStart(batches, end);
      const intersecting = batches
        .slice(0, limit)
        .filter((batch) => batch.end >= start);
      rangeCache.set(cacheKey, intersecting);
      return intersecting;
    },
  };
};

export const getSiteOccupancyIndex = (
  timeline: SiteProductionTimeline,
): SiteOccupancyIndex => {
  const cached = indexCache.get(timeline);
  if (cached) {
    return cached;
  }
  const index = buildSiteOccupancyIndex(timeline);
  indexCache.set(timeline, index);
  return index;
};

const packOccupancyBatches = (
  batches: readonly SiteTimelineBatch[],
  material: string,
): Pick<LineOccupancyRowModel, "batches" | "trackCount"> => {
  const trackEnds: string[] = [];
  const packed: PackedOccupancyBatch[] = [];
  const overlappingIds = new Set<string>();
  let active: SiteTimelineBatch[] = [];
  for (const batch of batches) {
    active = active.filter((candidate) => candidate.end >= batch.start);
    if (active.length > 0) {
      overlappingIds.add(batch.id);
      for (const candidate of active) {
        overlappingIds.add(candidate.id);
      }
    }
    active.push(batch);
  }
  for (const batch of batches) {
    const track = trackEnds.findIndex((end) => end < batch.start);
    const targetTrack = track === -1 ? trackEnds.length : track;
    trackEnds[targetTrack] = batch.end;
    packed.push({
      batch,
      focused: batch.material === material,
      overlaps: overlappingIds.has(batch.id),
      track: targetTrack,
    });
  }
  return { batches: packed, trackCount: Math.max(1, trackEnds.length) };
};

export const deriveMaterialOccupancy = ({
  end,
  focusedBatchIdentities,
  index,
  material,
  start,
}: {
  end: string;
  focusedBatchIdentities?: ReadonlySet<string>;
  index: SiteOccupancyIndex;
  material: string;
  start: string;
}): MaterialOccupancyModel => {
  const isRelevant = (batch: SiteTimelineBatch) => {
    if (!focusedBatchIdentities) {
      return true;
    }
    const identity = occupancyBatchIdentity(batch);
    return (
      batch.material === material &&
      identity !== null &&
      focusedBatchIdentities.has(identity)
    );
  };
  const rows = (index.linesByMaterial.get(material) ?? []).flatMap((lineId) => {
    const line = index.lineById.get(lineId);
    if (!line) {
      return [];
    }
    const batches = index
      .batchesForLineAndRange(lineId, start, end)
      .filter(isRelevant);
    if (
      focusedBatchIdentities &&
      !batches.some((batch) => batch.material === material)
    ) {
      return [];
    }
    return [
      {
        line,
        ...packOccupancyBatches(batches, material),
      },
    ];
  });
  const inRange = (batch: SiteTimelineBatch) =>
    batch.start <= end && batch.end >= start;
  const uncertainBatches = (
    index.uncertainByMaterial.get(material) ?? []
  ).filter((batch) => inRange(batch) && isRelevant(batch));
  const { start: boundsStart, end: boundsEnd } = index.timeline.date_bounds;
  return {
    rows,
    uncertainBatches,
    receiptEvents: (index.receiptsByMaterial.get(material) ?? []).filter(
      (batch) => inRange(batch) && isRelevant(batch),
    ),
    uncertaintySummary: {
      batchCount: uncertainBatches.length,
      candidateLineIds: [
        ...new Set(
          uncertainBatches.flatMap((batch) => batch.candidate_line_ids),
        ),
      ].sort(),
      lineSources: [
        ...new Set(uncertainBatches.map((batch) => batch.line_source)),
      ].sort(),
    },
    emptyArtifact: boundsStart === null && boundsEnd === null,
    outsideCoverage:
      boundsStart !== null &&
      boundsEnd !== null &&
      (end < boundsStart || start > boundsEnd),
  };
};
