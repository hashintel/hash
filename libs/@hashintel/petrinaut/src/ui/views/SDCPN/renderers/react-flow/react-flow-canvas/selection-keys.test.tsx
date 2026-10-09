// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { ReactFlow, ReactFlowProvider, useStore } from "@xyflow/react";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  getSelectionKeyCode,
  useMultiSelectionModifier,
} from "./selection-keys";
import { useApplyNodeChanges } from "./use-apply-node-changes";

import type {
  CanvasInteractions,
  CanvasSelectionChange,
} from "../../../use-canvas-interactions";
import type { Node } from "@xyflow/react";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class PointerEventStub extends MouseEvent {
  readonly pointerId: number;
  readonly isPrimary: boolean;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.isPrimary = init.isPrimary ?? true;
  }
}

// `handles` and a fixed size stand in for the measurement a browser makes, so
// a selection box picks nodes by their bounds.
const nodes: Node[] = [
  {
    id: "a",
    position: { x: 0, y: 0 },
    width: 100,
    height: 50,
    handles: [],
    data: {},
    selected: true,
  },
  {
    id: "b",
    position: { x: 200, y: 0 },
    width: 100,
    height: 50,
    handles: [],
    data: {},
  },
];

const StateProbe = () => {
  const multiSelectionActive = useStore((state) => state.multiSelectionActive);
  const aSelected = useStore((state) => state.nodeLookup.get("a")?.selected);
  return (
    <>
      <output data-testid="multi-selection">
        {String(multiSelectionActive)}
      </output>
      <output data-testid="a-selected">{String(aSelected)}</output>
    </>
  );
};

const Canvas = ({
  mac,
  interactions,
}: {
  mac: boolean;
  interactions: CanvasInteractions;
}) => {
  useMultiSelectionModifier(mac);
  const applyChanges = useApplyNodeChanges(interactions);
  return (
    <ReactFlow
      nodes={nodes}
      edges={[]}
      onNodesChange={applyChanges}
      selectionKeyCode={getSelectionKeyCode(mac)}
      multiSelectionKeyCode={null}
    >
      <StateProbe />
    </ReactFlow>
  );
};

const renderCanvas = (mac: boolean) => {
  const applySelectionChanges =
    vi.fn<(changes: CanvasSelectionChange[]) => void>();
  const interactions = {
    applySelectionChanges,
    moveNodes: vi.fn(),
    dropNodes: vi.fn(),
  } as unknown as CanvasInteractions;
  const { container } = render(
    <ReactFlowProvider>
      <Canvas mac={mac} interactions={interactions} />
    </ReactFlowProvider>,
  );
  const selectionChanges = () => applySelectionChanges.mock.calls.flat(2);
  return { container, selectionChanges };
};

const isMultiSelectionActive = () =>
  screen.getByTestId("multi-selection").textContent === "true";

type Modifiers = { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean };

const keyDown = (key: string, modifiers: Modifiers) =>
  act(() => {
    fireEvent.keyDown(window, { key, ...modifiers });
  });

const keyUp = (key: string, modifiers: Modifiers) =>
  act(() => {
    fireEvent.keyUp(window, { key, ...modifiers });
  });

/** Draws a selection box around node b only. */
const drawBoxAroundB = (container: HTMLElement, modifiers: Modifiers) => {
  const pane = container.querySelector(".react-flow__pane");
  if (!pane) {
    throw new Error("the pane is not rendered");
  }
  const pointer = { button: 0, isPrimary: true, pointerId: 1, ...modifiers };
  act(() => {
    fireEvent.pointerDown(pane, { ...pointer, clientX: 190, clientY: -10 });
  });
  act(() => {
    fireEvent.pointerMove(pane, { ...pointer, clientX: 310, clientY: 60 });
  });
  act(() => {
    fireEvent.pointerUp(pane, { ...pointer, clientX: 310, clientY: 60 });
  });
};

describe("canvas selection keys", () => {
  beforeAll(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.stubGlobal("PointerEvent", PointerEventStub);
  });

  afterEach(() => {
    cleanup();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  describe.each([
    { platform: "macOS", mac: true, modifier: "Meta", flag: "metaKey" },
    {
      platform: "other platforms",
      mac: false,
      modifier: "Control",
      flag: "ctrlKey",
    },
  ] as const)("on $platform", ({ mac, modifier, flag }) => {
    const held = { [flag]: true };
    const heldWithShift = { [flag]: true, shiftKey: true };

    it("activates multi-selection for the modifier in either order with Shift", () => {
      renderCanvas(mac);
      keyDown(modifier, held);
      expect(isMultiSelectionActive(), "modifier alone").toBe(true);
      keyDown("Shift", heldWithShift);
      expect(isMultiSelectionActive(), "modifier, then Shift").toBe(true);
      keyUp("Shift", held);
      expect(isMultiSelectionActive(), "Shift released first").toBe(true);
      keyUp(modifier, {});
      expect(isMultiSelectionActive(), "modifier released").toBe(false);

      keyDown("Shift", { shiftKey: true });
      expect(isMultiSelectionActive(), "Shift alone").toBe(false);
      keyDown(modifier, heldWithShift);
      expect(isMultiSelectionActive(), "Shift, then modifier").toBe(true);
    });

    it("adds a clicked node to the selection when Shift is pressed before the modifier", () => {
      const { container, selectionChanges } = renderCanvas(mac);
      keyDown("Shift", { shiftKey: true });
      keyDown(modifier, heldWithShift);

      const node = container.querySelector('.react-flow__node[data-id="b"]');
      if (!node) {
        throw new Error("node b is not rendered");
      }
      fireEvent.click(node, heldWithShift);

      expect(
        selectionChanges(),
        "only node b changes, so node a stays selected",
      ).toEqual([{ id: "b", selected: true }]);
    });

    it.each([
      { order: "Shift first", first: "Shift", second: modifier },
      { order: "modifier first", first: modifier, second: "Shift" },
    ])(
      "adds a box's nodes to the selection with the modifier and Shift held, $order",
      ({ first, second }) => {
        const { container, selectionChanges } = renderCanvas(mac);
        keyDown(first, first === "Shift" ? { shiftKey: true } : held);
        keyDown(second, heldWithShift);

        drawBoxAroundB(container, heldWithShift);

        expect(
          selectionChanges(),
          "the box selects node b and leaves node a selected",
        ).toEqual([{ id: "b", selected: true }]);
        expect(
          screen.getByTestId("a-selected").textContent,
          "React Flow still renders node a as selected",
        ).toBe("true");
      },
    );

    it("replaces the selection with a box drawn with Shift alone", () => {
      const { container, selectionChanges } = renderCanvas(mac);
      keyDown("Shift", { shiftKey: true });
      keyDown(modifier, heldWithShift);
      drawBoxAroundB(container, heldWithShift);
      keyUp(modifier, { shiftKey: true });
      keyUp("Shift", {});
      keyDown("Shift", { shiftKey: true });

      drawBoxAroundB(container, { shiftKey: true });

      expect(
        selectionChanges(),
        "after an additive box, a box without the modifier deselects node a",
      ).toEqual(
        expect.arrayContaining([
          { id: "a", selected: false },
          { id: "b", selected: true },
        ]),
      );
    });
  });
});
