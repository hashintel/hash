import type {
  ProductionSchedule,
  ProductionScheduleAllocation,
  ProductionScheduleBatch,
  ProductionScheduleLane,
} from "../../../shared/production-schedule-types";

const DAY_MS = 86_400_000;
const DOMAIN_PADDING_DAYS = 3;

export interface ScheduleFilters {
  start: string | null;
  end: string | null;
}

export type DirectUseState =
  | "in_hierarchy"
  | "used_elsewhere"
  | "no_recorded_consumption"
  | "unknown_output";

export interface DirectConsumer {
  material: string;
  quantity: number | null;
  isOutsideHierarchy: boolean;
}

export interface BatchDirectUse {
  state: DirectUseState;
  consumers: DirectConsumer[];
  hasUnknownOutput: boolean;
  unconsumedQuantity: number;
}

export interface ScheduleModel {
  lanes: ProductionScheduleLane[];
  directUseByBatch: Map<string, BatchDirectUse>;
  start: string | null;
  end: string | null;
  usedElsewhereCount: number;
  unknownOutputCount: number;
}

const dayNumber = (date: string): number =>
  Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);

const dayString = (day: number): string =>
  new Date(day * DAY_MS).toISOString().slice(0, 10);

const overlaps = (
  batch: ProductionScheduleBatch,
  start: string | null,
  end: string | null,
): boolean => (!start || batch.end >= start) && (!end || batch.start <= end);

const directMaterials = (
  allocation: ProductionScheduleAllocation,
): Set<string> => {
  const directCandidates = allocation.direct_output_candidates ?? [];
  if (directCandidates.length > 0) {
    return new Set(directCandidates.map((candidate) => candidate.material));
  }

  // Version 1.0 artifacts did not preserve immediate order outputs. A
  // one-order terminal path is also a direct output, so retain that narrow
  // backwards-compatible case without treating recursive endpoints as direct.
  return new Set(
    allocation.output_candidates
      .filter((candidate) => candidate.path.length === 1)
      .map((candidate) => candidate.material),
  );
};

export const deriveBatchDirectUse = (
  batch: ProductionScheduleBatch,
  hierarchyMaterials: ReadonlySet<string>,
): BatchDirectUse => {
  const quantities = new Map<
    string,
    { exactQuantity: number; hasUnsplitQuantity: boolean }
  >();
  let hasUnknownOutput = false;
  let recordedOpenQuantity = 0;

  for (const allocation of batch.allocations) {
    if (allocation.status === "open") {
      recordedOpenQuantity += allocation.net_quantity;
      continue;
    }

    const materials = directMaterials(allocation);
    if (materials.size === 0) {
      hasUnknownOutput = true;
      continue;
    }

    for (const material of materials) {
      const current = quantities.get(material) ?? {
        exactQuantity: 0,
        hasUnsplitQuantity: false,
      };
      if (materials.size === 1) {
        current.exactQuantity += allocation.net_quantity;
      } else {
        current.hasUnsplitQuantity = true;
      }
      quantities.set(material, current);
    }
  }

  const consumers = [...quantities.entries()]
    .map(([material, { exactQuantity, hasUnsplitQuantity }]) => ({
      material,
      quantity: hasUnsplitQuantity ? null : exactQuantity,
      isOutsideHierarchy: !hierarchyMaterials.has(material),
    }))
    .sort((left, right) => left.material.localeCompare(right.material));
  const unconsumedQuantity = Math.max(
    recordedOpenQuantity,
    batch.unallocated_quantity,
  );

  const state: DirectUseState = consumers.some(
    (consumer) => consumer.isOutsideHierarchy,
  )
    ? "used_elsewhere"
    : consumers.length > 0
      ? "in_hierarchy"
      : hasUnknownOutput
        ? "unknown_output"
        : "no_recorded_consumption";

  return {
    state,
    consumers,
    hasUnknownOutput,
    unconsumedQuantity,
  };
};

export const deriveScheduleModel = (
  schedule: ProductionSchedule,
  filters: ScheduleFilters,
): ScheduleModel => {
  const hierarchyMaterials = new Set(
    schedule.lanes.map((lane) => lane.material),
  );
  const lanes = schedule.lanes
    .map((lane) => ({
      ...lane,
      batches: lane.batches.filter((batch) =>
        overlaps(batch, filters.start, filters.end),
      ),
    }))
    .filter((lane) => lane.batches.length > 0)
    .sort(
      (left, right) =>
        right.bom_depth - left.bom_depth ||
        left.material.localeCompare(right.material),
    );

  const directUseByBatch = new Map<string, BatchDirectUse>();
  let usedElsewhereCount = 0;
  let unknownOutputCount = 0;
  for (const lane of lanes) {
    if (lane.role === "finished_good") {
      continue;
    }
    for (const batch of lane.batches) {
      const directUse = deriveBatchDirectUse(batch, hierarchyMaterials);
      directUseByBatch.set(batch.id, directUse);
      if (directUse.state === "used_elsewhere") {
        usedElsewhereCount += 1;
      }
      if (directUse.hasUnknownOutput) {
        unknownOutputCount += 1;
      }
    }
  }

  const allBatches = lanes.flatMap((lane) => lane.batches);
  const firstBatchStart =
    allBatches.length > 0
      ? allBatches.reduce(
          (earliest, batch) =>
            batch.start < earliest ? batch.start : earliest,
          allBatches[0]!.start,
        )
      : null;
  const lastBatchEnd =
    allBatches.length > 0
      ? allBatches.reduce(
          (latest, batch) => (batch.end > latest ? batch.end : latest),
          allBatches[0]!.end,
        )
      : null;

  return {
    lanes,
    directUseByBatch,
    start:
      filters.start ??
      (firstBatchStart
        ? dayString(dayNumber(firstBatchStart) - DOMAIN_PADDING_DAYS)
        : null),
    end:
      filters.end ??
      (lastBatchEnd
        ? dayString(dayNumber(lastBatchEnd) + DOMAIN_PADDING_DAYS)
        : null),
    usedElsewhereCount,
    unknownOutputCount,
  };
};
