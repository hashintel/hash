import { describe, expect, it } from "vitest";

import {
  checkAncestorsDeclared,
  checkEmptyLayers,
  checkRuleTargets,
  checkRules,
  withinScope,
} from "./check";
import { ARCHITECTURE_MODEL_VERSION } from "./model";

import type { ArchitectureModel, Edge, Layer } from "./model";

/**
 * These are the checks a build fails on, so each one is pinned in both directions:
 * it fires when the rule is broken, and stays quiet when it is not. A check that
 * silently stops firing is worse than no check, because the docs keep claiming to
 * be verified.
 */

const layer = (overrides: Partial<Layer> & Pick<Layer, "id">): Layer => ({
  name: overrides.id,
  parent:
    overrides.id.lastIndexOf(".") === -1
      ? null
      : overrides.id.slice(0, overrides.id.lastIndexOf(".")),
  package: "@test/pkg",
  role: "role",
  declaredIn: `src/${overrides.id}/README.md`,
  prose: null,
  references: [],
  files: ["src/a.ts"],
  fileCount: 1,
  lineCount: 1,
  ...overrides,
});

const edge = (from: string, to: string, count = 1): Edge => ({
  from,
  to,
  provenance: "imports",
  fileDependencies: count,
  examples: [{ from: `src/${from}.ts`, to: `src/${to}.ts` }],
  crossesPackage: false,
});

const declaredEdge = (from: string, to: string): Edge => ({
  from,
  to,
  provenance: "declared",
  protocol: "JSON lines over stdio",
  declaredIn: `src/${from}/boundary.ts`,
  line: 7,
  crossesPackage: true,
});

const model = (layers: Layer[], edges: Edge[] = []): ArchitectureModel => ({
  version: ARCHITECTURE_MODEL_VERSION,
  packages: [],
  layers,
  edges,
  rules: [],
});

describe("withinScope", () => {
  it("matches the scope itself and its descendants", () => {
    expect(withinScope("core", "core")).toBe(true);
    expect(withinScope("core.simulation", "core")).toBe(true);
    expect(withinScope("core.simulation.engine", "core")).toBe(true);
  });

  it("does not match a sibling that merely shares a prefix", () => {
    expect(withinScope("coreutils", "core")).toBe(false);
    expect(withinScope("react", "core")).toBe(false);
  });
});

describe("checkAncestorsDeclared", () => {
  it("reports an implied ancestor that nobody declared", () => {
    const diagnostics = checkAncestorsDeclared(
      model([layer({ id: "core" }), layer({ id: "core.a.b" })]),
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain("`core.a`");
    expect(diagnostics[0]?.severity).toBe("error");
  });

  it("stays quiet when the whole chain is declared", () => {
    const diagnostics = checkAncestorsDeclared(
      model([
        layer({ id: "core" }),
        layer({ id: "core.a" }),
        layer({ id: "core.a.b" }),
      ]),
    );

    expect(diagnostics).toEqual([]);
  });
});

describe("checkRuleTargets", () => {
  const layers = [layer({ id: "core" }), layer({ id: "ui" })];

  it("reports a rule naming a layer that does not exist", () => {
    const diagnostics = checkRuleTargets(model(layers), [
      { from: "reactt", to: "ui", reason: "typo in from" },
    ]);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain("`reactt`");
    expect(diagnostics[0]?.message).toContain("can never fire");
    expect(diagnostics[0]?.file).toBe("architecture.config.ts");
  });

  it("reports both sides when both are wrong", () => {
    const diagnostics = checkRuleTargets(model(layers), [
      { from: "nope", to: "also-nope", reason: "two typos" },
    ]);

    expect(diagnostics).toHaveLength(2);
  });

  it("stays quiet when both sides name declared layers", () => {
    const diagnostics = checkRuleTargets(model(layers), [
      { from: "core", to: "ui", reason: "core stays headless" },
    ]);

    expect(diagnostics).toEqual([]);
  });

  /**
   * A rule states its endpoints as layer ids, and `checkRules` widens each to
   * cover descendants. An ancestor prefix that is not itself declared would
   * therefore match nothing, which is the case this rejects.
   */
  it("rejects a prefix that is not itself a declared layer", () => {
    const diagnostics = checkRuleTargets(
      model([layer({ id: "core" }), layer({ id: "core.engine" })]),
      [{ from: "core.eng", to: "core", reason: "partial segment" }],
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain("`core.eng`");
  });
});

describe("checkRules", () => {
  const layers = [
    layer({ id: "core" }),
    layer({ id: "core.engine" }),
    layer({ id: "ui" }),
    layer({ id: "ui.views" }),
  ];

  it("fires when a descendant violates a rule stated at the parent", () => {
    const diagnostics = checkRules(
      model(layers, [edge("core.engine", "ui.views", 4)]),
      [{ from: "core", to: "ui", reason: "core stays headless" }],
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain("core stays headless");
    expect(diagnostics[0]?.message).toContain("4 imports");
    // Names a real file so the fix does not begin with a search.
    expect(diagnostics[0]?.file).toBe("src/core.engine.ts");
  });

  it("fires on a declared edge, naming the annotation to remove", () => {
    const diagnostics = checkRules(
      model(layers, [declaredEdge("core.engine", "ui.views")]),
      [{ from: "core", to: "ui", reason: "core stays headless" }],
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain("core stays headless");
    expect(diagnostics[0]?.message).toContain(
      "@talksTo via JSON lines over stdio",
    );
    // The annotation's own location, so the fix does not begin with a search.
    expect(diagnostics[0]?.file).toBe("src/core.engine/boundary.ts");
    expect(diagnostics[0]?.line).toBe(7);
  });

  it("stays quiet on a declared edge the rules permit", () => {
    expect(
      checkRules(model(layers, [declaredEdge("ui.views", "core.engine")]), [
        { from: "core", to: "ui", reason: "core stays headless" },
      ]),
    ).toEqual([]);
  });

  it("stays quiet on the permitted direction", () => {
    const diagnostics = checkRules(
      model(layers, [edge("ui.views", "core.engine")]),
      [{ from: "core", to: "ui", reason: "core stays headless" }],
    );

    expect(diagnostics).toEqual([]);
  });

  it("uses singular wording for a single import", () => {
    const diagnostics = checkRules(model(layers, [edge("core", "ui", 1)]), [
      { from: "core", to: "ui", reason: "because" },
    ]);

    expect(diagnostics[0]?.message).toContain("1 import does");
  });
});

describe("checkEmptyLayers", () => {
  it("warns about a leaf layer with no files", () => {
    const diagnostics = checkEmptyLayers(
      model([layer({ id: "core", files: [], fileCount: 0 })]),
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.severity).toBe("warning");
  });

  it("allows a grouping layer to hold no files of its own", () => {
    const diagnostics = checkEmptyLayers(
      model([
        layer({ id: "core", files: [], fileCount: 0 }),
        layer({ id: "core.engine" }),
      ]),
    );

    expect(diagnostics).toEqual([]);
  });
});
