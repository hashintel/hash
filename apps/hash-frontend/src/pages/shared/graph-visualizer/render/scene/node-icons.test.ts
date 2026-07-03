/**
 * Guards for the incremental icon scan (R2): a grow-only flat structure frame
 * must resolve icons only for the added record range, an unchanged frame must
 * cost zero resolver calls (and keep the version stable), and a shrink /
 * tier change must fall back to a full rescan. Leaf caches reuse by `nodeIds`
 * identity.
 */
import { describe, expect, it, vi } from "vitest";

import { ClusterId } from "../../ids";
import { NodeIcons } from "./node-icons";

import type { StructureFrame } from "../../frames";
import type { IconAtlas } from "../gpu/icon-atlas";
import type { ClusterReference } from "../frame-connection";
import type { SceneCallbacks } from "./callbacks";
import type { SceneHandle } from "./handle";
import type { EntityId } from "@blockprotocol/type-system";

const FLAT_ID = ClusterId("flat:all");
const LEAF_ID = ClusterId("cluster:leaf-1");

function flatFrame(count: number): StructureFrame {
  return {
    version: 1,
    mode: "community-force",
    clusters: [],
    entityLayers: [],
    flatGraph: { layoutId: FLAT_ID, count },
    highwayLanes: [],
  } as unknown as StructureFrame;
}

function leafFrame(
  layers: readonly { layoutId: ClusterId; count: number }[]
): StructureFrame {
  return {
    version: 1,
    mode: "hierarchical-lod",
    clusters: [],
    entityLayers: layers,
    highwayLanes: [],
  } as unknown as StructureFrame;
}

function clusterRef(nodeIds: readonly string[]): ClusterReference {
  return { nodeIds } as unknown as ClusterReference;
}

interface Harness {
  readonly icons: NodeIcons<EntityId>;
  readonly clusters: Map<ClusterId, ClusterReference>;
  readonly resolveCalls: () => number;
  setStructure(frame: StructureFrame | undefined): void;
  ensuredKeys(): string[][];
}

function newHarness(): Harness {
  let structure: StructureFrame | undefined;
  const clusters = new Map<ClusterId, ClusterReference>();
  const resolveNodeIcon = vi.fn((entityId: EntityId): string | null =>
    entityId.endsWith("0") ? null : `icon:${entityId}`
  );
  const ensureIcons = vi.fn();

  const handle = {
    getStructure: () => structure,
    getClusters: () => clusters,
    resolveNodeId: (layoutId: ClusterId, index: number) =>
      `${layoutId}/${index}` as EntityId,
  } as unknown as SceneHandle<EntityId>;

  const icons = new NodeIcons<EntityId>({
    handle,
    callbacks: () =>
      ({ resolveNodeIcon } as unknown as SceneCallbacks<EntityId>),
    iconAtlas: { ensureIcons } as unknown as IconAtlas,
  });

  return {
    icons,
    clusters,
    resolveCalls: () => resolveNodeIcon.mock.calls.length,
    setStructure(frame) {
      structure = frame;
    },
    ensuredKeys: () => ensureIcons.mock.calls.map(([keys]) => keys as string[]),
  };
}

