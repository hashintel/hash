import { describe, expect, it, vi } from "vitest";

import { createPetrinaut } from "../../instance";
import { createReadableStore } from "../../store";
import { createJsonDocHandle } from "./create-json-doc-handle";

import type { SDCPN } from "../../types/sdcpn";
import type { DocChangeEvent, PetrinautDocHandle } from "../types";

const empty = (): SDCPN => ({
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
});

const coloured = (): SDCPN => ({
  places: [
    {
      id: "p1",
      name: "Place 1",
      colorId: "t1",
      dynamicsEnabled: true,
      differentialEquationId: "d1",
      visualizerCode: "export default Visualization(() => <svg />);",
      x: 0,
      y: 0,
    },
  ],
  transitions: [],
  types: [
    {
      id: "t1",
      name: "Color 1",
      iconSlug: "circle",
      displayColor: "#FF0000",
      elements: [{ elementId: "e1", name: "x", type: "real" }],
    },
  ],
  parameters: [],
  differentialEquations: [
    {
      id: "d1",
      name: "Dynamics 1",
      colorId: "t1",
      code: "export default Dynamics(({ x }) => ({ x }));",
    },
  ],
  scenarios: [
    {
      id: "s1",
      name: "Scenario 1",
      scenarioParameters: [],
      parameterOverrides: {},
      initialState: {
        type: "per_place",
        content: { p1: [[1], [2]] },
      },
    },
  ],
});

