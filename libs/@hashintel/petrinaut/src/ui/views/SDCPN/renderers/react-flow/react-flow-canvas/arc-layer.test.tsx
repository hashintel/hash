/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import {
  type InternalNode,
  Position,
  ReactFlowProvider,
  useStoreApi,
} from "@xyflow/react";
import { Profiler } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ArcLayer } from "./arc-layer";
import { ArcLayerContext, type ArcLayerGestures } from "./arc-layer-context";
import { ArcPulsesContext, type ArcPulseView } from "./arc-pulses";
import { scene, withArcs, withNodeAt } from "./scene.test-helpers";

import type { CanvasScene } from "../../../canvas-scene";

afterEach(cleanup);

type FlowStore = ReturnType<typeof useStoreApi>;

/** Hands React Flow's store to the test before the layer reads it. */
const StoreProbe = ({ onStore }: { onStore: (store: FlowStore) => void }) => {
  onStore(useStoreApi());
  return null;
};

/** The component instance as React Flow holds it once it has measured its pins. */
const measuredInstance = {
  internals: {
    positionAbsolute: { x: 550, y: -50 },
    handleBounds: {
      source: [
        {
          id: "port-out-port",
          x: 96,
          y: 60,
          width: 8,
          height: 8,
          position: Position.Right,
        },
        {
          id: "port-in-port",
          x: -4,
          y: 60,
          width: 8,
          height: 8,
          position: Position.Left,
        },
      ],
      target: [],
    },
  },
} as unknown as InternalNode;

const mount = (
  initial: CanvasScene = scene,
  { isAddMode = false, measured = true } = {},
) => {
  const gestures = {
    selectLink: vi.fn<ArcLayerGestures["selectLink"]>(),
    enterItem: vi.fn<ArcLayerGestures["enterItem"]>(),
    clearHover: vi.fn<ArcLayerGestures["clearHover"]>(),
    isAddMode,
  };
  const pulses = {
    fire: vi.fn(),
    show: vi.fn<(view: ArcPulseView | null) => void>(),
  };
  const renders = vi.fn();
  const flow: { store?: FlowStore } = {};
  const keep = (store: FlowStore) => {
    flow.store = store;
    if (measured) {
      store.getState().nodeLookup.set("component", measuredInstance);
    }
  };
  const tree = (input: CanvasScene) => (
    <ReactFlowProvider>
      <StoreProbe onStore={keep} />
      <ArcPulsesContext value={pulses}>
        <ArcLayerContext value={{ scene: input, gestures }}>
          <svg>
            <Profiler id="layer" onRender={renders}>
              <ArcLayer />
            </Profiler>
          </svg>
        </ArcLayerContext>
      </ArcPulsesContext>
    </ReactFlowProvider>
  );
  const { container, rerender } = render(tree(initial));
  const store = flow.store;
  if (!store) {
    throw new Error("the layer is rendered inside a React Flow provider");
  }
  const item = (id: string) => {
    const element = container.querySelector<SVGGElement>(`[data-id="${id}"]`);
    if (!element) {
      throw new Error(`no arc ${id}`);
    }
    return element;
  };
  return {
    container,
    gestures,
    pulses,
    renders,
    store,
    item,
    /** The path of an arc that takes the pointer. */
    band: (id: string) => {
      const path = item(id).querySelector(".react-flow__edge-interaction");
      if (!path) {
        throw new Error(`no band on ${id}`);
      }
      return path;
    },
    show: (input: CanvasScene) => rerender(tree(input)),
  };
};

