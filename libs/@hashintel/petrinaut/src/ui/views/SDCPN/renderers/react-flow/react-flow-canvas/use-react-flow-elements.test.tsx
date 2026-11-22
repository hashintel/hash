/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  render,
  renderHook as renderBareHook,
} from "@testing-library/react";
import {
  ConnectionMode,
  type Node,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useStoreApi,
} from "@xyflow/react";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { ArcLayer } from "./arc-layer";
import { ArcLayerContext, arcLayerEdgeId } from "./arc-layer-context";
import { arcBase, nodes, scene, withArcs } from "./scene.test-helpers";
import { useReactFlowElements } from "./use-react-flow-elements";

import type { CanvasScene } from "../../../canvas-scene";

afterEach(cleanup);

/** The hook reads React Flow's store, so it runs inside a provider. */
const renderHook: typeof renderBareHook = (callback, options) =>
  renderBareHook(callback, { wrapper: ReactFlowProvider, ...options });

const linkBase = {
  fusionId: "belt",
  name: "Belt",
  sourceId: "place",
  targetId: "component",
  sourcePortId: null,
  targetPortId: "port",
  selected: false,
  severity: null,
  focus: "none" as const,
};

describe("fusion links", () => {
  it("offers the ends the scene says can move", () => {
    const { result } = renderHook(() =>
      useReactFlowElements({
        ...scene,
        fusions: [
          { ...linkBase, id: "two", movableEnds: "both" },
          { ...linkBase, id: "three", movableEnds: "target" },
        ],
      }),
    );

    expect(
      result.current.edges
        .filter((edge) => edge.type === "fusion")
        .map(({ id, reconnectable, targetHandle }) => [
          id,
          reconnectable,
          targetHandle,
        ]),
    ).toEqual([
      ["two", true, "port-in-port"],
      ["three", "target", "port-in-port"],
    ]);
  });
});

describe("the edge that draws the arcs", () => {
  it("is one edge for all the arcs, before the fusion links", () => {
    const { result } = renderHook(() =>
      useReactFlowElements({
        ...scene,
        fusions: [{ ...linkBase, id: "link", movableEnds: "both" }],
      }),
    );

    expect(result.current.edges.map((edge) => edge.id)).toEqual([
      arcLayerEdgeId,
      "link",
    ]);
  });

  it("runs from a transition to itself, which React Flow can always place", () => {
    // The first arc ends at a component, which may have no pin to measure.
    const { result } = renderHook(() =>
      useReactFlowElements({
        ...scene,
        arcs: [...scene.arcs].reverse(),
      }),
    );
    const [layer] = result.current.edges;

    expect(layer?.source).toBe("transition");
    expect(layer?.target).toBe("transition");
    expect(layer?.sourceHandle).toBeUndefined();
    expect(layer?.targetHandle).toBeUndefined();
  });

  it("takes no focus and no selection, and says nothing to a screen reader", () => {
    const { result } = renderHook(() => useReactFlowElements(scene));

    expect(result.current.edges[0]).toMatchObject({
      type: "arcs",
      focusable: false,
      selectable: false,
      ariaRole: "none",
      ariaLabel: null,
      domAttributes: { "aria-roledescription": undefined },
    });
  });

  it("is absent from a net without arcs", () => {
    const { result } = renderHook(() =>
      useReactFlowElements({ ...scene, arcs: [] }),
    );
    expect(result.current.edges).toEqual([]);
  });

  it("stays the same object while the arcs change", () => {
    const { result, rerender } = renderHook(
      (input: CanvasScene) => useReactFlowElements(input),
      { initialProps: scene },
    );
    const [layer] = result.current.edges;

    rerender(withArcs({ input: { focus: "outgoing" } }));
    expect(result.current.edges[0]).toBe(layer);
  });
});

describe("selected arcs", () => {
  it("are edges React Flow holds and does not draw, so that it can deselect them", () => {
    const { result } = renderHook(() =>
      useReactFlowElements(
        withArcs({
          output: { selected: true },
          "port-input": { selected: true },
        }),
      ),
    );

    expect(result.current.edges.slice(1)).toEqual([
      {
        id: "output",
        source: "transition",
        target: "place",
        sourceHandle: undefined,
        targetHandle: undefined,
        hidden: true,
        selected: true,
      },
      {
        id: "port-input",
        source: "component",
        target: "transition",
        sourceHandle: "port-out-port",
        targetHandle: undefined,
        hidden: true,
        selected: true,
      },
    ]);
  });
});

