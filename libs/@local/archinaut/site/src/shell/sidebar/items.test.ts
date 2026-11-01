import { describe, expect, it } from "vitest";

import { buildSidebarItems, contains, type SidebarItem } from "./items";

import type { ManifestPage } from "../../../../src/bundle/outputs";

const page = (
  slug: string,
  order: number,
  kind: ManifestPage["kind"] = "authored",
): ManifestPage => ({
  path: `pages/${slug}.mdx`,
  slug,
  title: slug.split("/").pop() ?? slug,
  description: "",
  kind,
  order,
  headings: [],
});

const pages: ManifestPage[] = [
  page("architecture/core/store", 1006, "generated"),
  page("index", 0),
  page("maintaining/running-locally", 2),
  page("maintaining", 2),
  page("maintaining/declaring-layers", 1),
  page("guides/deep/nested", 5),
  page("two-execution-paths", 1),
  page("architecture", 1000, "generated"),
  page("architecture/core", 1004, "generated"),
  page("architecture/cli", 1001, "generated"),
];

const labelsOf = (items: SidebarItem[]): string[] =>
  items.map((item) => item.label);

describe("buildSidebarItems", () => {
  const items = buildSidebarItems(pages, {});

  it("lists authored pages by order then slug, then the architecture tree", () => {
    expect(labelsOf(items)).toEqual([
      "index",
      "two-execution-paths",
      "maintaining",
      "Guides",
      "Architecture",
    ]);
    expect(items.at(-1)).toMatchObject({ kind: "group", collapsed: false });
  });

  it("makes a page with pages beneath it a collapsed group led by Overview", () => {
    const maintaining = items.find((item) => item.label === "maintaining");
    expect(maintaining).toMatchObject({ kind: "group", collapsed: true });
    expect(
      maintaining?.kind === "group" ? labelsOf(maintaining.items) : [],
    ).toEqual(["Overview", "declaring-layers", "running-locally"]);
  });

  it("names each directory without a page after its last segment, nested", () => {
    const guides = items.find((item) => item.label === "Guides");
    expect(guides).toMatchObject({ kind: "group", slug: null });
    const deep =
      guides?.kind === "group"
        ? guides.items.find((item) => item.label === "Deep")
        : undefined;
    expect(deep).toMatchObject({ kind: "group", slug: null });
    expect(deep?.kind === "group" ? labelsOf(deep.items) : []).toEqual([
      "nested",
    ]);
  });

  it("nests the architecture pages under the root page", () => {
    const architecture = items.at(-1);
    expect(
      architecture?.kind === "group" ? labelsOf(architecture.items) : [],
    ).toEqual(["Overview", "cli", "core"]);
    const core =
      architecture?.kind === "group"
        ? architecture.items.find((item) => item.label === "core")
        : undefined;
    expect(core?.kind === "group" ? labelsOf(core.items) : []).toEqual([
      "Overview",
      "store",
    ]);
  });

  it("badges links with their status and groups with a count", () => {
    const badged = buildSidebarItems(pages, {
      "architecture/core": "changed",
      "architecture/core/store": "added",
      "maintaining/running-locally": "removed",
    });
    const architecture = badged.at(-1);
    expect(architecture).toMatchObject({
      badge: { text: "2", status: "mixed" },
    });
    const core =
      architecture?.kind === "group"
        ? architecture.items.find((item) => item.label === "core")
        : undefined;
    expect(core).toMatchObject({ badge: { text: "2", status: "mixed" } });
    const store =
      core?.kind === "group"
        ? core.items.find((item) => item.label === "store")
        : undefined;
    expect(store).toMatchObject({ kind: "link", status: "added" });
    const maintaining = badged.find((item) => item.label === "maintaining");
    expect(maintaining).toMatchObject({
      badge: { text: "1", status: "removed" },
    });
  });

  it("leaves out the architecture group when there is no root page", () => {
    const authoredOnly = buildSidebarItems(
      pages.filter((entry) => entry.kind === "authored"),
      {},
    );
    expect(labelsOf(authoredOnly)).toEqual([
      "index",
      "two-execution-paths",
      "maintaining",
      "Guides",
    ]);
  });
});

describe("contains", () => {
  const items = buildSidebarItems(pages, {});

  it("finds a page at any depth of a group", () => {
    const architecture = items.at(-1);
    expect(architecture).toBeDefined();
    expect(contains(architecture!, "architecture/core/store")).toBe(true);
    expect(contains(architecture!, "maintaining")).toBe(false);
  });
});
