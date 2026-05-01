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