describe("nodes", () => {
  it("preserves unaffected nodes when focus changes", () => {
    const { result, rerender } = renderHook(
      (input: CanvasScene) => useReactFlowElements(input),
      { initialProps: scene },
    );
    const previous = result.current;
    rerender({
      ...scene,
      focusActive: true,
      nodes: nodes.map((node) =>
        node.id === "place" ? { ...node, focus: "focused" } : { ...node },
      ),
    });

    for (const node of result.current.nodes) {
      const original = previous.nodes.find(
        (candidate) => candidate.id === node.id,
      );
      if (node.id === "place") {
        expect(node).not.toBe(original);
        expect(node.data.focus).toBe("focused");
      } else {
        expect(node).toBe(original);
      }
    }
  });

  it("hangs a component instance from its top edge, other nodes from their centre", () => {
    const { result } = renderHook(() => useReactFlowElements(scene));
    const byId = new Map(result.current.nodes.map((node) => [node.id, node]));

    // Centred at (600, 0) and 100 high in the scene.
    expect(byId.get("component")?.origin).toEqual([0.5, 0]);
    expect(byId.get("component")?.position).toEqual({ x: 600, y: -50 });

    expect(byId.get("place")?.origin).toBeUndefined();
    expect(byId.get("place")?.position).toEqual({ x: 0, y: 0 });
  });
});

describe("the focus", () => {
  const focusOn = (id: string): CanvasScene => ({
    ...scene,
    focusActive: true,
    nodes: nodes.map((node) =>
      node.id === id ? { ...node, focus: "focused" } : node,
    ),
  });

  it("is drawn once React Flow holds a node with a role, and ends with the scene", () => {
    const { result, rerender } = renderHook(
      (input: CanvasScene) => ({
        elements: useReactFlowElements(input),
        store: useStoreApi(),
      }),
      { initialProps: scene },
    );
    const takeNodesUp = () =>
      act(() =>
        result.current.store.getState().setNodes(result.current.elements.nodes),
      );
    takeNodesUp();
    expect(result.current.elements.focusDrawn).toBe(false);

    // The scene has a focus, and React Flow still holds the nodes without it.
    rerender(focusOn("place"));
    expect(result.current.elements.focusDrawn).toBe(false);
    takeNodesUp();
    expect(result.current.elements.focusDrawn).toBe(true);

    // The focus moves: the nodes React Flow holds have the roles of the last.
    rerender(focusOn("transition"));
    expect(result.current.elements.focusDrawn).toBe(true);

    // The focus ends, and React Flow still holds a node with a role.
    rerender(scene);
    expect(result.current.elements.focusDrawn).toBe(false);
  });
});

