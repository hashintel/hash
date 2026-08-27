import { describe, expect, it } from "vitest";

import { normalizeGeneratedBlock } from "./normalize";

/**
 * Every mask exists to keep a *transitive* change from flagging a page, so
 * each case pins one source of drift: counts that move when neighbouring code
 * moves, orders that shift when a layer is inserted, and the incoming-edge
 * list that changes when some other layer adds an import.
 */
describe("normalizeGeneratedBlock", () => {
  it("masks the sidebar order", () => {
    expect(
      normalizeGeneratedBlock('---\ntitle: "Core"\nsidebar_order: 1042\n---\n'),
    ).toBe('---\ntitle: "Core"\nsidebar_order: 0\n---\n');
  });

  it("masks file and line counts in facts props", () => {
    expect(normalizeGeneratedBlock("  files={13}\n  lines={2200}")).toBe(
      "  files={0}\n  lines={0}",
    );
  });

  it("masks import counts in relation entries", () => {
    const entry = '    {"id":"core.hir","imports":41,"crossesPackage":false},';
    expect(normalizeGeneratedBlock(entry)).toBe(
      '    {"id":"core.hir","imports":0,"crossesPackage":false},',
    );
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

  it("keeps the depends-on entries themselves", () => {
    const block = [
      "  dependsOn={[",
      '    {"id":"core.hir","imports":2},',
      "  ]}",
    ].join("\n");

    expect(normalizeGeneratedBlock(block)).toContain('"id":"core.hir"');
  });

  it("masks the file-count column of the overview table", () => {
    expect(
      normalizeGeneratedBlock("| [Core](core) | Headless engine | 214 |"),
    ).toBe("| [Core](core) | Headless engine | 0 |");
  });

  it("leaves ordinary prose and numbers alone", () => {
    const prose = "The buffer holds 64 bytes per token.";
    expect(normalizeGeneratedBlock(prose)).toBe(prose);
  });
});