describe("createJsonDocHandle", () => {
  it("starts with the initial doc and reports state ready", () => {
    const handle = createJsonDocHandle({ initial: empty() });
    expect(handle.state.get()).toBe("ready");
    expect(handle.doc()).toEqual(empty());
  });

  it("emits a change event with patches on mutation", () => {
    const handle = createJsonDocHandle({ initial: empty() });
    const events: DocChangeEvent[] = [];
    handle.subscribe((event) => events.push(event));

    handle.change((draft) => {
      draft.places.push({
        id: "p1",
        name: "Place 1",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 0,
        y: 0,
      });
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.source).toBe("local");
    expect(events[0]?.next.places).toHaveLength(1);
    expect(events[0]?.patches).toBeDefined();
    expect(events[0]?.patches?.length).toBeGreaterThan(0);
    const firstPatch = events[0]?.patches?.[0];
    expect(firstPatch?.op).toBe("add");
    expect(firstPatch?.path[0]).toBe("places");
  });

  it("does not emit when the mutation is a no-op", () => {
    const handle = createJsonDocHandle({ initial: empty() });
    const listener = vi.fn();
    handle.subscribe(listener);
    handle.change(() => {
      // no-op
    });
    expect(listener).not.toHaveBeenCalled();
  });

  it("can expose read-only capabilities and ignore direct changes", () => {
    const handle = createJsonDocHandle({
      initial: empty(),
      capabilities: {
        readonly: true,
        disabledExtensions: [
          "colors",
          "stochasticity",
          "dynamics",
          "parameters",
        ],
      },
    });
    const listener = vi.fn();
    handle.subscribe(listener);

    handle.change((draft) => {
      draft.types.push({
        id: "t1",
        name: "Color 1",
        iconSlug: "circle",
        displayColor: "#FF0000",
        elements: [],
      });
    });

    expect(handle.capabilities?.readonly).toBe(true);
    expect(handle.capabilities?.disabledExtensions).toEqual([
      "colors",
      "stochasticity",
      "dynamics",
      "parameters",
    ]);
    expect(handle.doc()?.types).toHaveLength(0);
    expect(listener).not.toHaveBeenCalled();
  });

  it("sanitizes direct changes and history for disabled extensions", () => {
    const handle = createJsonDocHandle({
      initial: empty(),
      capabilities: {
        disabledExtensions: ["colors"],
      },
    });

    handle.change((draft) => {
      draft.types.push({
        id: "t1",
        name: "Color 1",
        iconSlug: "circle",
        displayColor: "#FF0000",
        elements: [{ elementId: "e1", name: "x", type: "real" }],
      });
      draft.places.push({
        id: "p1",
        name: "Place 1",
        colorId: "t1",
        dynamicsEnabled: true,
        differentialEquationId: null,
        x: 0,
        y: 0,
      });
    });

    expect(handle.doc()?.types).toEqual([]);
    expect(handle.doc()?.places[0]).toMatchObject({
      colorId: null,
      dynamicsEnabled: false,
    });

    expect(handle.history?.undo()).toBe(true);
    expect(handle.doc()?.types).toEqual([]);
    expect(handle.doc()?.places).toEqual([]);

    expect(handle.history?.redo()).toBe(true);
    expect(handle.doc()?.types).toEqual([]);
    expect(handle.doc()?.places[0]).toMatchObject({
      colorId: null,
      dynamicsEnabled: false,
    });
  });
});

describe("createPetrinaut", () => {
  it("exposes the current definition through a ReadableStore", () => {
    const handle = createJsonDocHandle({ initial: empty() });
    const instance = createPetrinaut({ document: handle });

    expect(instance.definition.get()).toEqual(empty());

    const seen: SDCPN[] = [];
    const off = instance.definition.subscribe((value) => seen.push(value));

    instance.mutations.addType({
      id: "t1",
      name: "Color 1",
      iconSlug: "circle",
      displayColor: "#FF0000",
      elements: [],
    });

    expect(instance.definition.get().types).toHaveLength(1);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.types).toHaveLength(1);

    off();
  });

  it("forwards patches through the patches event stream", () => {
    const handle = createJsonDocHandle({ initial: empty() });
    const instance = createPetrinaut({ document: handle });

    const seenPatches: number[] = [];
    instance.patches.subscribe((patches) => seenPatches.push(patches.length));

    instance.mutations.addType({
      id: "t1",
      name: "Color 1",
      iconSlug: "circle",
      displayColor: "#FF0000",
      elements: [],
    });

    expect(seenPatches.length).toBeGreaterThan(0);
    expect(seenPatches[0]).toBeGreaterThan(0);
  });

  it("ignores mutations when readonly", () => {
    const handle = createJsonDocHandle({ initial: empty() });
    const instance = createPetrinaut({ document: handle, readonly: true });

    instance.mutations.addType({
      id: "t1",
      name: "Color 1",
      iconSlug: "circle",
      displayColor: "#FF0000",
      elements: [],
    });

    expect(instance.definition.get().types).toHaveLength(0);
  });

  it("derives readonly and extension settings from handle capabilities", () => {
    const handle = createJsonDocHandle({
      initial: empty(),
      capabilities: {
        readonly: true,
        disabledExtensions: [
          "colors",
          "stochasticity",
          "dynamics",
          "parameters",
        ],
      },
    });
    const instance = createPetrinaut({ document: handle });

    expect(instance.readonly).toBe(true);
    expect(instance.extensions).toEqual({
      colors: false,
      stochasticity: false,
      dynamics: false,
      parameters: false,
      subnets: true,
    });
  });

  it("disables dynamics whenever colors are disabled", () => {
    const handle = createJsonDocHandle({
      initial: empty(),
      capabilities: {
        disabledExtensions: ["colors"],
      },
    });
    const instance = createPetrinaut({ document: handle });

    expect(instance.capabilities.disabledExtensions).toEqual([
      "colors",
      "dynamics",
    ]);
    expect(instance.extensions).toEqual({
      colors: false,
      stochasticity: true,
      dynamics: false,
      parameters: true,
      subnets: true,
    });
  });

  it("exposes sanitized definitions from capability-restricted handles", async () => {
    const source = coloured();
    const subscribers = new Set<(event: DocChangeEvent) => void>();
    let upstreamSubscriptions = 0;
    const handle: PetrinautDocHandle = {
      id: "external-doc",
      capabilities: { disabledExtensions: ["colors"] },
      state: createReadableStore("ready"),
      whenReady: () => Promise.resolve(),
      doc: () => source,
      change(fn) {
        fn(source);
        for (const subscriber of subscribers) {
          subscriber({ next: source, source: "local" });
        }
      },
      subscribe(listener) {
        upstreamSubscriptions += 1;
        subscribers.add(listener);
        return () => {
          upstreamSubscriptions -= 1;
          subscribers.delete(listener);
        };
      },
    };
    const instance = createPetrinaut({ document: handle });

    expect(upstreamSubscriptions).toBe(2);
    expect(instance.definition.get()).toMatchObject({
      types: [],
      differentialEquations: [],
      places: [
        {
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
        },
      ],
    });
    expect(instance.definition.get().scenarios?.[0]?.initialState).toEqual({
      type: "per_place",
      content: { p1: "2" },
    });
    expect(source.types).toHaveLength(1);

    await instance.commands.applyAutoLayout();
    expect(source.types).toEqual([]);
    expect(source.places[0]).toMatchObject({
      colorId: null,
      dynamicsEnabled: false,
    });

    instance.dispose();
    expect(upstreamSubscriptions).toBe(0);
  });
});

