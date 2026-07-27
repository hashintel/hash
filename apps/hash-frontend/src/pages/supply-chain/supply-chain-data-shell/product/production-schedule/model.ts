import { productionScheduleArtifactDates } from "./schedule-dates";

import type {
  ProductionSchedule,
  ProductionScheduleAllocation,
  ProductionScheduleBatch,
  ProductionScheduleBatchLink,
  ProductionScheduleConsumptionEvent,
  ProductionScheduleDispatchEvent,
  ProductionScheduleLane,
} from "../../../shared/production-schedule-types";

const DAY_MS = 86_400_000;
const DOMAIN_PADDING_DAYS = 3;
export const MAX_COLLAPSED_TRACKS = 6;

export interface ScheduleFilters {
  start: string | null;
  end: string | null;
}

export type ScheduleLaneDisplay = "lane" | "continuous";

export type DirectUseState =
  | "in_hierarchy"
  | "used_elsewhere"
  | "dispatched_as_fg"
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
  dispatchedQuantity: number;
  hasUnknownOutput: boolean;
  unconsumedQuantity: number;
}

export interface PackedBatch {
  batch: ProductionScheduleBatch;
  track: number;
}

export interface ScheduleLaneModel extends ProductionScheduleLane {
  packedBatches: PackedBatch[];
  trackCount: number;
}

export interface ScheduleEventLink {
  link: ProductionScheduleBatchLink;
  event: ProductionScheduleConsumptionEvent;
}

export interface ScheduleLineageEdge {
  sourceBatchId: string;
  targetBatchId: string;
  eventId: string;
}

export type ScheduleSelection =
  | { kind: "batch"; batchId: string }
  | { kind: "consumption"; eventIds: string[] }
  | {
      kind: "dispatch";
      eventIds: string[];
      origin?: "batch_marker" | "dispatch_lane";
    };

export interface ScheduleTrace {
  batchIds: Set<string>;
  rootBatchIds: Set<string>;
  consumptionEventIds: Set<string>;
  dispatchEventIds: Set<string>;
}

export interface ScheduleModel {
  lanes: ScheduleLaneModel[];
  directUseByBatch: Map<string, BatchDirectUse>;
  downstreamByBatch: Map<string, Set<string>>;
  upstreamByBatch: Map<string, Set<string>>;
  downstreamEdgesByBatch: Map<string, ScheduleLineageEdge[]>;
  upstreamEdgesByBatch: Map<string, ScheduleLineageEdge[]>;
  consumptionEventsByBatch: Map<string, ProductionScheduleConsumptionEvent[]>;
  consumptionEventsById: Map<string, ProductionScheduleConsumptionEvent>;
  linksByEvent: Map<string, ProductionScheduleBatchLink>;
  dispatchesByBatch: Map<string, ProductionScheduleDispatchEvent[]>;
  dispatchesById: Map<string, ProductionScheduleDispatchEvent>;
  start: string | null;
  end: string | null;
  usedElsewhereCount: number;
  unknownOutputCount: number;
}

export const scheduleDayNumber = (date: string): number =>
  Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);

const dayString = (day: number): string =>
  new Date(day * DAY_MS).toISOString().slice(0, 10);

export const batchLifecycleStart = (batch: ProductionScheduleBatch): string =>
  batch.lifecycle_start ?? batch.start;

export const batchLifecycleEnd = (batch: ProductionScheduleBatch): string =>
  batch.lifecycle_end ?? batch.end;

export const batchRenderStart = (batch: ProductionScheduleBatch): string =>
  batch.start < batchLifecycleStart(batch)
    ? batch.start
    : batchLifecycleStart(batch);

export const batchRenderEnd = (batch: ProductionScheduleBatch): string =>
  [batch.end, batchLifecycleEnd(batch), batch.last_exit_date]
    .filter((date): date is string => date !== null && date !== undefined)
    .sort()
    .at(-1)!;

