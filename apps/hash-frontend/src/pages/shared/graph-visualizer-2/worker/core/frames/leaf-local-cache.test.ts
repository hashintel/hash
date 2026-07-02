import { describe, expect, it } from "vitest";

import { EntityIndex, nodeIdForEntityIndex } from "../../../ids";
import { LeafLocalCache } from "./leaf-local-cache";

describe("LeafLocalCache", () => {
  it("maps entity indices to their local layout slots", () => {
    const cache = new LeafLocalCache();
    const layout = {
      nodeIds: [
        nodeIdForEntityIndex(EntityIndex(7)),
        nodeIdForEntityIndex(EntityIndex(3)),
      ],
    };

    const localOf = cache.of(layout);

    expect(localOf.get(EntityIndex(7))).toBe(0);
    expect(localOf.get(EntityIndex(3))).toBe(1);
    expect(localOf.size).toBe(2);
  });

  it("returns the cached map for the same layout object", () => {
    const cache = new LeafLocalCache();
    const layout = { nodeIds: [nodeIdForEntityIndex(EntityIndex(1))] };

    expect(cache.of(layout)).toBe(cache.of(layout));
  });

  it("rebuilds for a new layout object even with identical node ids", () => {
    const cache = new LeafLocalCache();
    const nodeIds = [nodeIdForEntityIndex(EntityIndex(1))];

    const first = cache.of({ nodeIds });
    const second = cache.of({ nodeIds });

    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });
});
