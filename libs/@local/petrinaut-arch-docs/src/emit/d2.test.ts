import { describe, expect, it } from "vitest";

import { buildNeighbourhoodDiagram } from "./d2";

import type { Edge, Layer } from "../model";

/**
 * The neighbourhood diagram is the one a reader opens first, and the only diagram
 * that decides what to leave out. These tests pin what it draws and, more
 * importantly, what it says about the parts it does not draw: a cap that silently
 * dropped neighbours would make a layer look less connected than it is.
 */

const layer = (id: string, name = id): Layer => ({
  id,
  name,
  parent: id.includes(".") ? id.slice(0, id.lastIndexOf(".")) : null,
  package: "@test/pkg",
  role: `role of ${id}`,
  declaredIn: `src/${id}/index.ts`,
  prose: null,
  references: [],
  files: [`src/${id}/index.ts`],
  fileCount: 1,
  lineCount: 1,
});

const edge = (from: string, to: string, count = 1): Edge => ({
  from,
  to,
  provenance: "imports",
  fileDependencies: count,
  examples: [],
  crossesPackage: false,
});

const declaredEdge = (from: string, to: string, protocol: string): Edge => ({
  from,
  to,
  provenance: "declared",
  protocol,
  declaredIn: `src/${from}/boundary.ts`,
  line: 1,
  crossesPackage: false,
});

const build = (focus: string, layers: Layer[], edges: Edge[]): string =>
  buildNeighbourhoodDiagram(focus, layers, edges, "test");

describe("buildNeighbourhoodDiagram", () => {
  const layers = [layer("core"), layer("core.a"), layer("core.b")];

  it("draws dependencies and dependents in the right directions", () => {
    const diagram = build("core.a", layers, [
      edge("core.a", "core.b", 3),
      edge("core", "core.a", 2),
    ]);

    expect(diagram).toContain("core_a -> core_b");
    expect(diagram).toContain("core -> core_a");
    expect(diagram).toContain("3 file-level dependencies");
    expect(diagram).toContain("2 file-level dependencies");
  });

  it("marks the focus and labels nodes with their role", () => {
    const diagram = build("core.a", layers, [edge("core.a", "core.b")]);

    expect(diagram).toContain("core_a: {class: [core; focus]");
    expect(diagram).toContain("role of core.b");
  });

  it("flattens dotted ids so D2 does not synthesise container boxes", () => {
    const diagram = build("core.a", layers, [edge("core.a", "core.b")]);

    expect(diagram).toContain("core_a");
    expect(diagram).not.toContain("core.a:");
  });

  it("keeps both directions between a reciprocal pair", () => {
    const diagram = build("core.a", layers, [
      edge("core.a", "core.b", 5),
      edge("core.b", "core.a", 7),
    ]);

    expect(diagram).toContain("core_a -> core_b");
    expect(diagram).toContain("core_b -> core_a");
    expect(diagram).toContain("5 file-level dependencies");
    expect(diagram).toContain("7 file-level dependencies");
  });

  it("says so when a layer has no dependencies either way", () => {
    const diagram = build("core.a", layers, [edge("core", "core.b")]);

    expect(diagram).toContain("no dependencies either way");
  });

  it("draws a declared edge dashed, labelled with its protocol", () => {
    const diagram = build("core.a", layers, [
      declaredEdge("core.a", "core.b", "JSON lines over stdio"),
    ]);

    expect(diagram).toContain(
      'core_a -> core_b: "JSON lines over stdio" {class: declared',
    );
    // The declared neighbour gets a node even though no import reaches it.
    expect(diagram).toContain("core_b: {class: core");
    expect(diagram).not.toContain("no dependencies either way");
  });

  describe("when a layer has more neighbours than fit", () => {
    const many = [
      layer("hub"),
      ...Array.from({ length: 15 }, (_, index) => layer(`n${index}`)),
    ];
    // Descending weights, so the cap keeps the heaviest twelve.
    const heavy = Array.from({ length: 15 }, (_, index) =>
      edge(`n${index}`, "hub", 15 - index),
    );

    it("draws twelve and collapses the rest into one node", () => {
      const diagram = build("hub", many, heavy);

      const drawn = [...diagram.matchAll(/^n\d+: \{/gmu)];
      expect(drawn).toHaveLength(12);
      expect(diagram).toContain("+3 further layers");
    });

    it("reports the elided dependencies rather than dropping them", () => {
      const diagram = build("hub", many, heavy);

      // The three lightest edges carry 3, 2 and 1 dependencies.
      expect(diagram).toContain("6 file-level dependencies");
      expect(diagram).toContain("elided -> hub");
    });

    it("keeps the heaviest neighbours and discards the lightest", () => {
      const diagram = build("hub", many, heavy);

      expect(diagram).toContain("n0: {");
      expect(diagram).not.toMatch(/^n14: \{/mu);
    });

    it("points the elided edge outward when the focus is the importer", () => {
      const outward = Array.from({ length: 15 }, (_, index) =>
        edge("hub", `n${index}`, 15 - index),
      );
      const diagram = build("hub", many, outward);

      expect(diagram).toContain("hub -> elided");
      expect(diagram).not.toContain("elided -> hub");
    });
  });
});
