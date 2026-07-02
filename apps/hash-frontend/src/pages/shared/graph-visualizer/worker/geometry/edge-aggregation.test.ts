/**
 * Incremental-update guards for {@link EdgeAggregator}. The invariant under
 * test is #5 from the module header: aggregates are additive, so any sequence
 * of incremental updates must land in the same state as a full recompute.
 * The regressions covered:
 *
 * - a link-only batch (both endpoints already visible) must show up without
 *   an owner change to trigger it,
 * - a pending endpoint resolving must move the link from hidden to its real
 *   classification without corrupting an unrelated pair's count,
 * - hidden bookkeeping must not drift below the true count.
 */

import { describe, expect, it } from "vitest";

import { defaultVizConfig } from "../../config";
import { ClusterId, EntityIndex, TypeSetId } from "../../ids";
import { LinkStore } from "../store/link";
import { TypeRegistry } from "../store/type-registry";
import { EdgeAggregator } from "./edge-aggregation";

import type { TypeSetGroup, TypeSetStore } from "../store/type-set";
import type { CutView } from "./edge-aggregation";
import type { EntityId } from "@blockprotocol/type-system";

const TYPE = TypeSetId(0);

/** A fixed entity -> owner assignment with every owner in block mode. */
function cutOf(
  assignments: Record<number, string>,
  entityModeIds: readonly string[] = [],
): CutView {
  const owners = new Map<EntityIndex, ClusterId>();
  for (const [entityIdx, owner] of Object.entries(assignments)) {
    owners.set(EntityIndex(Number(entityIdx)), ClusterId(owner));
  }
  const entityMode = new Set(entityModeIds.map(ClusterId));
  return {
    size: owners.size,
    ownerOf: (entityIdx) => owners.get(entityIdx),
    isEntityMode: (clusterId) => entityMode.has(clusterId),
    entries: () => owners.entries(),
  };
}

/** TypeSetStore stub: the aggregator only calls getById for labels/colors. */
const typeSets = {
  getById: (): TypeSetGroup | undefined => undefined,
} as unknown as TypeSetStore;

const types = new TypeRegistry();

function update(aggregator: EdgeAggregator, cut: CutView, links: LinkStore) {
  return aggregator.update(cut, links, typeSets, types, defaultVizConfig);
}

const entityId = (index: number) =>
  `11111111-1111-4111-8111-111111111111~22222222-2222-4222-8222-${index
    .toString(16)
    .padStart(12, "0")}` as EntityId;

describe("EdgeAggregator incremental updates", () => {
  it("aggregates a link-only batch between already-visible entities", () => {
    const links = new LinkStore();
    const cut = cutOf({ 0: "A", 1: "B" });
    const aggregator = new EdgeAggregator();

    links.insert(EntityIndex(0), EntityIndex(1), TYPE, EntityIndex(10));
    const first = update(aggregator, cut, links);
    expect(first.exactLogicalEdgeCount).toBe(1);

    // Same cut, one new link: no entity changed owner, so only the
    // appended-tail pass can pick this up.
    links.insert(EntityIndex(0), EntityIndex(1), TYPE, EntityIndex(11));
    const second = update(aggregator, cut, links);

    expect(second.exactLogicalEdgeCount).toBe(2);
    const lane = second.visualEdges.find((edge) => edge.kind === "aggregate");
    expect(lane?.count).toBe(2);
  });

  it("moves a link from hidden to aggregate when its endpoint resolves", () => {
    const links = new LinkStore();
    const aggregator = new EdgeAggregator();

    // A->B present from the start; A->C pending on C's arrival.
    links.insert(EntityIndex(0), EntityIndex(1), TYPE, EntityIndex(10));
    const pendingLink = links.insert(EntityIndex(0), -1, TYPE, EntityIndex(11));
    links.addPending(entityId(2), pendingLink, "right");

    const before = update(aggregator, cutOf({ 0: "A", 1: "B" }), links);
    expect(before.exactLogicalEdgeCount).toBe(2);
    expect(before.omittedLogicalEdgeCount).toBe(1);

    // C arrives: resolve the pending side, C enters the cut owned by "C".
    for (const { linkId, side } of links.takePending(entityId(2))!) {
      links.resolveEndpoint(linkId, side, EntityIndex(2));
    }
    const after = update(aggregator, cutOf({ 0: "A", 1: "B", 2: "C" }), links);

    expect(after.omittedLogicalEdgeCount).toBe(0);
    expect(after.exactLogicalEdgeCount).toBe(2);

    // Both lanes intact: the A-B pair must not have been decremented by the
    // undo of the formerly-hidden A-C link.
    const counts = after.visualEdges
      .filter((edge) => edge.kind === "aggregate")
      .map((edge) => edge.count)
      .sort();
    expect(counts).toEqual([1, 1]);
  });

  it("matches a from-scratch recompute after mixed incremental batches", () => {
    const links = new LinkStore();
    const incremental = new EdgeAggregator();

    const cut1 = cutOf({ 0: "A", 1: "A", 2: "B" }, ["A"]);
    links.insert(EntityIndex(0), EntityIndex(1), TYPE, EntityIndex(10));
    links.insert(EntityIndex(1), EntityIndex(2), TYPE, EntityIndex(11));
    update(incremental, cut1, links);

    // Batch 2: a new entity arrives with a pending link resolving to it,
    // plus a link-only addition between existing entities.
    const pending = links.insert(-1, EntityIndex(2), TYPE, EntityIndex(12));
    links.addPending(entityId(3), pending, "left");
    for (const { linkId, side } of links.takePending(entityId(3))!) {
      links.resolveEndpoint(linkId, side, EntityIndex(3));
    }
    links.insert(EntityIndex(0), EntityIndex(2), TYPE, EntityIndex(13));

    const cut2 = cutOf({ 0: "A", 1: "A", 2: "B", 3: "C" }, ["A"]);
    const incrementalFrame = update(incremental, cut2, links);

    // Reference: a fresh aggregator over the same final store and cut. Drain
    // the log first -- a fresh instance recomputes from current values.
    links.drainResolvedEndpoints();
    const fresh = new EdgeAggregator();
    const freshFrame = update(fresh, cut2, links);

    expect(incrementalFrame.exactLogicalEdgeCount).toBe(
      freshFrame.exactLogicalEdgeCount,
    );
    expect(incrementalFrame.omittedLogicalEdgeCount).toBe(
      freshFrame.omittedLogicalEdgeCount,
    );

    const laneCounts = (frame: typeof freshFrame) =>
      frame.visualEdges.map((edge) => `${edge.visualKey}:${edge.count}`).sort();
    expect(laneCounts(incrementalFrame)).toEqual(laneCounts(freshFrame));
  });
});
