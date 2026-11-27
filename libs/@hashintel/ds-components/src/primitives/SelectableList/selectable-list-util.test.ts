import { describe, expect, it } from "vitest";

import {
  collectSelectedAncestorIds,
  getItemId,
  hasSelectedDescendant,
  normalizeItems,
  toPublicItemId,
  toRowItemId,
} from "./selectable-list-util";

import type {
  CollapsibleItem,
  Item,
  ItemOrGroup,
} from "./selectable-list-util";

const flatIds = (items: Array<ItemOrGroup<Item>>): string[] =>
  items.flatMap((entry) =>
    "items" in entry ? entry.items.map(getItemId) : [getItemId(entry)],
  );

describe("normalizeItems", () => {
  it("gives every occurrence a unique row id that strips back to the consumer id", () => {
    const normalized = normalizeItems([
      { id: "a", text: "A", onClick: () => {} },
      { id: "b", text: "B", onClick: () => {} },
      { id: "a", text: "A again", onClick: () => {} },
    ]);
    const ids = flatIds(normalized);
    expect(ids.map(toPublicItemId)).toEqual(["a", "b", "a"]);
    expect(new Set(ids).size).toBe(3);
    // Controlled values target the first occurrence's row id
    expect(ids[0]).toBe(toRowItemId("a"));
    expect(ids[1]).toBe(toRowItemId("b"));
    // Later occurrences are addressable by index, in normalization order
    expect(ids[2]).toBe(toRowItemId("a", 1));
  });

  it("uniquifies across groups and collapsible subItems", () => {
    const normalized = normalizeItems([
      {
        id: "group",
        label: "Group",
        items: [{ id: "a", text: "A", onClick: () => {} }],
      },
      {
        id: "folder",
        text: "Folder",
        collapsible: true,
        subItems: [{ id: "a", text: "A nested", onClick: () => {} }],
      },
    ]);
    const folder = normalized[1] as CollapsibleItem;
    const nestedId = getItemId(folder.subItems[0] as Item);
    expect(nestedId).not.toBe("a");
    expect(toPublicItemId(nestedId)).toBe("a");
  });

  it("is idempotent", () => {
    const once = normalizeItems([
      { id: "a", text: "A", onClick: () => {} },
      { id: "a", text: "A again", onClick: () => {} },
    ]);
    expect(flatIds(normalizeItems(once))).toEqual(flatIds(once));
  });

  it("leaves submenu subItems to their own menu's normalization", () => {
    const normalized = normalizeItems([
      { id: "a", text: "A", onClick: () => {} },
      {
        id: "submenu",
        text: "Submenu",
        subItems: [{ id: "a", text: "A nested", onClick: () => {} }],
      },
    ]);
    const submenu = normalized[1] as Item & { subItems: Item[] };
    expect(getItemId(submenu.subItems[0]!)).toBe("a");
  });
});

describe("selection matching with duplicated ids", () => {
  const items: Array<ItemOrGroup<Item>> = normalizeItems([
    {
      id: "first",
      text: "First folder",
      collapsible: true,
      subItems: [{ id: "a", text: "A", onClick: () => {} }],
    },
    {
      id: "second",
      text: "Second folder",
      collapsible: true,
      subItems: [{ id: "a", text: "A again", onClick: () => {} }],
    },
  ]);

  it("collects every occurrence's ancestors for a selected value", () => {
    expect(collectSelectedAncestorIds(items, new Set(["a"]))).toEqual(
      new Set([toRowItemId("first"), toRowItemId("second")]),
    );
  });

  it("reports a selected descendant behind a suffixed row id", () => {
    const second = items[1] as CollapsibleItem;
    expect(hasSelectedDescendant(second, new Set(["a"]))).toBe(true);
  });
});
