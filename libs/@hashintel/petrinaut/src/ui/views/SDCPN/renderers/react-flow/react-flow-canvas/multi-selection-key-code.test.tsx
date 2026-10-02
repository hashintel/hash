// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { ReactFlow, ReactFlowProvider, useStore } from "@xyflow/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { getMultiSelectionKeyCode } from "./multi-selection-key-code";

import type { Node, NodeChange } from "@xyflow/react";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const MultiSelectionProbe = () => {
  const active = useStore((state) => state.multiSelectionActive);
  return <output data-testid="multi-selection">{String(active)}</output>;
};

const nodes: Node[] = [
  { id: "a", position: { x: 0, y: 0 }, data: {}, selected: true },
  { id: "b", position: { x: 200, y: 0 }, data: {} },
];

const renderFlow = (
  mac: boolean,
  onNodesChange?: (changes: NodeChange[]) => void,
) =>
  render(
    <ReactFlowProvider>
      <ReactFlow
        nodes={nodes}
        edges={[]}
        onNodesChange={onNodesChange}
        multiSelectionKeyCode={getMultiSelectionKeyCode(mac)}
      >
        <MultiSelectionProbe />
      </ReactFlow>
    </ReactFlowProvider>,
  );

const isMultiSelectionActive = () =>
  screen.getByTestId("multi-selection").textContent === "true";

const press = (...keys: string[]) => {
  for (const key of keys) {
    act(() => {
      fireEvent.keyDown(window, { key });
    });
  }
};

describe("getMultiSelectionKeyCode", () => {
  beforeAll(() => {
    globalThis.ResizeObserver =
      ResizeObserverStub as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    cleanup();
  });

  describe.each([
    { platform: "macOS", mac: true, modifier: "Meta" },
    { platform: "other platforms", mac: false, modifier: "Control" },
  ])("on $platform", ({ mac, modifier }) => {
    it.each([
      { held: [modifier] },
      { held: [modifier, "Shift"] },
      { held: ["Shift", modifier] },
    ])("activates multi-selection while $held are held", ({ held }) => {
      renderFlow(mac);
      press(...held);
      expect(
        isMultiSelectionActive(),
        `multi-selection is active after pressing ${held.join(", ")}`,
      ).toBe(true);
    });

    it("adds a clicked node to the selection when Shift is pressed before the modifier", () => {
      const onNodesChange = vi.fn<(changes: NodeChange[]) => void>();
      const { container } = renderFlow(mac, onNodesChange);
      press("Shift", modifier);

      const node = container.querySelector('.react-flow__node[data-id="b"]');
      if (!node) {
        throw new Error("node b is not rendered");
      }
      fireEvent.click(node);

      expect(
        onNodesChange.mock.calls.flat(2),
        "only node b changes, so node a stays selected",
      ).toEqual([{ id: "b", type: "select", selected: true }]);
    });

    it("leaves multi-selection off while only Shift is held", () => {
      renderFlow(mac);
      press("Shift");
      expect(
        isMultiSelectionActive(),
        "Shift alone is the box-selection key",
      ).toBe(false);
    });
  });
});