describe("the arcs on the page", () => {
  it("are one element each, in the order of the scene, named as React Flow names an edge", () => {
    const { container } = mount();
    const items = [...container.querySelectorAll(".arc-items > *")];

    expect(items.map((item) => item.getAttribute("data-id"))).toEqual([
      "input",
      "output",
      "port-input",
      "port-output",
    ]);
    for (const item of items) {
      expect(item.getAttribute("role")).toBe("group");
      expect(item.getAttribute("tabindex")).toBe("0");
      expect(item.getAttribute("aria-roledescription")).toBe("edge");
      expect(item.getAttribute("aria-describedby")).toMatch(
        /^react-flow__edge-desc-/,
      );
      expect(item.classList.contains("react-flow__edge")).toBe(true);
    }
    expect(items[0]?.getAttribute("aria-label")).toBe(
      "Edge from place to transition",
    );
    expect(items[2]?.getAttribute("aria-label")).toBe(
      "Edge from component to transition",
    );
    expect(items[0]?.getAttribute("data-testid")).toBe("rf__edge-input");
  });

  it("start an arc at a component port from the port's pin", () => {
    const { band } = mount();
    // The middle of the right side of the pin at (646, 10), 8 by 8.
    expect(band("port-input").getAttribute("d")).toMatch(/^M654,14C/);
    expect(band("port-output").getAttribute("d")).toMatch(/ 546,14$/);
  });

  it("leave out an arc whose pin is not measured yet", () => {
    const { container } = mount(scene, { measured: false });
    expect(
      [...container.querySelectorAll(".arc-item")].map((item) =>
        item.getAttribute("data-id"),
      ),
    ).toEqual(["input", "output"]);
  });

  it("change only the elements of the arcs that draw differently", () => {
    const { container, item, show } = mount();
    const changed = new Set<string | null>();
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        const target = record.target instanceof Element ? record.target : null;
        changed.add(
          target?.closest(".arc-item")?.getAttribute("data-id") ?? null,
        );
      }
    });
    const holder = container.querySelector(".arc-items");
    if (!holder) {
      throw new Error("no arcs");
    }
    observer.observe(holder, {
      subtree: true,
      childList: true,
      attributes: true,
    });
    const kept = item("output");

    show(withNodeAt("component", { x: 700, y: 0 }));
    show(withArcs({ input: { focus: "incoming" } }));
    observer.takeRecords().forEach((record) => {
      const target = record.target instanceof Element ? record.target : null;
      changed.add(
        target?.closest(".arc-item")?.getAttribute("data-id") ?? null,
      );
    });
    observer.disconnect();

    // The component has no outline: its arcs end at pins, which did not move.
    expect([...changed]).toEqual(["input"]);
    expect(item("output")).toBe(kept);
  });

  it("do not render for a pan or a zoom, with an arc at a pin", () => {
    const { renders, store } = mount();
    const before = renders.mock.calls.length;

    act(() => store.setState({ transform: [40, 20, 1.5] }));
    act(() => store.setState({ transform: [80, 20, 0.5] }));

    expect(renders.mock.calls.length).toBe(before);
  });

  it("tell the pulses which arcs are on the page, and where the pulse of each goes", () => {
    const { pulses, item, show } = mount();
    const view = pulses.show.mock.lastCall?.[0];

    expect(view?.arcs.map((arc) => arc.id)).toEqual([
      "input",
      "output",
      "port-input",
      "port-output",
    ]);
    expect(view?.slotOf(1)).toBe(item("output").querySelector(".arc-pulses"));
    expect(view?.slotOf(9)).toBeNull();

    // The same arcs again: nothing to tell.
    const told = pulses.show.mock.calls.length;
    show(withArcs({}));
    expect(pulses.show.mock.calls.length).toBe(told);
  });

  it("tell the pulses when no arc is drawn any more", () => {
    const { pulses } = mount();
    cleanup();
    expect(pulses.show.mock.lastCall?.[0]).toBeNull();
  });
});

describe("a click on an arc", () => {
  it("selects the arc alone, after React Flow has deselected the rest", () => {
    const { gestures, store, band } = mount();
    const order: string[] = [];
    const addSelectedEdges = vi.fn(() => order.push("react flow"));
    gestures.selectLink.mockImplementation(() => order.push("canvas"));
    store.setState({ addSelectedEdges, nodesSelectionActive: true });

    fireEvent.click(band("output"));

    expect(addSelectedEdges).toHaveBeenCalledWith(["output"]);
    expect(store.getState().nodesSelectionActive).toBe(false);
    expect(gestures.selectLink).toHaveBeenCalledWith({
      type: "arc",
      id: "output",
    });
    expect(order).toEqual(["react flow", "canvas"]);
  });

  it("deselects and blurs a selected arc when the modifier is held", () => {
    const { store, band, item } = mount(
      withArcs({ output: { selected: true } }),
    );
    const unselectNodesAndEdges = vi.fn();
    const addSelectedEdges = vi.fn();
    store.setState({
      unselectNodesAndEdges,
      addSelectedEdges,
      multiSelectionActive: true,
    });
    item("output").focus();

    fireEvent.click(band("output"));

    expect(unselectNodesAndEdges).toHaveBeenCalledWith({
      nodes: [],
      edges: [
        { id: "output", source: "transition", target: "place", selected: true },
      ],
    });
    expect(addSelectedEdges).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(item("output"));
  });

  it("selects the arc while a node is being added, and tells React Flow nothing", () => {
    const { gestures, store, band, item } = mount(scene, { isAddMode: true });
    const addSelectedEdges = vi.fn();
    store.setState({ addSelectedEdges, nodesSelectionActive: true });

    fireEvent.click(band("input"));

    expect(addSelectedEdges).not.toHaveBeenCalled();
    expect(store.getState().nodesSelectionActive).toBe(true);
    expect(gestures.selectLink).toHaveBeenCalledWith({
      type: "arc",
      id: "input",
    });
    // And the pointer does not show it as something to pick.
    expect(item("input").classList.contains("selectable")).toBe(false);
  });

  it("is no click on an arc when it lands between the arcs", () => {
    const { container, gestures, store } = mount();
    const addSelectedEdges = vi.fn();
    store.setState({ addSelectedEdges });

    // A press on one arc released on another is a click on what holds both.
    const holder = container.querySelector(".arc-items");
    if (holder) {
      fireEvent.click(holder);
    }

    expect(addSelectedEdges).not.toHaveBeenCalled();
    expect(gestures.selectLink).not.toHaveBeenCalled();
  });
});