describe("NodeIcons, incremental flat scan", () => {
  it("resolves only the added range on a grow-only structure frame", () => {
    const harness = newHarness();
    harness.clusters.set(FLAT_ID, clusterRef([]));

    harness.setStructure(flatFrame(100));
    harness.icons.rebuild();
    expect(harness.resolveCalls()).toBe(100);
    expect(harness.icons.flatNames).toHaveLength(100);
    const versionAfterBuild = harness.icons.version;

    // Streamed growth: 100 -> 150 must resolve exactly the 50 new records.
    harness.setStructure(flatFrame(150));
    harness.icons.rebuild();
    expect(harness.resolveCalls()).toBe(150);
    expect(harness.icons.flatNames).toHaveLength(150);
    expect(harness.icons.flatScannedCount).toBe(150);
    expect(harness.icons.version).toBe(versionAfterBuild + 1);

    // Confirms the incremental scan neither corrupts the retained prefix nor skips the new tail.
    expect(harness.icons.flatNames[0]).toBe(null); // ".../0" resolves null
    expect(harness.icons.flatNames[1]).toBe(`icon:${FLAT_ID}/1`);
    expect(harness.icons.flatNames[149]).toBe(`icon:${FLAT_ID}/149`);
  });

  it("does nothing on a frame with an unchanged count (e.g. a Louvain-only refresh)", () => {
    const harness = newHarness();
    harness.clusters.set(FLAT_ID, clusterRef([]));

    harness.setStructure(flatFrame(80));
    harness.icons.rebuild();
    const version = harness.icons.version;
    const names = harness.icons.flatNames;

    harness.icons.rebuild();
    expect(harness.resolveCalls()).toBe(80);
    expect(harness.icons.version).toBe(version);
    expect(harness.icons.flatNames).toBe(names);
  });

  it("rescans fully on a shrink (defensive: add-only stores cannot shrink)", () => {
    const harness = newHarness();
    harness.clusters.set(FLAT_ID, clusterRef([]));

    harness.setStructure(flatFrame(100));
    harness.icons.rebuild();

    harness.setStructure(flatFrame(90));
    harness.icons.rebuild();
    expect(harness.resolveCalls()).toBe(190);
    expect(harness.icons.flatNames).toHaveLength(90);
    expect(harness.icons.flatScannedCount).toBe(90);
  });

  it("clears the flat cache when the tier leaves flat mode, and rescans on return", () => {
    const harness = newHarness();
    harness.clusters.set(FLAT_ID, clusterRef([]));

    harness.setStructure(flatFrame(60));
    harness.icons.rebuild();
    expect(harness.icons.flatNames).toHaveLength(60);

    harness.setStructure(leafFrame([]));
    harness.icons.rebuild();
    expect(harness.icons.flatNames).toHaveLength(0);

    harness.setStructure(flatFrame(60));
    harness.icons.rebuild();
    expect(harness.resolveCalls()).toBe(120);
    expect(harness.icons.flatNames).toHaveLength(60);
  });

  it("only sends the added range's keys to the atlas on an incremental scan", () => {
    const harness = newHarness();
    harness.clusters.set(FLAT_ID, clusterRef([]));

    harness.setStructure(flatFrame(3));
    harness.icons.rebuild();
    harness.setStructure(flatFrame(5));
    harness.icons.rebuild();

    const [firstKeys, secondKeys] = harness.ensuredKeys();
    expect(firstKeys).toEqual([`icon:${FLAT_ID}/1`, `icon:${FLAT_ID}/2`]);
    expect(secondKeys).toEqual([`icon:${FLAT_ID}/3`, `icon:${FLAT_ID}/4`]);
  });
});

describe("NodeIcons, leaf caches", () => {
  it("reuses a leaf's keys while its nodeIds identity holds, rescans when it changes", () => {
    const harness = newHarness();
    const firstNodeIds = ["1", "2", "3"];
    harness.clusters.set(LEAF_ID, clusterRef(firstNodeIds));
    harness.setStructure(leafFrame([{ layoutId: LEAF_ID, count: 3 }]));

    harness.icons.rebuild();
    expect(harness.resolveCalls()).toBe(3);
    const cached = harness.icons.leafNames.get(LEAF_ID);

    // Same identity (e.g. a growth republish kept nodeIds): reuse, no rescan.
    harness.icons.rebuild();
    expect(harness.resolveCalls()).toBe(3);
    expect(harness.icons.leafNames.get(LEAF_ID)).toBe(cached);

    // A leaf layout rebuild adopts fresh nodeIds: same count, different membership.
    harness.clusters.set(LEAF_ID, clusterRef(["1", "2", "4"]));
    harness.icons.rebuild();
    expect(harness.resolveCalls()).toBe(6);
    expect(harness.icons.leafNames.get(LEAF_ID)).not.toBe(cached);
  });
});
