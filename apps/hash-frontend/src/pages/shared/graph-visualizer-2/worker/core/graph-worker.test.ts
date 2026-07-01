/**
 * Guards for the change-aware {@link GraphWorker.commitStructure} flat-tier
 * path: a commit with nothing new must do no structural work (no rebuild, no
 * re-emit), a colour-only change must restyle without rebuilding the layout,
 * and streaming a graph in batches must land in the same committed state as
 * ingesting it in one shot.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { defaultVizConfig } from "../../config";
import { ClusterId } from "../../ids";
import {
  benchEntityId,
  benchNodeTypeUrl,
  benchTypeSchemas,
  buildIngestEntities,
} from "../bench-fixtures";
import { GraphWorker } from "./graph-worker";

import type { PositionsFrame, StructureFrame } from "../../frames";
import type { GraphShape } from "../bench-fixtures";
import type { IngestEntity } from "../protocol";

/** flat-force stays under `flatLayoutExitNodes` (250); community-force is above it. */
const FLAT_FORCE: GraphShape = {
  nodeCount: 80,
  linkCount: 160,
  typeCount: 8,
  hubCount: 8,
  rootFraction: 1,
  seed: 7,
};

const COMMUNITY_FORCE: GraphShape = {
  nodeCount: 600,
  linkCount: 1_500,
  typeCount: 16,
  hubCount: 30,
  rootFraction: 1,
  seed: 9,
};

interface Harness {
  readonly worker: GraphWorker;
  readonly structure: ReturnType<typeof vi.fn>;
  readonly positions: ReturnType<typeof vi.fn>;
  readonly layout: ReturnType<typeof vi.fn>;
  /** Count of LAYOUT_CREATED / LAYOUT_DESTROYED messages (i.e. layout rebuilds). */
  layoutLifecycleCalls(): number;
  /** The `count` from the most recent flat structure frame. */
  lastFlatCount(): number | undefined;
}

function newHarness(): Harness {
  const worker = new GraphWorker(defaultVizConfig);
  const structure = vi.fn();
  const positions = vi.fn();
  const layout = vi.fn();
  worker.onStructureFrame = structure;
  worker.onPositionsFrame = positions;
  worker.onLayoutMessage = layout;
  return {
    worker,
    structure,
    positions,
    layout,
    layoutLifecycleCalls() {
      return layout.mock.calls.filter(([msg]) => {
        const { type } = msg as { readonly type: string };
        return type === "LAYOUT_CREATED" || type === "LAYOUT_DESTROYED";
      }).length;
    },
    lastFlatCount() {
      const calls = structure.mock.calls;
      const last = calls[calls.length - 1]?.[0] as
        | { flatGraph?: { count: number } }
        | undefined;
      return last?.flatGraph?.count;
    },
  };
}

/** Register types, ingest the whole shape, and run the first (building) commit. */
function prime(shape: GraphShape): Harness {
  const harness = newHarness();
  harness.worker.registerTypes(benchTypeSchemas(shape.typeCount), []);
  const deltas = harness.worker.ingestBatch(buildIngestEntities(shape));
  harness.worker.commitStructure({ deltas });
  return harness;
}

interface TopLevelCluster {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly count: number;
}

/** Top-level cluster id -> world position/size, from the latest emitted frames. */
function topLevelSnapshot(harness: Harness): Map<string, TopLevelCluster> {
  const structureCalls = harness.structure.mock.calls;
  const positionsCalls = harness.positions.mock.calls;
  const structure = structureCalls[structureCalls.length - 1]?.[0] as
    | StructureFrame
    | undefined;
  const positions = positionsCalls[positionsCalls.length - 1]?.[0] as
    | PositionsFrame
    | undefined;
  const snapshot = new Map<string, TopLevelCluster>();
  if (!structure || !positions) {
    return snapshot;
  }
  for (const [index, cluster] of structure.clusters.entries()) {
    snapshot.set(cluster.id, {
      x: positions.clusterPositions[index * 2] ?? 0,
      y: positions.clusterPositions[index * 2 + 1] ?? 0,
      radius: cluster.radius,
      count: cluster.count,
    });
  }
  return snapshot;
}

/** Total absolute position movement of clusters present in both snapshots. */
function positionDrift(
  before: Map<string, TopLevelCluster>,
  after: Map<string, TopLevelCluster>,
): number {
  let total = 0;
  for (const [id, next] of after) {
    const prev = before.get(id);
    if (prev) {
      total += Math.abs(next.x - prev.x) + Math.abs(next.y - prev.y);
    }
  }
  return total;
}

