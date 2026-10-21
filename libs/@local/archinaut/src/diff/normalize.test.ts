import { describe, expect, it } from "vitest";

import { normalizeGeneratedBlock } from "./normalize";

/**
 * Every mask exists to keep a *transitive* change from flagging a page, so
 * each case pins one source of drift: counts that move when neighbouring code
 * moves, orders that shift with those counts, and the incoming-edge list that
 * changes when some other layer adds an import. The masks are scoped to the
 * block shapes that carry the derived facts, so the prose cases pin that an
 * embedded README is never rewritten.
 */
describe("normalizeGeneratedBlock", () => {
  it("masks the sidebar order in frontmatter", () => {
    expect(
      normalizeGeneratedBlock('---\ntitle: "Core"\nsidebar_order: 1042\n---\n'),
    ).toBe('---\ntitle: "Core"\nsidebar_order: 0\n---\n');
  });

  it("masks file and line counts in the facts card", () => {
    expect(
      normalizeGeneratedBlock("<LayerFacts\n  files={13}\n  lines={2200}\n/>"),
    ).toBe("<LayerFacts\n  files={0}\n  lines={0}\n/>");
  });

  it("masks import counts in relation entries", () => {
    const block = [
      "<LayerRelations",
      "  dependsOn={[",
      '    {"id":"core.hir","imports":41},',
      "  ]}",
      "  dependedOnBy={[]}",
      "/>",
    ].join("\n");

    expect(normalizeGeneratedBlock(block)).toContain('"imports":0');
    expect(normalizeGeneratedBlock(block)).toContain('"id":"core.hir"');
  });

  it("sorts depends-on entries, so count-driven reordering masks out", () => {
    const entries = (rows: string[]): string =>
      [
        "<LayerRelations",
        "  dependsOn={[",
        ...rows.map((row) => `    ${row}`),
        "  ]}",
        "  dependedOnBy={[]}",
        "/>",
      ].join("\n");

    const base = entries([
      '{"id":"a","imports":9},',
      '{"id":"b","imports":2},',
    ]);
    const head = entries([
      '{"id":"b","imports":8},',
      '{"id":"a","imports":3},',
    ]);

    expect(normalizeGeneratedBlock(base)).toBe(normalizeGeneratedBlock(head));
  });

  it("collapses the depended-on-by list to the empty form", () => {
    const block = [
      "<LayerRelations",
      "  dependsOn={[",
      '    {"id":"core.hir","imports":2},',
      "  ]}",
      "  dependedOnBy={[",
      '    {"id":"ui.panels","imports":7},',
      '    {"id":"ui.canvas","imports":3},',
      "  ]}",
      "/>",
    ].join("\n");

    expect(normalizeGeneratedBlock(block)).toBe(
      [
        "<LayerRelations",
        "  dependsOn={[",
        '    {"id":"core.hir","imports":0},',
        "  ]}",
        "  dependedOnBy={[]}",
        "/>",
      ].join("\n"),
    );
  });

  it("masks the file-count column of the overview table", () => {
    const table = [
      "| Layer | Responsibility | Files |",
      "| --- | --- | --- |",
      "| [Core](core) | Headless engine | 214 |",
    ].join("\n");

    expect(normalizeGeneratedBlock(table)).toContain(
      "| [Core](core) | Headless engine | 0 |",
    );
  });

  it("leaves prose alone, even when it resembles a masked shape", () => {
    for (const prose of [
      "The buffer holds 64 bytes per token.",
      "Set `files={12}` on the card to override the count.",
      "| [A guide](link) | prose table | 7 |",
    ]) {
      expect(normalizeGeneratedBlock(prose)).toBe(prose);
    }
  });
});