describe("PetrinautDocHandle history", () => {
  const addType = (name: string) => (draft: SDCPN) => {
    draft.types.push({
      id: name,
      name,
      iconSlug: "circle",
      displayColor: "#FF0000",
      elements: [],
    });
  };

  it("is present on createJsonDocHandle and starts empty", () => {
    const handle = createJsonDocHandle({ initial: empty() });
    expect(handle.history).toBeDefined();
    expect(handle.history?.canUndo.get()).toBe(false);
    expect(handle.history?.canRedo.get()).toBe(false);
    expect(handle.history?.entries.get()).toHaveLength(1);
    expect(handle.history?.currentIndex.get()).toBe(0);
  });

  it("is omitted when historyLimit is 0", () => {
    const handle = createJsonDocHandle({ initial: empty(), historyLimit: 0 });
    expect(handle.history).toBeUndefined();
  });

  it("undoes a single mutation", () => {
    const handle = createJsonDocHandle({ initial: empty() });
    handle.change(addType("c1"));
    expect(handle.doc()?.types).toHaveLength(1);
    expect(handle.history?.canUndo.get()).toBe(true);

    const undone = handle.history?.undo();
    expect(undone).toBe(true);
    expect(handle.doc()?.types).toHaveLength(0);
    expect(handle.history?.canUndo.get()).toBe(false);
    expect(handle.history?.canRedo.get()).toBe(true);
  });

  it("redoes after undoing", () => {
    const handle = createJsonDocHandle({ initial: empty() });
    handle.change(addType("c1"));
    handle.history?.undo();
    expect(handle.doc()?.types).toHaveLength(0);

    const redone = handle.history?.redo();
    expect(redone).toBe(true);
    expect(handle.doc()?.types).toHaveLength(1);
  });

  it("truncates the redo stack on a new mutation after undo", () => {
    const handle = createJsonDocHandle({ initial: empty() });
    handle.change(addType("c1"));
    handle.change(addType("c2"));
    handle.history?.undo();
    expect(handle.history?.canRedo.get()).toBe(true);

    handle.change(addType("c3"));
    expect(handle.history?.canRedo.get()).toBe(false);
    expect(handle.doc()?.types.map((t) => t.id)).toEqual(["c1", "c3"]);
  });

  it("emits change events with patches when undoing or redoing", () => {
    const handle = createJsonDocHandle({ initial: empty() });
    const events: number[] = [];
    handle.subscribe((event) => events.push(event.patches?.length ?? 0));

    handle.change(addType("c1"));
    handle.history?.undo();
    handle.history?.redo();

    expect(events).toHaveLength(3);
    expect(events.every((n) => n > 0)).toBe(true);
  });

  it("supports goToIndex jumping forward and backward", () => {
    const handle = createJsonDocHandle({ initial: empty() });
    handle.change(addType("c1"));
    handle.change(addType("c2"));
    handle.change(addType("c3"));
    expect(handle.doc()?.types).toHaveLength(3);

    handle.history?.goToIndex(1);
    expect(handle.doc()?.types.map((t) => t.id)).toEqual(["c1"]);

    handle.history?.goToIndex(3);
    expect(handle.doc()?.types.map((t) => t.id)).toEqual(["c1", "c2", "c3"]);

    handle.history?.goToIndex(0);
    expect(handle.doc()?.types).toHaveLength(0);
  });

  it("respects historyLimit by dropping oldest entries", () => {
    const handle = createJsonDocHandle({ initial: empty(), historyLimit: 2 });
    handle.change(addType("c1"));
    handle.change(addType("c2"));
    handle.change(addType("c3"));

    // Stack capped at 2 entries; cursor is at the latest.
    expect(handle.history?.entries.get().length).toBe(3); // initial + 2 retained
    expect(handle.history?.canRedo.get()).toBe(false);
    expect(handle.doc()?.types.map((t) => t.id)).toEqual(["c1", "c2", "c3"]);

    // Undoing twice rolls back the two retained entries.
    handle.history?.undo();
    handle.history?.undo();
    expect(handle.history?.canUndo.get()).toBe(false);
    expect(handle.doc()?.types.map((t) => t.id)).toEqual(["c1"]);
  });

  it("clear() drops the history stack", () => {
    const handle = createJsonDocHandle({ initial: empty() });
    handle.change(addType("c1"));
    handle.history?.clear();
    expect(handle.history?.canUndo.get()).toBe(false);
    expect(handle.history?.entries.get()).toHaveLength(1);
    expect(handle.doc()?.types).toHaveLength(1); // doc state unchanged
  });
});