describe("GraphWorker.commitStructure — flat tier", () => {
  // The trailing-Louvain linger uses setTimeout; fake only timers so it can't
  // fire mid-test (MessageChannel scheduling and performance.now stay real).
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  for (const shape of [FLAT_FORCE, COMMUNITY_FORCE]) {
    const tier = shape === FLAT_FORCE ? "flat-force" : "community-force";

    it(`does no work on a redundant commit (${tier})`, () => {
      const harness = prime(shape);
      // The build commit emitted a structure + positions frame and created the
      // flat layout; clear the spies and re-commit with nothing changed.
      harness.structure.mockClear();
      harness.positions.mockClear();
      harness.layout.mockClear();

      harness.worker.commitStructure();

      expect(harness.structure).not.toHaveBeenCalled();
      expect(harness.positions).not.toHaveBeenCalled();
      expect(harness.layout).not.toHaveBeenCalled();
    });

    it(`restyles without rebuilding on a type change (${tier})`, () => {
      const harness = prime(shape);
      harness.structure.mockClear();
      harness.positions.mockClear();
      harness.layout.mockClear();

      // A type (re)registration recolours nodes without adding any; the flat
      // path must re-emit style but must not tear down / recreate the layout.
      harness.worker.commitStructure({ rebuildTree: true });

      expect(harness.structure).toHaveBeenCalledTimes(1);
      expect(harness.positions).toHaveBeenCalledTimes(1);
      expect(harness.layoutLifecycleCalls()).toBe(0);
    });
  }

  it("re-emits when new nodes arrive", () => {
    const harness = newHarness();
    const entities = buildIngestEntities(FLAT_FORCE);
    // Nodes are the leading `nodeCount` entries; split them across two batches.
    const half = FLAT_FORCE.nodeCount / 2;

    harness.worker.commitStructure({
      deltas: harness.worker.ingestBatch(entities.slice(0, half)),
    });
    expect(harness.lastFlatCount()).toBe(half);

    harness.structure.mockClear();
    harness.worker.commitStructure({
      deltas: harness.worker.ingestBatch(entities.slice(half)),
    });

    expect(harness.structure).toHaveBeenCalledTimes(1);
    expect(harness.lastFlatCount()).toBe(FLAT_FORCE.nodeCount);
  });
});

describe("GraphWorker.commitStructure — streaming equals bulk", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reaches the same committed node/link/flat state whether batched or bulk", () => {
    const entities = buildIngestEntities(COMMUNITY_FORCE);

    const bulk = prime(COMMUNITY_FORCE);

    const streamed = newHarness();
    streamed.worker.registerTypes(
      benchTypeSchemas(COMMUNITY_FORCE.typeCount),
      [],
    );
    const batchSize = 100;
    for (let start = 0; start < entities.length; start += batchSize) {
      const chunk = entities.slice(start, start + batchSize);
      streamed.worker.commitStructure({
        deltas: streamed.worker.ingestBatch(chunk),
      });
    }

    expect(streamed.worker.nodeCount).toBe(bulk.worker.nodeCount);
    expect(streamed.worker.linkCount).toBe(bulk.worker.linkCount);
    expect(streamed.worker.mode).toBe(bulk.worker.mode);
    expect(streamed.lastFlatCount()).toBe(bulk.lastFlatCount());
    expect(streamed.lastFlatCount()).toBe(COMMUNITY_FORCE.nodeCount);
  });
});

/** Above `communityColorExitNodes` (5000) the worker enters the hierarchical tier. */
const HIERARCHICAL: GraphShape = {
  nodeCount: 6_000,
  linkCount: 12_000,
  typeCount: 20,
  hubCount: 60,
  rootFraction: 1,
  seed: 13,
};

