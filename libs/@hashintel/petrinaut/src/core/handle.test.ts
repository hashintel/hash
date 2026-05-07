import { describe, expect, it, vi } from "vitest";

import { createJsonDocHandle, type DocChangeEvent } from "./handle";
import { createPetrinaut } from "./instance";
import type { SDCPN } from "./types/sdcpn";

const empty = (): SDCPN => ({
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
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
});

describe("createPetrinaut", () => {
  it("exposes the current definition through a ReadableStore", () => {
    const handle = createJsonDocHandle({ initial: empty() });
    const instance = createPetrinaut({ document: handle });

    expect(instance.definition.get()).toEqual(empty());

    const seen: SDCPN[] = [];
    const off = instance.definition.subscribe((value) => seen.push(value));

    instance.mutate((draft) => {
      draft.types.push({
        id: "t1",
        name: "Color 1",
        iconSlug: "circle",
        displayColor: "#FF0000",
        elements: [],
      });
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

    instance.mutate((draft) => {
      draft.types.push({
        id: "t1",
        name: "Color 1",
        iconSlug: "circle",
        displayColor: "#FF0000",
        elements: [],
      });
    });

    expect(seenPatches.length).toBeGreaterThan(0);
    expect(seenPatches[0]).toBeGreaterThan(0);
  });

  it("ignores mutations when readonly", () => {
    const handle = createJsonDocHandle({ initial: empty() });
    const instance = createPetrinaut({ document: handle, readonly: true });

    instance.mutate((draft) => {
      draft.types.push({
        id: "t1",
        name: "Color 1",
        iconSlug: "circle",
        displayColor: "#FF0000",
        elements: [],
      });
    });

    expect(instance.definition.get().types).toHaveLength(0);
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
