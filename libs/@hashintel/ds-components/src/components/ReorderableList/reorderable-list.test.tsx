import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReorderableList } from "./reorderable-list";
import { computeReorderedIds } from "./reorderable-list-util";

describe("computeReorderedIds", () => {
  it("reorders like a plain move when nothing is disabled", () => {
    expect(computeReorderedIds(["a", "b", "c"], new Set(), 0, 2)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("keeps a disabled row at its index when a drag crosses it downwards", () => {
    // Pre-fix, the plain arrayMove result was ["d", "b", "a"]: the disabled
    // row slid from index 1 to index 0.
    expect(computeReorderedIds(["a", "d", "b"], new Set(["d"]), 0, 2)).toEqual([
      "b",
      "d",
      "a",
    ]);
  });

  it("keeps a disabled row at its index when a drag crosses it upwards", () => {
    expect(computeReorderedIds(["a", "d", "b"], new Set(["d"]), 2, 0)).toEqual([
      "b",
      "d",
      "a",
    ]);
  });

  it("keeps multiple disabled rows pinned at once", () => {
    expect(
      computeReorderedIds(
        ["a", "d1", "b", "d2", "c"],
        new Set(["d1", "d2"]),
        0,
        4,
      ),
    ).toEqual(["b", "d1", "c", "d2", "a"]);
  });

  it("leaves rows outside the moved range untouched", () => {
    expect(
      computeReorderedIds(["a", "b", "d", "c"], new Set(["d"]), 0, 1),
    ).toEqual(["b", "a", "d", "c"]);
  });
});

describe("ReorderableList", () => {
  it("keeps explicit list semantics when list styling is removed", () => {
    // Safari VoiceOver drops the implicit list role once list-style is none;
    // the ul must carry role="list" explicitly.
    const markup = renderToStaticMarkup(
      <ReorderableList aria-label="Flow steps" onChange={() => {}}>
        <ReorderableList.Item id="fetch" label="Fetch sources">
          Fetch sources
        </ReorderableList.Item>
        <ReorderableList.Item id="validate" label="Validate">
          Validate
        </ReorderableList.Item>
      </ReorderableList>,
    );
    expect(markup).toContain('role="list"');
    expect(markup).toContain('aria-label="Reorder Fetch sources"');
  });
});