describe("the pointer on an arc", () => {
  it("enters the arc it comes onto, with the event, and leaves it for the pane", () => {
    const { gestures, band, container } = mount();
    const pane = container.querySelector("svg");

    fireEvent.mouseOver(band("input"), { relatedTarget: pane, buttons: 1 });
    expect(gestures.enterItem).toHaveBeenCalledTimes(1);
    expect(gestures.enterItem.mock.lastCall?.[1]).toBe("input");
    // The canvas reads the buttons from the event: a pressed pointer waits.
    expect(gestures.enterItem.mock.lastCall?.[0].buttons).toBe(1);

    fireEvent.mouseOut(band("input"), { relatedTarget: pane });
    expect(gestures.clearHover).toHaveBeenCalledTimes(1);
  });

  it("leaves one arc before it enters the next", () => {
    const { gestures, band } = mount();
    const order: string[] = [];
    gestures.clearHover.mockImplementation(() => order.push("leave"));
    gestures.enterItem.mockImplementation((_event, id) =>
      order.push(`enter ${id}`),
    );

    // What a browser sends for a move from one element to another.
    fireEvent.mouseOut(band("input"), { relatedTarget: band("output") });
    fireEvent.mouseOver(band("output"), { relatedTarget: band("input") });

    expect(order).toEqual(["leave", "enter output"]);
  });

  it("stays on an arc while it moves between the parts of it", () => {
    const { gestures, band, item } = mount(withArcs({ input: { weight: 3 } }));
    const box = item("input").querySelector("rect");
    if (!box) {
      throw new Error("an arc of weight 3 shows its weight");
    }

    fireEvent.mouseOut(band("input"), { relatedTarget: box });
    fireEvent.mouseOver(box, { relatedTarget: band("input") });

    expect(gestures.clearHover).not.toHaveBeenCalled();
    expect(gestures.enterItem).not.toHaveBeenCalled();
  });
});

describe("the keys on a focused arc", () => {
  it.each(["Enter", " "])(
    "tell React Flow of the arc on %j, which deselects the rest",
    (key) => {
      const { store, item, gestures } = mount();
      const addSelectedEdges = vi.fn();
      store.setState({ addSelectedEdges });

      fireEvent.keyDown(item("input"), { key });

      expect(addSelectedEdges).toHaveBeenCalledWith(["input"]);
      // The canvas selects an arc on a click alone.
      expect(gestures.selectLink).not.toHaveBeenCalled();
    },
  );

  it("blur and deselect the arc on Escape", () => {
    const { store, item } = mount(withArcs({ input: { selected: true } }));
    const unselectNodesAndEdges = vi.fn();
    store.setState({ unselectNodesAndEdges });
    item("input").focus();
    expect(document.activeElement).toBe(item("input"));

    fireEvent.keyDown(item("input"), { key: "Escape" });

    expect(document.activeElement).not.toBe(item("input"));
    expect(unselectNodesAndEdges).toHaveBeenCalledWith({
      edges: [
        { id: "input", source: "place", target: "transition", selected: true },
      ],
    });
  });

  it("do nothing for another key, or while a node is being added", () => {
    const first = mount();
    const addSelectedEdges = vi.fn();
    first.store.setState({ addSelectedEdges });
    fireEvent.keyDown(first.item("input"), { key: "ArrowRight" });
    expect(addSelectedEdges).not.toHaveBeenCalled();
    cleanup();

    const adding = mount(scene, { isAddMode: true });
    adding.store.setState({ addSelectedEdges });
    fireEvent.keyDown(adding.item("input"), { key: "Enter" });
    expect(addSelectedEdges).not.toHaveBeenCalled();
  });
});