describe("GraphWorker.commitStructure — hierarchical tier", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("commits clusters and reuses handleViewport's cut without re-emitting stale state", () => {
    const harness = prime(HIERARCHICAL);
    expect(harness.worker.mode).toBe("hierarchical-lod");

    // A viewport change computes a cut then commits it; the commit must reuse
    // that cut (F10) and emit a hierarchical (cluster) frame, not a flat one.
    harness.structure.mockClear();
    harness.worker.handleViewport({
      zoom: 1,
      centerX: 0,
      centerY: 0,
      width: 1600,
      height: 900,
    });

    const frames = harness.structure.mock.calls.map(
      ([frame]) => frame as { mode: string; flatGraph?: unknown },
    );
    expect(frames.length).toBeGreaterThan(0);
    for (const frame of frames) {
      expect(frame.mode).toBe("hierarchical-lod");
      expect(frame.flatGraph).toBeUndefined();
    }
  });

  it("does no work on a redundant hierarchical re-commit", () => {
    const harness = prime(HIERARCHICAL);
    harness.worker.handleViewport({
      zoom: 1,
      centerX: 0,
      centerY: 0,
      width: 1600,
      height: 900,
    });

    // Nothing changed since that commit: same tree/epoch, links, and cut. The
    // no-op fast path must skip CutIndex/aggregation/layers and emit nothing.
    harness.structure.mockClear();
    harness.positions.mockClear();
    harness.worker.commitStructure();

    expect(harness.structure).not.toHaveBeenCalled();
    expect(harness.positions).not.toHaveBeenCalled();
  });

  it("does not commit when a pin leaves the cut unchanged", () => {
    const harness = prime(HIERARCHICAL);
    harness.worker.handleViewport({
      zoom: 1,
      centerX: 0,
      centerY: 0,
      width: 1600,
      height: 900,
    });

    // A cluster that isn't in the tree can't open a new path, so the cut is
    // identical and pin() must not trigger a commit (it should mirror the
    // wouldChange guard handleViewport uses).
    harness.structure.mockClear();
    harness.positions.mockClear();
    harness.worker.pin(ClusterId("cluster:does-not-exist"));

    expect(harness.structure).not.toHaveBeenCalled();
    expect(harness.positions).not.toHaveBeenCalled();
  });

  // Top-level re-layout is driven by INGEST, not by type (re)registration: a
  // trickle of new members leaves the overview stable (no churn on every tiny
  // expansion), but once a cluster grows past the re-warm threshold the macro
  // layout re-settles -- with no rebuildTree / REGISTER_TYPES involved.
  it("re-arranges the top level on significant known-type growth, not on a trickle", () => {
    const harness = prime(HIERARCHICAL);
    // Zoomed out: every top-level cluster stays collapsed, so the emitted
    // clusters ARE the macro layout's nodes.
    harness.worker.handleViewport({
      zoom: 0.02,
      centerX: 0,
      centerY: 0,
      width: 1600,
      height: 900,
    });

    const before = topLevelSnapshot(harness);
    expect(before.size).toBeGreaterThan(1);

    // A trickle: a few nodes spread across existing types (already-known). Every
    // top-level cluster grows a little, but none crosses the re-warm threshold.
    const trickle: IngestEntity[] = [];
    for (let index = 0; index < 40; index++) {
      trickle.push({
        entityId: benchEntityId(1_000_000 + index),
        entityTypeIds: [benchNodeTypeUrl(index % HIERARCHICAL.typeCount)],
        isLink: false,
        isRoot: true,
      });
    }
    harness.structure.mockClear();
    harness.positions.mockClear();
    harness.worker.commitStructure({
      deltas: harness.worker.ingestBatch(trickle),
    });
    const afterTrickle = topLevelSnapshot(harness);

    // The growth WAS applied (member counts rose) ...
    expect(
      [...afterTrickle].some(
        ([id, cluster]) => cluster.count > (before.get(id)?.count ?? 0),
      ),
    ).toBe(true);
    // ... yet no single cluster grew enough to re-warm: the overview holds.
    expect(positionDrift(before, afterTrickle)).toBe(0);

    // A real expansion: many nodes into ONE existing type. That cluster grows
    // past the threshold, so the macro layout re-warms and the top level moves
    // -- driven purely by ingest, with NO rebuildTree / type registration.
    const surge: IngestEntity[] = [];
    for (let index = 0; index < 400; index++) {
      surge.push({
        entityId: benchEntityId(2_000_000 + index),
        entityTypeIds: [benchNodeTypeUrl(0)],
        isLink: false,
        isRoot: true,
      });
    }
    harness.worker.commitStructure({
      deltas: harness.worker.ingestBatch(surge),
    });
    const afterSurge = topLevelSnapshot(harness);

    expect(positionDrift(afterTrickle, afterSurge)).toBeGreaterThan(0);
  });
});

describe("GraphWorker.registerTypes — change classification", () => {
  it("reports no change on an identical re-registration", () => {
    const worker = new GraphWorker(defaultVizConfig);
    const schemas = benchTypeSchemas(8);

    expect(worker.registerTypes(schemas, []).typesChanged).toBe(true);

    const again = worker.registerTypes(schemas, []);
    expect(again.typesChanged).toBe(false);
    expect(again.propertyTitlesChanged).toBe(false);
  });

  it("reports a change when a genuinely new type is registered", () => {
    const worker = new GraphWorker(defaultVizConfig);
    worker.registerTypes(benchTypeSchemas(8), []);

    // benchTypeSchemas(10) is a superset -- two new node types -- which can
    // change grouping/colour and so must be reported as a change.
    expect(worker.registerTypes(benchTypeSchemas(10), []).typesChanged).toBe(
      true,
    );
  });
});
