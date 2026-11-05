import { afterEach, beforeEach, expect, it, vi } from "vitest";

import {
  createJsonDocHandle,
  createPetrinaut,
  createReadableStore,
} from "@hashintel/petrinaut-core";

import { createVisualizerDefinitionStore } from "./visualizer-definition-store";

import type { DocChangeEvent, SDCPN } from "@hashintel/petrinaut-core";

const initial: SDCPN = {
  places: [
    {
      id: "place",
      name: "Place",
      x: 0,
      y: 0,
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      visualizerCode: "initial",
    },
  ],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};
const setup = (definition = initial) => {
  const instance = createPetrinaut({
    document: createJsonDocHandle({ initial: definition }),
  });
  const view = createVisualizerDefinitionStore(
    instance.definition,
    instance.handle,
  );
  const listener = vi.fn();
  const unsubscribe = view.subscribe(listener);
  const edit = (visualizerCode: string) =>
    instance.mutations.updatePlace({
      placeId: instance.definition.get().places[0]!.id,
      update: { visualizerCode },
    });
  return { instance, view, listener, unsubscribe, edit };
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("keeps each real document mutation while coalescing sanitized UI snapshots", () => {
  const { instance, view, listener, unsubscribe, edit } = setup();
  const before = view.get();
  for (let index = 0; index < 20; index++) {
    edit(`code ${index}`);
    expect(instance.handle.doc()?.places[0]?.visualizerCode).toBe(
      `code ${index}`,
    );
    expect(instance.definition.get().places[0]?.visualizerCode).toBe(
      `code ${index}`,
    );
    vi.advanceTimersByTime(10);
  }
  expect(view.get()).toBe(before);
  expect(listener).not.toHaveBeenCalled();
  vi.advanceTimersByTime(120);
  expect(view.get()).toBe(instance.definition.get());
  expect(listener).toHaveBeenCalledTimes(1);
  unsubscribe();
  instance.dispose();
});

it("flushes on interaction, structural changes, and visualizer toggles", () => {
  const { instance, view, unsubscribe, edit } = setup();
  edit("draft");
  view.flush();
  expect(view.get()).toBe(instance.definition.get());
  edit("new draft");
  const placeId = instance.definition.get().places[0]!.id;
  instance.mutations.updatePlace({ placeId, update: { name: "Renamed" } });
  expect(view.get()).toBe(instance.definition.get());
  instance.mutations.updatePlace({
    placeId,
    update: { visualizerCode: undefined },
  });
  expect(view.get()).toBe(instance.definition.get());
  unsubscribe();
  instance.dispose();
});

it("bounds continuous typing latency and cancels work on unsubscribe", () => {
  const { instance, view, listener, unsubscribe, edit } = setup();
  for (let index = 0; index < 50; index++) {
    edit(`code ${index}`);
    vi.advanceTimersByTime(10);
  }
  expect(listener).toHaveBeenCalledTimes(1);
  expect(view.get()).toBe(instance.definition.get());
  edit("last edit");
  unsubscribe();
  vi.advanceTimersByTime(1000);
  expect(listener).toHaveBeenCalledTimes(1);
  const unsubscribeAgain = view.subscribe(listener);
  expect(view.get()).toBe(instance.definition.get());
  unsubscribeAgain();
  instance.dispose();
});

it("coalesces subnet visualizers and flushes changes to other subnet fields", () => {
  const { instance, view, unsubscribe } = setup({
    ...initial,
    subnets: [{ ...initial, id: "subnet", name: "Subnet" }],
  });
  const before = view.get();
  const subnet = instance.definition.get().subnets![0]!;
  instance.mutations.updatePlace({
    targetSubnetId: subnet.id,
    placeId: subnet.places[0]!.id,
    update: { visualizerCode: "subnet code" },
  });
  expect(view.get()).toBe(before);
  instance.mutations.updatePlace({
    targetSubnetId: subnet.id,
    placeId: subnet.places[0]!.id,
    update: { name: "Renamed" },
  });
  expect(view.get()).toBe(instance.definition.get());
  unsubscribe();
  instance.dispose();
});

it.each([undefined, "remote"] as const)(
  "immediately publishes snapshots without local patches (%s)",
  (source) => {
    const definition = createReadableStore(initial);
    let notify = (_event: DocChangeEvent) => {};
    const view = createVisualizerDefinitionStore(definition, {
      subscribe: (listener) => {
        notify = listener;
        return () => {};
      },
    });
    const unsubscribe = view.subscribe(vi.fn());
    const next = structuredClone(initial);
    definition.set(next);
    notify({
      next,
      source,
      patches: source
        ? [
            {
              op: "replace",
              path: ["places", 0, "visualizerCode"],
              value: "remote code",
            },
          ]
        : undefined,
    });
    expect(view.get()).toBe(next);
    unsubscribe();
  },
);
