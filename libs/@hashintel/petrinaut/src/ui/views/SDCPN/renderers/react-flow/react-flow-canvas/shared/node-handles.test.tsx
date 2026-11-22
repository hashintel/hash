/** @vitest-environment jsdom */
import { act, cleanup, render } from "@testing-library/react";
import {
  type ConnectionState,
  type Node,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useStoreApi,
} from "@xyflow/react";
import { useEffect } from "react";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";

import { paneStyle } from "../pane-style";
import { NodeHandles } from "./node-handles";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});
afterAll(() => {
  vi.unstubAllGlobals();
});
afterEach(cleanup);

const PlaceStub = () => (
  <NodeHandles kind="place" width={40} height={40} isConnectable />
);
const TransitionStub = () => (
  <NodeHandles kind="transition" width={40} height={40} isConnectable />
);
const nodeTypes = { place: PlaceStub, transition: TransitionStub };

const nodes: Node[] = [
  { id: "place", type: "place", position: { x: 0, y: 0 }, data: {} },
  { id: "transition", type: "transition", position: { x: 90, y: 0 }, data: {} },
];

type Store = ReturnType<typeof useStoreApi>;

/** Hands React Flow's store to the test. */
const HoldStore = ({ onStore }: { onStore: (store: Store) => void }) => {
  const store = useStoreApi();
  useEffect(() => onStore(store), [onStore, store]);
  return null;
};

const mount = () => {
  const held: { store: Store | null } = { store: null };
  const onStore = (store: Store) => {
    held.store = store;
  };
  const { container } = render(
    <ReactFlowProvider>
      <HoldStore onStore={onStore} />
      <ReactFlow nodes={nodes} edges={[]} nodeTypes={nodeTypes} />
    </ReactFlowProvider>,
  );
  const targetOf = (id: string) =>
    container.querySelector(
      `.react-flow__node[data-id="${id}"] .react-flow__handle.target`,
    );
  /** What React Flow's store holds while an arc is drawn onto a node. */
  const drawOnto = (id: string, isValid: boolean) =>
    act(() => {
      const state = held.store!.getState();
      held.store!.setState({
        connection: {
          inProgress: true,
          isValid,
          from: { x: 0, y: 0 },
          fromHandle: { nodeId: "place", type: "source", id: null },
          fromPosition: Position.Right,
          fromNode: state.nodeLookup.get("place"),
          to: { x: 90, y: 0 },
          toHandle: null,
          toPosition: Position.Left,
          toNode: state.nodeLookup.get(id),
        } as unknown as ConnectionState,
      });
    });
  return { targetOf, drawOnto };
};

it("marks the target handle of the node an arc can land on, and of no other", () => {
  const { targetOf, drawOnto } = mount();
  expect(targetOf("transition")?.hasAttribute("data-arc-target")).toBe(false);

  drawOnto("transition", true);

  expect(targetOf("transition")?.hasAttribute("data-arc-target")).toBe(true);
  expect(targetOf("place")?.hasAttribute("data-arc-target")).toBe(false);
});

it("leaves the handle unmarked while the arc cannot land there", () => {
  const { targetOf, drawOnto } = mount();

  drawOnto("transition", false);

  expect(targetOf("transition")?.hasAttribute("data-arc-target")).toBe(false);
});

it("is found by the rule of the pane that fades the outline of a target", () => {
  const rule = paneStyle
    .split(" ")
    .filter((name) => name.includes("[data-arc-target]::after"));

  expect(rule).toHaveLength(1);
  expect(rule[0]).toContain(
    ".react-flow__node:not(.canvas-focus-role):not(.selected)",
  );
  // The rule ends in the attribute alone: a class of every handle beside it
  // could restyle every handle when the focus changes.
  expect(rule[0]).toMatch(/_\[data-arc-target\]::after\]:/);
});
