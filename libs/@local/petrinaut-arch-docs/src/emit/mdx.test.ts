import { describe, expect, it } from "vitest";

import {
  buildPages,
  resolveAuthoredLinks,
  resolveDiagramImages,
  layerSlug,
} from "./mdx";

import type { ArchitectureModel, Layer } from "../model";

/**
 * An authored page's final slug depends on its `attachTo`, so it cannot write a
 * correct relative link by hand. These tests pin the resolution that replaces
 * hand-written paths, including the failure case — an unresolved target must be
 * reported, never emitted as-is and left to 404.
 */

const layerSlugs = new Map([
  ["core", layerSlug("core")],
  ["core.simulation", layerSlug("core.simulation")],
  ["core.simulation.engine", layerSlug("core.simulation.engine")],
]);

const docSlugs = new Map([
  ["index", "index"],
  ["two-execution-paths", "two-execution-paths"],
  ["simulation/memory-model", "architecture/core/simulation/memory-model"],
]);

const resolve = (contents: string, fromSlug: string) =>
  resolveAuthoredLinks(contents, fromSlug, { layerSlugs, docSlugs });

describe("resolveAuthoredLinks", () => {
  it("resolves a layer link from a top-level page", () => {
    const { contents, unresolved } = resolve(
      "See [the engine](layer:core.simulation.engine).",
      "two-execution-paths",
    );

    expect(unresolved).toEqual([]);
    expect(contents).toBe(
      "See [the engine](architecture/core/simulation/engine).",
    );
  });

  it("resolves a layer link from a page attached deep in the tree", () => {
    const { contents } = resolve(
      "See [the engine](layer:core.simulation.engine).",
      "architecture/core/simulation/worker/protocol",
    );

    // Same target, different depth — the path has to differ.
    expect(contents).toBe("See [the engine](../engine).");
  });

  it("resolves a doc link between attached pages", () => {
    const { contents, unresolved } = resolve(
      "See [memory](doc:simulation/memory-model).",
      "architecture/core/simulation/worker/protocol",
    );

    expect(unresolved).toEqual([]);
    expect(contents).toBe("See [memory](../memory-model).");
  });

  it("resolves a doc link that climbs out of the architecture tree", () => {
    const { contents } = resolve(
      "See [paths](doc:two-execution-paths).",
      "architecture/core/simulation/memory-model",
    );

    expect(contents).toBe("See [paths](../../../two-execution-paths).");
  });

  it("preserves a fragment", () => {
    const { contents } = resolve(
      "See [engine](layer:core.simulation.engine#invariants).",
      "two-execution-paths",
    );

    expect(contents).toBe(
      "See [engine](architecture/core/simulation/engine#invariants).",
    );
  });

  it("reports an unknown layer instead of emitting a broken link", () => {
    const { contents, unresolved } = resolve(
      "See [nope](layer:core.nonexistent).",
      "index",
    );

    expect(unresolved).toEqual(["layer:core.nonexistent"]);
    // Left untouched so the diagnostic is the only signal, not a silent rewrite.
    expect(contents).toBe("See [nope](layer:core.nonexistent).");
  });

  it("reports an unknown doc", () => {
    const { unresolved } = resolve("[gone](doc:missing-page).", "index");

    expect(unresolved).toEqual(["doc:missing-page"]);
  });

  it("leaves an example inside a code span or fence as written", () => {
    const source = [
      "Write `[text](layer:core.simulation.engine)` for a layer.",
      "",
      "```mdx",
      "[text](doc:two-execution-paths)",
      "```",
      "",
      "A real link: [engine](layer:core.simulation.engine).",
    ].join("\n");
    const { contents, unresolved } = resolve(source, "index");

    expect(unresolved).toEqual([]);
    // The documentation of the scheme has to keep showing the scheme.
    expect(contents).toContain("`[text](layer:core.simulation.engine)`");
    expect(contents).toContain("[text](doc:two-execution-paths)");
    expect(contents).toContain("[engine](architecture/core/simulation/engine)");
  });

  it("leaves ordinary links alone", () => {
    const source =
      "[external](https://example.com) [relative](../sibling) [anchor](#section)";
    const { contents, unresolved } = resolve(source, "index");

    expect(contents).toBe(source);
    expect(unresolved).toEqual([]);
  });

  it("does not rewrite a scheme-like string outside a link target", () => {
    const source = "Run `yarn doc:architecture` to regenerate.";
    const { contents, unresolved } = resolve(source, "index");

    expect(contents).toBe(source);
    expect(unresolved).toEqual([]);
  });

  it("resolves every link in a page, not just the first", () => {
    const { contents, unresolved } = resolve(
      "[a](layer:core) then [b](layer:core.simulation)",
      "index",
    );

    expect(unresolved).toEqual([]);
    expect(contents).toBe(
      "[a](architecture/core) then [b](architecture/core/simulation)",
    );
  });
});