describe("inside React Flow", () => {
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

  // What a browser measures on a place or a transition: a handle of each
  // kind. A node without them is one React Flow has not measured yet.
  const handles: Node["handles"] = [
    { type: "source", position: Position.Right, x: 0, y: 0 },
    { type: "target", position: Position.Left, x: 0, y: 0 },
  ];

  const NodeStub = () => null;
  const nodeTypes = {
    place: NodeStub,
    transition: NodeStub,
    componentInstance: NodeStub,
  };
  const edgeTypes = { arcs: ArcLayer };

  const gestures = {
    selectLink: () => {},
    enterItem: () => {},
    clearHover: () => {},
    isAddMode: false,
  };
  const onEdgeClick = () => {};

  type CanvasProps = {
    scene: CanvasScene;
    /** The nodes React Flow has not measured yet. */
    unmeasured?: string[];
    onEdgeClick?: () => void;
  };

  const Canvas = ({ scene: input, unmeasured = [], ...rest }: CanvasProps) => {
    const elements = useReactFlowElements(input);
    return (
      <ArcLayerContext value={{ scene: input, gestures }}>
        <ReactFlow
          nodes={elements.nodes.map((node) =>
            unmeasured.includes(node.id) ? node : { ...node, handles },
          )}
          edges={elements.edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          connectionMode={ConnectionMode.Loose}
          {...rest}
        />
      </ArcLayerContext>
    );
  };

  const mount = (props: CanvasProps) => {
    const tree = (next: CanvasProps) => (
      <ReactFlowProvider>
        <Canvas {...next} />
      </ReactFlowProvider>
    );
    const { container, rerender } = render(tree(props));
    return {
      container,
      /** React Flow's wrapper around the arc layer. */
      layer: () => container.querySelector(".react-flow__edge-arcs"),
      arc: (id: string) =>
        container.querySelector(`.arc-item[data-id="${id}"]`),
      show: (next: CanvasProps) => rerender(tree(next)),
    };
  };

  // The arcs between the place and the transition: the component of the
  // scene has no pin here.
  const plainScene: CanvasScene = { ...scene, arcs: scene.arcs.slice(0, 2) };

  // A second transition, later in the document, with an arc each way.
  const twoTransitions: CanvasScene = {
    ...plainScene,
    nodes: [
      ...nodes,
      ...nodes
        .filter((node) => node.id === "transition")
        .map((node) => ({ ...node, id: "other" })),
    ],
    arcs: [
      ...plainScene.arcs,
      {
        ...arcBase,
        id: "other-input",
        sourceId: "place",
        targetId: "other",
        transitionId: "other",
      },
      {
        ...arcBase,
        id: "other-output",
        sourceId: "other",
        targetId: "place",
        transitionId: "other",
      },
    ],
  };
  const withoutFirstTransition: CanvasScene = {
    ...twoTransitions,
    nodes: twoTransitions.nodes.filter((node) => node.id !== "transition"),
    arcs: twoTransitions.arcs.filter(
      (arc) => arc.transitionId !== "transition",
    ),
  };

  it("draws the layer as one edge that says nothing and takes no focus", () => {
    const { container, layer } = mount({ scene: plainScene, onEdgeClick });
    const wrapper = layer();

    expect(container.querySelectorAll(".react-flow__edge-arcs")).toHaveLength(
      1,
    );
    expect(wrapper?.getAttribute("class")).toBe(
      "react-flow__edge react-flow__edge-arcs nopan",
    );
    expect(wrapper?.getAttribute("role")).toBe("none");
    expect(wrapper?.hasAttribute("aria-label")).toBe(false);
    expect(wrapper?.hasAttribute("aria-roledescription")).toBe(false);
    expect(wrapper?.hasAttribute("tabindex")).toBe(false);
    expect(wrapper?.querySelectorAll(".arc-item")).toHaveLength(2);
  });

  it("describes each arc by the element React Flow describes an edge with", () => {
    const { arc, container } = mount({ scene: plainScene, onEdgeClick });
    const describedBy = arc("input")?.getAttribute("aria-describedby") ?? "";

    expect(describedBy).not.toBe("");
    expect(container.ownerDocument.getElementById(describedBy)).not.toBeNull();
  });

  it("leaves the pointer to the arcs only while React Flow has a click handler for edges", () => {
    const { layer, show } = mount({ scene: plainScene, onEdgeClick });
    expect(layer()?.classList.contains("inactive")).toBe(false);

    show({ scene: plainScene });
    expect(layer()?.classList.contains("inactive")).toBe(true);
  });

  it("keeps every arc on the page while the first arc's transition is deleted and comes back unmeasured", () => {
    const { layer, arc, show } = mount({ scene: twoTransitions, onEdgeClick });
    const wrapper = layer();
    const kept = arc("other-input");
    expect(wrapper).not.toBeNull();
    expect(kept).not.toBeNull();

    show({ scene: withoutFirstTransition, onEdgeClick });
    expect(layer()).toBe(wrapper);
    expect(arc("other-input")).toBe(kept);
    expect(arc("input")).toBeNull();

    // An undo: the transition is a new node, which React Flow measures a
    // frame after it appears.
    show({ scene: twoTransitions, unmeasured: ["transition"], onEdgeClick });
    expect(layer()).toBe(wrapper);
    expect(arc("other-input")).toBe(kept);
    expect(arc("input")).not.toBeNull();
  });
});
