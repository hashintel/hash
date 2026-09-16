/**
 * @vitest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useStableItems } from "./use-stable-items";

type Item = { id: string; position: { x: number; y: number }; tags: string[] };

const item = (id: string, x = 0, tags: string[] = []): Item => ({
  id,
  position: { x, y: 0 },
  tags,
});

const renderStable = (items: Item[]) =>
  renderHook((next: Item[]) => useStableItems(next), {
    initialProps: items,
  });

describe("useStableItems", () => {
  it("keeps an item at its previous identity while its content is unchanged", () => {
    const first = [item("a", 1, ["x"]), item("b", 2)];
    const { result, rerender } = renderStable(first);

    rerender([item("a", 1, ["x"]), item("b", 2)]);

    expect(result.current[0]).toBe(first[0]);
    expect(result.current[1]).toBe(first[1]);
  });

  it("hands out a new identity only to the item whose content changed", () => {
    const first = [item("a", 1), item("b", 2)];
    const { result, rerender } = renderStable(first);

    const moved = item("b", 3);
    rerender([item("a", 1), moved]);

    expect(result.current[0]).toBe(first[0]);
    expect(result.current[1]).toBe(moved);
    expect(result.current[1]).not.toBe(first[1]);
  });

  it("does not revive an item that left the list and came back", () => {
    const first = [item("a", 1), item("b", 2)];
    const { result, rerender } = renderStable(first);

    rerender([item("a", 1)]);
    const returned = item("b", 2);
    rerender([item("a", 1), returned]);

    expect(result.current[1]).toBe(returned);
    expect(result.current[1]).not.toBe(first[1]);
  });
});