export const batchVisibleRange = (
  batch: ProductionScheduleBatch,
  role: ProductionScheduleLane["role"],
  showInventoryDwell: boolean,
): { start: string; end: string } => {
  if (showInventoryDwell || role === "raw_material") {
    return {
      start: batchRenderStart(batch),
      end: batchRenderEnd(batch),
    };
  }
  if (batch.timing_kind === "lifecycle_only") {
    const lifecycleStart = batchLifecycleStart(batch);
    return { start: lifecycleStart, end: lifecycleStart };
  }
  return { start: batch.start, end: batch.end };
};

export const batchInterval = (
  batch: ProductionScheduleBatch,
  role: ProductionScheduleLane["role"] = "intermediate",
  showInventoryDwell = true,
): { start: number; endExclusive: number } => ({
  start: scheduleDayNumber(
    batchVisibleRange(batch, role, showInventoryDwell).start,
  ),
  endExclusive:
    scheduleDayNumber(batchVisibleRange(batch, role, showInventoryDwell).end) +
    1,
});

export const dateCenterPercent = (
  date: string,
  visibleStart: string,
  visibleEnd: string,
): number => {
  const start = scheduleDayNumber(visibleStart);
  const endExclusive = scheduleDayNumber(visibleEnd) + 1;
  const position = scheduleDayNumber(date) + 0.5;
  return Math.max(
    0,
    Math.min(100, ((position - start) / (endExclusive - start)) * 100),
  );
};

export const intervalPercent = (
  intervalStart: string,
  intervalEnd: string,
  visibleStart: string,
  visibleEnd: string,
): { left: number; right: number } => {
  const domainStart = scheduleDayNumber(visibleStart);
  const domainEndExclusive = scheduleDayNumber(visibleEnd) + 1;
  const span = Math.max(1, domainEndExclusive - domainStart);
  const toPercent = (day: number) =>
    Math.max(0, Math.min(100, ((day - domainStart) / span) * 100));
  return {
    left: toPercent(scheduleDayNumber(intervalStart)),
    right: toPercent(scheduleDayNumber(intervalEnd) + 1),
  };
};

export const hasOpenResidual = (batch: ProductionScheduleBatch): boolean =>
  batch.lifecycle_end_reason === "open" &&
  (batch.remaining_quantity ?? 0) > batch.allocation_tolerance;

const overlaps = (
  batch: ProductionScheduleBatch,
  role: ProductionScheduleLane["role"],
  showInventoryDwell: boolean,
  start: string | null,
  end: string | null,
): boolean => {
  const { start: batchStart, end: batchEnd } = batchVisibleRange(
    batch,
    role,
    showInventoryDwell,
  );
  return (!start || batchEnd >= start) && (!end || batchStart <= end);
};

