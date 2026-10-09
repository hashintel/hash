/**
 * @vitest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { use, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  EditorContext,
  type EditorContextValue,
} from "../state/editor-context";
import { useRevealInEditor } from "./use-reveal-in-editor";

const renderReveal = () => {
  const navigateTo = vi.fn<EditorContextValue["navigateTo"]>();
  const selectItem = vi.fn<EditorContextValue["selectItem"]>();
  const Wrapper = ({ children }: { children: ReactNode }) => {
    const editor = use(EditorContext);
    return (
      <EditorContext value={{ ...editor, navigateTo, selectItem }}>
        {children}
      </EditorContext>
    );
  };
  const { result } = renderHook(() => useRevealInEditor(), {
    wrapper: Wrapper,
  });
  return { reveal: result.current, navigateTo, selectItem };
};

describe("useRevealInEditor", () => {
  it("selects an item", () => {
    const { reveal, navigateTo, selectItem } = renderReveal();
    const item = { type: "place", id: "place-1" } as const;

    reveal({ kind: "selection", item });

    expect(selectItem).toHaveBeenCalledWith(item);
    expect(navigateTo).not.toHaveBeenCalled();
  });

  it.each([
    ["scenarios", { type: "view-scenario", scenarioId: "item-1" }],
    ["metrics", { type: "view-metric", metricId: "item-1" }],
    ["experiments", { type: "view-experiment", experimentId: "item-1" }],
  ] as const)("opens one of Simulate's %s in its drawer", (mode, drawer) => {
    const { reveal, navigateTo } = renderReveal();

    reveal({ kind: "simulateView", mode, itemId: "item-1" });

    expect(navigateTo).toHaveBeenCalledWith({
      globalMode: "simulate",
      simulateViewMode: mode,
      simulateDrawer: drawer,
    });
  });

  it("opens the list alone without an id", () => {
    const { reveal, navigateTo } = renderReveal();

    reveal({ kind: "simulateView", mode: "metrics" });

    expect(navigateTo).toHaveBeenCalledWith({
      globalMode: "simulate",
      simulateViewMode: "metrics",
      simulateDrawer: { type: "closed" },
    });
  });
});
