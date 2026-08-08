import { describe, expect, it } from "vitest";

import {
  collapsibleLayerIds,
  collapseStateKey,
  enumerateCollapseStates,
  visibleGraph,
} from "./collapse";

import type { Edge, Layer } from "../model";

const layer = (id: string, fileCount = 1): Layer => ({
  id,
  name: id.split(".").at(-1) ?? id,
  parent: id.includes(".") ? id.slice(0, id.lastIndexOf(".")) : null,
  package: id.startsWith("core") ? "@test/core" : "@test/ui",
  role: `role of ${id}`,
  declaredIn: `src/${id}/index.ts`,
  prose: null,
  boundaries: [],
  invariants: [],
  entryPoints: [],
  references: [],
  files: [],
  fileCount,
  lineCount: fileCount * 10,
});

const edge = (from: string, to: string, fileDependencies = 1): Edge => ({
  from,
  to,
  fileDependencies,
  examples: [],
  crossesPackage: from.split(".")[0] !== to.split(".")[0],
});

/**
 * Mirrors the shape of the real model: a root with a nested parent inside it,
 * so folding the root makes the inner parent's own state unobservable.
 */
const layers = [
  layer("core"),
  layer("core.engine"),
  layer("core.sim"),
  layer("core.sim.step"),
  layer("core.sim.rng"),
  layer("ui"),
  layer("ui.views"),
  layer("standalone"),
];

describe("enumerateCollapseStates", () => {
  it("enumerates only reachable states, not every combination", () => {
    const states = enumerateCollapseStates(layers);

    // core: folded, or expanded × (core.sim folded | expanded) = 3
    // ui: folded, or expanded = 2   →   3 × 2 = 6, not 2^3 = 8.
    expect(states).toHaveLength(6);
    expect(states.map((state) => state.key).sort()).toEqual([
      "_",
      "core",
      "core+ui",
      "core.sim",
      "core.sim+ui",
      "ui",
    ]);
  });

  it("does not enumerate a nested parent's state once its ancestor is folded", () => {
    const keys = enumerateCollapseStates(layers).map((state) => state.key);

    expect(keys).not.toContain("core+core.sim");
  });

  it("gives the empty state a stable key", () => {
    expect(collapseStateKey([])).toBe("_");
    expect(collapseStateKey(["b", "a"])).toBe("a+b");
  });
});

describe("collapsibleLayerIds", () => {
  it("lists only layers that have children", () => {
    expect(collapsibleLayerIds(layers)).toEqual(["core", "core.sim", "ui"]);
  });
});

describe("visibleGraph", () => {
  it("shows every layer when nothing is folded", () => {
    const { nodes } = visibleGraph(layers, [], []);

    expect(nodes.map((node) => node.id)).toEqual(
      layers.map((l) => l.id).sort(),
    );
    expect(nodes.every((node) => !node.collapsed)).toBe(true);
  });

  it("hides descendants of a folded layer", () => {
    const { nodes } = visibleGraph(layers, [], ["core"]);

    expect(nodes.map((node) => node.id)).toEqual([
      "core",
      "standalone",
      "ui",
      "ui.views",
    ]);
  });

  it("rolls hidden file counts up into the folded node", () => {
    const { nodes } = visibleGraph(layers, [], ["core"]);
    const core = nodes.find((node) => node.id === "core");

    // core + engine + sim + step + rng, one file each.
    expect(core?.fileCount).toBe(5);
    expect(core?.foldedLayers).toBe(4);
    expect(core?.collapsed).toBe(true);
  });

  it("re-points an edge at the folded ancestor that stands in for it", () => {
    const { edges } = visibleGraph(
      layers,
      [edge("core.sim.step", "ui.views", 3)],
      ["core", "ui"],
    );

    expect(edges).toEqual([
      { from: "core", to: "ui", forward: 3, reverse: 0, crossesPackage: true },
    ]);
  });

  it("sums every edge that collapses onto the same pair", () => {
    const { edges } = visibleGraph(
      layers,
      [edge("core.sim.step", "ui.views", 3), edge("core.engine", "ui", 2)],
      ["core", "ui"],
    );

    expect(edges).toHaveLength(1);
    expect(edges[0]?.forward).toBe(5);
  });

  it("counts an edge between two folded siblings as internal, not drawn", () => {
    const { nodes, edges } = visibleGraph(
      layers,
      [edge("core.sim.step", "core.sim.rng", 4)],
      ["core"],
    );

    expect(edges).toEqual([]);
    expect(nodes.find((node) => node.id === "core")?.internalDependencies).toBe(
      4,
    );
  });

  it("counts a container-to-child edge as internal rather than drawing a self-arrow", () => {
    // `core.sim.step` imports from `core.sim`'s own files. Both are visible, and
    // one contains the other, so an arrow between them would point into its own box.
    const { nodes, edges } = visibleGraph(
      layers,
      [edge("core.sim.step", "core.sim", 2)],
      [],
    );

    expect(edges).toEqual([]);
    expect(
      nodes.find((node) => node.id === "core.sim")?.internalDependencies,
    ).toBe(2);
  });

  it("merges a reciprocal pair into one edge keeping both counts", () => {
    const { edges } = visibleGraph(
      layers,
      [edge("core.engine", "ui", 5), edge("ui", "core.engine", 2)],
      [],
    );

    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      from: "core.engine",
      to: "ui",
      forward: 5,
      reverse: 2,
    });
  });

  it("keeps a layer's own files out of its descendants' roll-up when expanded", () => {
    const { nodes } = visibleGraph(layers, [], []);
    const core = nodes.find((node) => node.id === "core");

    expect(core?.fileCount).toBe(1);
    expect(core?.foldedLayers).toBe(0);
  });

  it("reports crossesPackage when any contributing edge crosses one", () => {
    const { edges } = visibleGraph(
      layers,
      [edge("core.engine", "core.sim.step", 1), edge("core.engine", "ui", 1)],
      ["core.sim"],
    );

    const crossing = edges.find((candidate) => candidate.to === "ui");
    expect(crossing?.crossesPackage).toBe(true);

    const internal = edges.find((candidate) => candidate.to === "core.sim");
    expect(internal?.crossesPackage).toBe(false);
  });
});