const directMaterials = (
  allocation: ProductionScheduleAllocation,
): Set<string> => {
  if ((allocation.direct_consumer_materials?.length ?? 0) > 0) {
    return new Set(allocation.direct_consumer_materials);
  }
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
  normalizedEvents?: ProductionScheduleConsumptionEvent[],
  dispatches: readonly ProductionScheduleDispatchEvent[] = [],
): BatchDirectUse => {
  const quantities = new Map<
    string,
    { exactQuantity: number; hasUnsplitQuantity: boolean }
  >();
  let hasUnknownOutput = false;
  let recordedOpenQuantity = 0;

  const allocations = "allocations" in batch ? batch.allocations : [];
  for (const allocation of allocations) {
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
  for (const event of normalizedEvents ?? []) {
    const materials = new Set(event.direct_consumer_materials);
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
        current.exactQuantity += event.net_quantity;
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
  const dispatchedQuantity = dispatches
    .filter((dispatch) => dispatch.episode_scope === "in_episode")
    .reduce((total, dispatch) => total + dispatch.quantity, 0);
  const hasDispatchEvidence = dispatches.some(
    (dispatch) => dispatch.quantity > batch.allocation_tolerance,
  );
  const unconsumedQuantity = Math.max(
    0,
    Math.max(recordedOpenQuantity, batch.unallocated_quantity) -
      dispatchedQuantity,
  );

  const state: DirectUseState = consumers.some(
    (consumer) => consumer.isOutsideHierarchy,
  )
    ? "used_elsewhere"
    : consumers.length > 0
      ? "in_hierarchy"
      : hasUnknownOutput
        ? "unknown_output"
        : hasDispatchEvidence
          ? "dispatched_as_fg"
          : "no_recorded_consumption";

  return {
    state,
    consumers,
    dispatchedQuantity,
    hasUnknownOutput,
    unconsumedQuantity,
  };
};

export const packBatchTracks = (
  batches: ProductionScheduleBatch[],
  role: ProductionScheduleLane["role"] = "intermediate",
  showInventoryDwell = true,
  laneDisplay: ScheduleLaneDisplay = "lane",
): PackedBatch[] => {
  const trackEnds: string[] = [];

  return [...batches]
    .sort((left, right) => {
      const leftRange = batchVisibleRange(left, role, showInventoryDwell);
      const rightRange = batchVisibleRange(right, role, showInventoryDwell);
      return (
        leftRange.start.localeCompare(rightRange.start) ||
        leftRange.end.localeCompare(rightRange.end) ||
        left.id.localeCompare(right.id)
      );
    })
    .map((batch) => {
      if (laneDisplay === "continuous") {
        return { batch, track: 0 };
      }
      const { start, end } = batchVisibleRange(batch, role, showInventoryDwell);
      let track = trackEnds.findIndex((trackEnd) => trackEnd < start);
      if (track === -1) {
        track = trackEnds.length;
      }
      trackEnds[track] = end;
      return { batch, track };
    });
};

const addAdjacent = (
  adjacency: Map<string, Set<string>>,
  source: string,
  target: string,
) => {
  const neighbours = adjacency.get(source) ?? new Set<string>();
  neighbours.add(target);
  adjacency.set(source, neighbours);
};

const fallbackLinks = (
  schedule: ProductionSchedule,
): ProductionScheduleBatchLink[] => {
  if (schedule.artifact_version === "1.2") {
    return schedule.batch_links;
  }
  const knownBatchIds = new Set(
    schedule.lanes.flatMap((lane) => lane.batches.map((batch) => batch.id)),
  );
  const links: ProductionScheduleBatchLink[] = [];

  for (const lane of schedule.lanes) {
    for (const batch of lane.batches) {
      for (const [allocationIndex, allocation] of batch.allocations.entries()) {
        if (allocation.status === "open") {
          continue;
        }
        const eventId =
          allocation.event_id ?? `${batch.id}::allocation-${allocationIndex}`;
        for (const candidate of allocation.direct_output_candidates ?? []) {
          if (!candidate.batch) {
            continue;
          }
          const targetBatchId = `${candidate.material}::${candidate.batch}`;
          if (!knownBatchIds.has(targetBatchId)) {
            continue;
          }
          links.push({
            id: `${eventId}::${targetBatchId}`,
            event_id: eventId,
            target_batch_ids: [targetBatchId],
          });
        }
      }
    }
  }

  return links;
};

const normalizedConsumptionEvents = (
  schedule: ProductionSchedule,
): ProductionScheduleConsumptionEvent[] => {
  if (schedule.artifact_version === "1.2") {
    return schedule.consumption_events;
  }
  const events: ProductionScheduleConsumptionEvent[] = [];
  for (const lane of schedule.lanes) {
    for (const batch of lane.batches) {
      for (const [index, allocation] of batch.allocations.entries()) {
        if (
          allocation.status === "open" ||
          !allocation.consuming_order ||
          !allocation.consumption_date
        ) {
          continue;
        }
        events.push({
          id: allocation.event_id ?? `${batch.id}::allocation-${index}`,
          source_batch_id: batch.id,
          consuming_order: allocation.consuming_order,
          consumption_date: allocation.consumption_date,
          episode_scope: "in_episode",
          net_quantity: allocation.net_quantity,
          status: allocation.status,
          confidence: allocation.confidence,
          reason: allocation.reason,
          direct_consumer_materials: [...directMaterials(allocation)],
        });
      }
    }
  }
  return events;
};

export const productionScheduleRelevantBatchIds = (
  schedule: ProductionSchedule,
): Set<string> => {
  const batchesById = new Map(
    schedule.lanes.flatMap((lane) =>
      lane.batches.map((batch) => [batch.id, batch] as const),
    ),
  );
  if (schedule.artifact_version !== "1.2") {
    return new Set(batchesById.keys());
  }
  const events = normalizedConsumptionEvents(schedule);
  const eventsById = new Map(events.map((event) => [event.id, event] as const));
  const linkedSourcesByTarget = new Map<string, Set<string>>();
  for (const link of fallbackLinks(schedule)) {
    const sourceBatchId = eventsById.get(link.event_id)?.source_batch_id;
    if (!sourceBatchId || !batchesById.has(sourceBatchId)) {
      continue;
    }
    for (const targetBatchId of link.target_batch_ids) {
      addAdjacent(linkedSourcesByTarget, targetBatchId, sourceBatchId);
    }
  }

  const sourcesByOrderAndMaterial = new Map<string, Set<string>>();
  for (const event of events) {
    if (!event.consuming_order || !batchesById.has(event.source_batch_id)) {
      continue;
    }
    for (const material of event.direct_consumer_materials) {
      addAdjacent(
        sourcesByOrderAndMaterial,
        `${event.consuming_order}\u0000${material}`,
        event.source_batch_id,
      );
    }
  }

  const relevantBatchIds = new Set<string>();
  const pending: string[] = [];
  const includeBatch = (batchId: string) => {
    if (!relevantBatchIds.has(batchId) && batchesById.has(batchId)) {
      relevantBatchIds.add(batchId);
      pending.push(batchId);
    }
  };
  for (const lane of schedule.lanes) {
    if (lane.material === schedule.product_material) {
      for (const batch of lane.batches) {
        includeBatch(batch.id);
      }
    }
  }

  while (pending.length > 0) {
    const targetBatchId = pending.pop()!;
    for (const sourceBatchId of linkedSourcesByTarget.get(targetBatchId) ??
      []) {
      includeBatch(sourceBatchId);
    }
    const targetBatch = batchesById.get(targetBatchId);
    if (!targetBatch?.order) {
      continue;
    }
    const orderMaterialKey = `${targetBatch.order}\u0000${targetBatch.material}`;
    for (const sourceBatchId of sourcesByOrderAndMaterial.get(
      orderMaterialKey,
    ) ?? []) {
      includeBatch(sourceBatchId);
    }
  }

  return relevantBatchIds;
};

export interface PixelCluster<T> {
  id: string;
  items: T[];
  pixel: number;
}

export const clusterEventsByPixel = <T extends { id: string }>(
  items: readonly T[],
  dateFor: (item: T) => string,
  domainStart: string,
  domainEnd: string,
  plotWidth: number,
  threshold = 20,
): PixelCluster<T>[] => {
  const start = scheduleDayNumber(domainStart);
  const dayCount = Math.max(1, scheduleDayNumber(domainEnd) - start + 1);
  const positioned = items
    .map((item) => ({
      item,
      pixel:
        ((scheduleDayNumber(dateFor(item)) - start + 0.5) / dayCount) *
        plotWidth,
    }))
    .sort(
      (left, right) =>
        left.pixel - right.pixel || left.item.id.localeCompare(right.item.id),
    );
  const clusters: PixelCluster<T>[] = [];
  for (const positionedItem of positioned) {
    const current = clusters.at(-1);
    if (current && positionedItem.pixel - current.pixel <= threshold) {
      current.items.push(positionedItem.item);
      current.pixel =
        current.items.reduce(
          (sum, item) =>
            sum +
            ((scheduleDayNumber(dateFor(item)) - start + 0.5) / dayCount) *
              plotWidth,
          0,
        ) / current.items.length;
    } else {
      clusters.push({
        id: positionedItem.item.id,
        items: [positionedItem.item],
        pixel: positionedItem.pixel,
      });
    }
  }
  return clusters;
};

const directedClosure = (
  graph: ReadonlyMap<string, ReadonlySet<string>>,
  start: string,
): Set<string> => {
  const closure = new Set([start]);
  const pending = [start];
  while (pending.length > 0) {
    const current = pending.pop()!;
    for (const neighbour of graph.get(current) ?? []) {
      if (!closure.has(neighbour)) {
        closure.add(neighbour);
        pending.push(neighbour);
      }
    }
  }
  return closure;
};

export const relatedBatchIds = (
  downstreamByBatch: ReadonlyMap<string, ReadonlySet<string>>,
  upstreamByBatch: ReadonlyMap<string, ReadonlySet<string>>,
  selectedBatchId: string | null,
): Set<string> => {
  if (!selectedBatchId) {
    return new Set();
  }
  const related = directedClosure(downstreamByBatch, selectedBatchId);
  for (const upstream of directedClosure(upstreamByBatch, selectedBatchId)) {
    related.add(upstream);
  }
  return related;
};

const traverseEdges = (
  graph: ReadonlyMap<string, readonly ScheduleLineageEdge[]>,
  starts: Iterable<string>,
  direction: "upstream" | "downstream",
): { batchIds: Set<string>; eventIds: Set<string> } => {
  const batchIds = new Set(starts);
  const eventIds = new Set<string>();
  const pending = [...batchIds];
  while (pending.length > 0) {
    const current = pending.pop()!;
    for (const edge of graph.get(current) ?? []) {
      eventIds.add(edge.eventId);
      const next =
        direction === "upstream" ? edge.sourceBatchId : edge.targetBatchId;
      if (!batchIds.has(next)) {
        batchIds.add(next);
        pending.push(next);
      }
    }
  }
  return { batchIds, eventIds };
};

export const deriveScheduleTrace = (
  model: ScheduleModel,
  selection: ScheduleSelection | null,
): ScheduleTrace => {
  const trace: ScheduleTrace = {
    batchIds: new Set(),
    rootBatchIds: new Set(),
    consumptionEventIds: new Set(),
    dispatchEventIds: new Set(),
  };
  if (!selection) {
    return trace;
  }

  const includeDispatchesFor = (batchIds: ReadonlySet<string>) => {
    for (const batchId of batchIds) {
      for (const dispatch of model.dispatchesByBatch.get(batchId) ?? []) {
        trace.dispatchEventIds.add(dispatch.id);
      }
    }
  };

  if (selection.kind === "batch") {
    trace.rootBatchIds.add(selection.batchId);
    const upstream = traverseEdges(
      model.upstreamEdgesByBatch,
      [selection.batchId],
      "upstream",
    );
    const downstream = traverseEdges(
      model.downstreamEdgesByBatch,
      [selection.batchId],
      "downstream",
    );
    trace.batchIds = new Set([...upstream.batchIds, ...downstream.batchIds]);
    trace.consumptionEventIds = new Set([
      ...upstream.eventIds,
      ...downstream.eventIds,
      ...(model.consumptionEventsByBatch.get(selection.batchId) ?? []).map(
        ({ id }) => id,
      ),
    ]);
    includeDispatchesFor(downstream.batchIds);
    return trace;
  }

  if (selection.kind === "dispatch") {
    for (const eventId of selection.eventIds) {
      const dispatch = model.dispatchesById.get(eventId);
      if (dispatch) {
        trace.rootBatchIds.add(dispatch.batch_id);
        trace.dispatchEventIds.add(eventId);
      }
    }
    const upstream = traverseEdges(
      model.upstreamEdgesByBatch,
      trace.rootBatchIds,
      "upstream",
    );
    trace.batchIds = upstream.batchIds;
    trace.consumptionEventIds = upstream.eventIds;
    return trace;
  }

  const sourceBatchIds = new Set<string>();
  const targetBatchIds = new Set<string>();
  for (const eventId of selection.eventIds) {
    const event = model.consumptionEventsById.get(eventId);
    if (!event) {
      continue;
    }
    sourceBatchIds.add(event.source_batch_id);
    trace.rootBatchIds.add(event.source_batch_id);
    trace.consumptionEventIds.add(eventId);
    for (const targetBatchId of model.linksByEvent.get(eventId)
      ?.target_batch_ids ?? []) {
      targetBatchIds.add(targetBatchId);
    }
  }
  const upstream = traverseEdges(
    model.upstreamEdgesByBatch,
    sourceBatchIds,
    "upstream",
  );
  const downstream = traverseEdges(
    model.downstreamEdgesByBatch,
    targetBatchIds,
    "downstream",
  );
  trace.batchIds = new Set([
    ...sourceBatchIds,
    ...targetBatchIds,
    ...upstream.batchIds,
    ...downstream.batchIds,
  ]);
  trace.consumptionEventIds = new Set([
    ...trace.consumptionEventIds,
    ...upstream.eventIds,
    ...downstream.eventIds,
  ]);
  includeDispatchesFor(downstream.batchIds);
  return trace;
};

export const focusScheduleLanes = (
  lanes: readonly ScheduleLaneModel[],
  focusedBatchIds: ReadonlySet<string>,
  focused: boolean,
  showInventoryDwell = true,
  laneDisplay: ScheduleLaneDisplay = "lane",
): ScheduleLaneModel[] => {
  if (!focused) {
    return [...lanes];
  }

  return lanes.flatMap((lane) => {
    const batches = lane.batches.filter((batch) =>
      focusedBatchIds.has(batch.id),
    );
    if (batches.length === 0) {
      return [];
    }
    const packedBatches = packBatchTracks(
      batches,
      lane.role,
      showInventoryDwell,
      laneDisplay,
    );
    return [
      {
        ...lane,
        batches,
        packedBatches,
        trackCount:
          Math.max(0, ...packedBatches.map(({ track }) => track + 1)) || 1,
      },
    ];
  });
};

export const deriveScheduleModel = (
  schedule: ProductionSchedule,
  filters: ScheduleFilters,
  showInventoryDwell = true,
  laneDisplay: ScheduleLaneDisplay = "lane",
): ScheduleModel => {
  const hierarchyMaterials = new Set(
    schedule.lanes.map((lane) => lane.material),
  );
  const consumptionEvents = normalizedConsumptionEvents(schedule);
  const relevantBatchIds = productionScheduleRelevantBatchIds(schedule);
  const consumptionEventsByBatch = new Map<
    string,
    ProductionScheduleConsumptionEvent[]
  >();
  const eventsById = new Map<string, ProductionScheduleConsumptionEvent>();
  for (const event of consumptionEvents) {
    eventsById.set(event.id, event);
    const events = consumptionEventsByBatch.get(event.source_batch_id) ?? [];
    events.push(event);
    consumptionEventsByBatch.set(event.source_batch_id, events);
  }

  const lanes: ScheduleLaneModel[] = schedule.lanes
    .map((lane) => {
      const relevantBatches = lane.batches.filter((batch) =>
        relevantBatchIds.has(batch.id),
      );
      const allPackedBatches = packBatchTracks(
        relevantBatches,
        lane.role,
        showInventoryDwell,
        laneDisplay,
      );
      const packedBatches = allPackedBatches.filter(({ batch }) =>
        overlaps(
          batch,
          lane.role,
          showInventoryDwell,
          filters.start,
          filters.end,
        ),
      );
      return {
        ...lane,
        batches: packedBatches.map(({ batch }) => batch),
        packedBatches,
        trackCount:
          Math.max(0, ...allPackedBatches.map(({ track }) => track + 1)) || 1,
      };
    })
    .filter((lane) => lane.batches.length > 0)
    .sort(
      (left, right) =>
        right.bom_depth - left.bom_depth ||
        left.material.localeCompare(right.material),
    );
  const links = fallbackLinks(schedule);
  const downstreamByBatch = new Map<string, Set<string>>();
  const upstreamByBatch = new Map<string, Set<string>>();
  const downstreamEdgesByBatch = new Map<string, ScheduleLineageEdge[]>();
  const upstreamEdgesByBatch = new Map<string, ScheduleLineageEdge[]>();
  const linksByEvent = new Map<string, ProductionScheduleBatchLink>();
  for (const link of links) {
    const sourceBatchId = eventsById.get(link.event_id)?.source_batch_id;
    if (!sourceBatchId || !relevantBatchIds.has(sourceBatchId)) {
      continue;
    }
    const targetBatchIds = link.target_batch_ids.filter((targetBatchId) =>
      relevantBatchIds.has(targetBatchId),
    );
    for (const targetBatchId of targetBatchIds) {
      addAdjacent(downstreamByBatch, sourceBatchId, targetBatchId);
      addAdjacent(upstreamByBatch, targetBatchId, sourceBatchId);
      const edge = {
        sourceBatchId,
        targetBatchId,
        eventId: link.event_id,
      };
      downstreamEdgesByBatch.set(sourceBatchId, [
        ...(downstreamEdgesByBatch.get(sourceBatchId) ?? []),
        edge,
      ]);
      upstreamEdgesByBatch.set(targetBatchId, [
        ...(upstreamEdgesByBatch.get(targetBatchId) ?? []),
        edge,
      ]);
    }
    if (targetBatchIds.length > 0) {
      linksByEvent.set(link.event_id, {
        ...link,
        target_batch_ids: targetBatchIds,
      });
    }
  }
  const dispatchesByBatch = new Map<
    string,
    ProductionScheduleDispatchEvent[]
  >();
  const dispatchesById = new Map<string, ProductionScheduleDispatchEvent>();
  for (const event of schedule.dispatch_events ?? []) {
    dispatchesById.set(event.id, event);
    const events = dispatchesByBatch.get(event.batch_id) ?? [];
    events.push(event);
    dispatchesByBatch.set(event.batch_id, events);
  }

  const directUseByBatch = new Map<string, BatchDirectUse>();
  let usedElsewhereCount = 0;
  let unknownOutputCount = 0;
  for (const lane of lanes) {
    for (const batch of lane.batches) {
      const directUse = deriveBatchDirectUse(
        batch,
        hierarchyMaterials,
        consumptionEventsByBatch.get(batch.id),
        dispatchesByBatch.get(batch.id),
      );
      directUseByBatch.set(batch.id, directUse);
      if (directUse.state === "used_elsewhere") {
        usedElsewhereCount += 1;
      }
      if (directUse.hasUnknownOutput) {
        unknownOutputCount += 1;
      }
    }
  }

  const artifactDates = productionScheduleArtifactDates(
    schedule,
    relevantBatchIds,
  ).sort();
  const firstDate = artifactDates[0];
  const lastDate = artifactDates.at(-1);

  return {
    lanes,
    directUseByBatch,
    downstreamByBatch,
    upstreamByBatch,
    downstreamEdgesByBatch,
    upstreamEdgesByBatch,
    consumptionEventsByBatch,
    consumptionEventsById: eventsById,
    linksByEvent,
    dispatchesByBatch,
    dispatchesById,
    start:
      filters.start ??
      (firstDate
        ? dayString(scheduleDayNumber(firstDate) - DOMAIN_PADDING_DAYS)
        : null),
    end:
      filters.end ??
      (lastDate
        ? dayString(scheduleDayNumber(lastDate) + DOMAIN_PADDING_DAYS)
        : null),
    usedElsewhereCount,
    unknownOutputCount,
  };
};