describe("resolveDiagramImages", () => {
  const available = new Set(["cli-request-flow"]);

  it("rewrites a known diagram to a page-relative asset path", () => {
    const { contents, unresolved } = resolveDiagramImages(
      "![Flow](@diagrams/cli-request-flow.svg)",
      "architecture/cli/usage-manual",
      available,
    );

    expect(unresolved).toEqual([]);
    // Asset paths resolve against the page *file* under `pages/`, so the
    // rewrite climbs out of `pages/` into the bundle's `diagrams/`.
    expect(contents).toBe("![Flow](../../../diagrams/cli-request-flow.svg)");
  });

  it("drops the image when no renderer will write the SVG", () => {
    const { contents, unresolved } = resolveDiagramImages(
      "Before\n\n![Flow](@diagrams/cli-request-flow.svg)\n\nAfter\n",
      "architecture/cli/usage-manual",
      available,
      false,
    );

    expect(unresolved).toEqual([]);
    expect(contents).toBe("Before\n\n\nAfter\n");
  });

  it("reports an unknown diagram instead of emitting it", () => {
    const { contents, unresolved } = resolveDiagramImages(
      "![Flow](@diagrams/missing.svg)",
      "two-execution-paths",
      available,
    );

    expect(unresolved).toEqual(["@diagrams/missing.svg"]);
    expect(contents).toBe("![Flow](@diagrams/missing.svg)");
  });
});

const testLayer = (id: string): Layer => ({
  id,
  name: id,
  parent: null,
  package: "@test/pkg",
  role: `role of ${id}`,
  declaredIn: `src/${id}/index.ts`,
  prose: null,
  references: [],
  files: [`src/${id}/index.ts`],
  fileCount: 1,
  lineCount: 1,
});

const buildTestPages = (model: ArchitectureModel) =>
  buildPages(model, {
    sourceUrlPrefix: "https://example.com/",
    overviewDiagram: null,
    neighbourhoodDiagrams: new Map(),
    subtreeDiagrams: new Map(),
  });

describe("buildPages layer facts card", () => {
  const model: ArchitectureModel = {
    version: 1,
    packages: [],
    layers: [testLayer("core"), testLayer("core.simulation")],
    edges: [],
    rules: [],
  };

  const pages = buildTestPages(model);
  const nested = pages.find(
    (page) => page.slug === layerSlug("core.simulation"),
  );
  const root = pages.find((page) => page.slug === layerSlug("core"));

  it("imports the component relative to the page file's depth", () => {
    expect(nested?.contents).toContain(
      'import { LayerFacts } from "../../../components/layer-facts";',
    );
    expect(root?.contents).toContain(
      'import { LayerFacts } from "../../components/layer-facts";',
    );
  });

  it("passes the layer's facts as structured props", () => {
    expect(nested?.contents).toContain('package={"@test/pkg"}');
    expect(nested?.contents).toContain('layerId={"core.simulation"}');
    expect(nested?.contents).toContain("files={1}");
    expect(nested?.contents).toContain("lines={1}");
    expect(nested?.contents).toContain(
      'declaredIn={"src/core.simulation/index.ts"}',
    );
    expect(nested?.contents).toContain(
      'declaredInUrl={"https://example.com/src/core.simulation/index.ts"}',
    );
    // The role reads as a plain lead paragraph before the card, not a prop.
    expect(nested?.contents).not.toContain("role={");
    expect(nested?.contents).toContain("\nrole of core.simulation\n");
  });

  it("emits no relations card or import on a page with no edges", () => {
    expect(nested?.contents).not.toContain("LayerRelations");
  });

  it("emits no prose header alongside the card", () => {
    expect(nested?.contents).not.toContain("**Package**");
    expect(nested?.contents).not.toContain("Declared in [");
  });
});

describe("buildPages layer relations card", () => {
  const model: ArchitectureModel = {
    version: 1,
    packages: [],
    layers: [testLayer("bindings"), testLayer("cli"), testLayer("store")],
    edges: [
      {
        from: "bindings",
        to: "store",
        provenance: "imports",
        fileDependencies: 2,
        examples: [],
        crossesPackage: false,
      },
      {
        from: "bindings",
        to: "cli",
        provenance: "declared",
        protocol: "JSON lines over stdio",
        crossesPackage: true,
      },
    ],
    rules: [],
  };

  const pages = buildTestPages(model);
  const bindings = pages.find((page) => page.slug === layerSlug("bindings"));
  const cli = pages.find((page) => page.slug === layerSlug("cli"));
  const store = pages.find((page) => page.slug === layerSlug("store"));

  it("passes each direction as one JSON entry per edge", () => {
    expect(bindings?.contents).toContain(
      'import { LayerRelations } from "../../components/layer-relations";',
    );
    expect(bindings?.contents).toContain(
      '{"id":"store","name":"store","href":"store","provenance":"imports","crossesPackage":false,"imports":2},',
    );
    expect(bindings?.contents).toContain("dependedOnBy={[]}");
  });

  it("marks a declared edge with its protocol and no import count", () => {
    expect(bindings?.contents).toContain(
      '{"id":"cli","name":"cli","href":"cli","provenance":"declared","crossesPackage":true,"protocol":"JSON lines over stdio"},',
    );

    // The receiving side sees the same edge under dependedOnBy.
    expect(cli?.contents).toContain('"id":"bindings"');
    expect(cli?.contents).toContain('"provenance":"declared"');
    expect(cli?.contents).toContain("dependsOn={[]}");
  });

  it("replaces the heading-plus-table sections entirely", () => {
    expect(bindings?.contents).not.toContain("## Depends on");
    expect(store?.contents).not.toContain("## Depended on by");
    expect(bindings?.contents).not.toContain("| Layer |");
  });

  it("orders imports by count before declared edges", () => {
    const contents = bindings?.contents ?? "";
    expect(contents.indexOf('"id":"store"')).toBeLessThan(
      contents.indexOf('"id":"cli"'),
    );
  });
});
