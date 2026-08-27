import { describe, expect, it } from "vitest";

import { diffBundlePages, type DiffPage, type DiffSide } from "./bundle-diff";

import type { Layer } from "../model";

/**
 * The classification is the contract this feature stands on: a reviewer must
 * see the pages this change actually touched, and must NOT see every
 * neighbour lit up because counts drifted. The transitive-noise case pins the
 * second half explicitly.
 */

const layer = (id: string, files: string[]): Layer => ({
  id,
  name: id,
  parent: id.includes(".") ? id.slice(0, id.lastIndexOf(".")) : null,
  package: "@test/pkg",
  role: `role of ${id}`,
  declaredIn: `src/${id}/index.ts`,
  prose: null,
  references: [],
  files,
  fileCount: files.length,
  lineCount: files.length * 10,
});

const generatedPage = (options: {
  slug: string;
  title?: string;
  role?: string;
  order?: number;
  lines?: number;
  dependsOn?: { id: string; imports: number }[];
  dependedOnBy?: { id: string; imports: number }[];
}): DiffPage => {
  const title = options.title ?? "Core";
  const role = options.role ?? "Headless engine.";

  const relationsProp = (
    key: string,
    entries: { id: string; imports: number }[],
  ): string =>
    entries.length === 0
      ? `  ${key}={[]}`
      : [
          `  ${key}={[`,
          ...entries.map((entry) => `    ${JSON.stringify(entry)},`),
          "  ]}",
        ].join("\n");

  const contents = [
    "---",
    `title: ${JSON.stringify(title)}`,
    `description: ${JSON.stringify(role)}`,
    `sidebar_order: ${options.order ?? 1001}`,
    "---",
    "",
    'import { LayerRelations } from "../components/layer-relations";',
    "",
    role,
    "",
    "<LayerFacts",
    "  files={3}",
    `  lines={${options.lines ?? 120}}`,
    "/>",
    "",
    "<LayerRelations",
    relationsProp("dependsOn", options.dependsOn ?? []),
    relationsProp("dependedOnBy", options.dependedOnBy ?? []),
    "/>",
    "",
  ].join("\n");

  return {
    slug: options.slug,
    title,
    description: role,
    order: options.order ?? 1001,
    kind: "generated",
    contents,
  };
};

const authoredPage = (slug: string, body: string): DiffPage => ({
  slug,
  title: "Guide",
  description: "",
  order: 10,
  kind: "authored",
  contents: `---\ntitle: "Guide"\n---\n\n${body}\n`,
});

const side = (pages: DiffPage[], layers: Layer[] = []): DiffSide => ({
  pages,
  layers,
});

describe("diffBundlePages", () => {
  it("reports nothing when the sides are identical", () => {
    const pages = [generatedPage({ slug: "architecture/core" })];

    const result = diffBundlePages({
      base: side(pages),
      head: side(pages),
      baseRef: "main",
    });

    expect(result.statuses).toEqual({});
    expect(result.annotated.size).toBe(0);
    expect(result.tombstones).toEqual([]);
  });

  it("ignores transitive drift: counts, order, and incoming edges", () => {
    const base = generatedPage({
      slug: "architecture/core",
      order: 1001,
      lines: 120,
      dependsOn: [{ id: "core.hir", imports: 2 }],
      dependedOnBy: [],
    });
    const head = generatedPage({
      slug: "architecture/core",
      order: 1004,
      lines: 260,
      dependsOn: [{ id: "core.hir", imports: 9 }],
      dependedOnBy: [{ id: "ui.panels", imports: 7 }],
    });

    const result = diffBundlePages({
      base: side([base]),
      head: side([head]),
      baseRef: "main",
    });

    expect(result.statuses).toEqual({});
  });

  it("ignores dependencies reordering when only their counts moved", () => {
    const base = generatedPage({
      slug: "architecture/core",
      dependsOn: [
        { id: "core.hir", imports: 9 },
        { id: "core.types", imports: 2 },
      ],
    });
    const head = generatedPage({
      slug: "architecture/core",
      dependsOn: [
        { id: "core.types", imports: 8 },
        { id: "core.hir", imports: 3 },
      ],
    });

    const result = diffBundlePages({
      base: side([base]),
      head: side([head]),
      baseRef: "main",
    });

    expect(result.statuses).toEqual({});
  });

  it("flags a role change and marks the changed block", () => {
    const result = diffBundlePages({
      base: side([generatedPage({ slug: "architecture/core" })]),
      head: side([
        generatedPage({ slug: "architecture/core", role: "New role." }),
      ]),
      baseRef: "main",
    });

    expect(result.statuses).toEqual({ "architecture/core": "changed" });

    const annotated = result.annotated.get("architecture/core");
    expect(annotated).toContain(
      'import { DiffMarker } from "../../components/diff-marker";',
    );
    expect(annotated).toContain('<DiffMarker status="changed" />\n\nNew role.');
  });

  it("flags a new outgoing dependency", () => {
    const result = diffBundlePages({
      base: side([generatedPage({ slug: "architecture/core" })]),
      head: side([
        generatedPage({
          slug: "architecture/core",
          dependsOn: [{ id: "core.hir", imports: 1 }],
        }),
      ]),
      baseRef: "main",
    });

    expect(result.statuses).toEqual({ "architecture/core": "changed" });
  });

  it("classifies a page only the head has as added, without markers", () => {
    const result = diffBundlePages({
      base: side([]),
      head: side([generatedPage({ slug: "architecture/core" })]),
      baseRef: "main",
    });

    expect(result.statuses).toEqual({ "architecture/core": "added" });
    expect(result.annotated.size).toBe(0);
  });

  it("emits a tombstone carrying the removed page's source", () => {
    const result = diffBundlePages({
      base: side([
        generatedPage({ slug: "architecture/core/old", title: "Old" }),
      ]),
      head: side([]),
      baseRef: "main",
    });

    expect(result.statuses).toEqual({ "architecture/core/old": "removed" });

    const [tombstone] = result.tombstones;
    expect(tombstone?.title).toBe("Old");
    expect(tombstone?.contents).toContain('title: "Old"');
    expect(tombstone?.contents).toContain('<DiffMarker status="removed"');
    // The removed body travels as a string prop, inert to MDX.
    expect(tombstone?.contents).toContain("LayerFacts");
  });

  it("flags moved file membership even though the content is identical", () => {
    const contents = generatedPage({ slug: "architecture/core" });

    const result = diffBundlePages({
      base: side([contents], [layer("core", ["src/a.ts"])]),
      head: side([contents], [layer("core", ["src/a.ts", "src/b.ts"])]),
      baseRef: "main",
    });

    expect(result.statuses).toEqual({ "architecture/core": "changed" });
    expect(result.annotated.size).toBe(0);
  });

  it("diffs authored pages verbatim, marking removed blocks", () => {
    const result = diffBundlePages({
      base: side([
        authoredPage("guides/setup", "Intro.\n\nDropped paragraph."),
      ]),
      head: side([authoredPage("guides/setup", "Intro.")]),
      baseRef: "main",
    });

    expect(result.statuses).toEqual({ "guides/setup": "changed" });
    expect(result.annotated.get("guides/setup")).toContain(
      '<DiffMarker status="removed" content={"Dropped paragraph."} />',
    );
  });
});
