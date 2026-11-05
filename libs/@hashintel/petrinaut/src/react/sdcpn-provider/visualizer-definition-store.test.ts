import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { createReadableStore } from "@hashintel/petrinaut-core";

import { createVisualizerDefinitionStore } from "./visualizer-definition-store";

import type { SDCPN } from "@hashintel/petrinaut-core";

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
const edit = (code: string): SDCPN => ({
  ...initial,
  places: initial.places.map((place) => ({ ...place, visualizerCode: code })),
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("keeps each edit in the source while coalescing UI snapshots", () => {
  const source = createReadableStore(initial);
  const view = createVisualizerDefinitionStore(source);
  const listener = vi.fn();
  const unsubscribe = view.subscribe(listener);
  for (let index = 0; index < 20; index++) {
    const next = edit(`code ${index}`);
    source.set(next);
    expect(source.get()).toBe(next);
    vi.advanceTimersByTime(10);
  }
  expect(view.get()).toBe(initial);
  expect(listener).not.toHaveBeenCalled();
  vi.advanceTimersByTime(120);
  expect(view.get()).toBe(source.get());
  expect(listener).toHaveBeenCalledTimes(1);
  unsubscribe();
});

it("flushes on interaction and immediately publishes structural changes and visualizer toggles", () => {
  const source = createReadableStore(initial);
  const view = createVisualizerDefinitionStore(source);
  const unsubscribe = view.subscribe(vi.fn());
  source.set(edit("draft"));
  view.flush();
  expect(view.get()).toBe(source.get());
  source.set(edit("new draft"));
  source.set({
    ...source.get(),
    places: source.get().places.map((place) => ({ ...place, x: 20 })),
  });
  expect(view.get()).toBe(source.get());
  source.set({
    ...source.get(),
    places: source
      .get()
      .places.map((place) => ({ ...place, visualizerCode: undefined })),
  });
  expect(view.get()).toBe(source.get());
  unsubscribe();
});

it("bounds the wait during continuous typing and cancels pending work on unsubscribe", () => {
  const source = createReadableStore(initial);
  const view = createVisualizerDefinitionStore(source);
  const listener = vi.fn();
  const unsubscribe = view.subscribe(listener);
  for (let index = 0; index < 50; index++) {
    source.set(edit(`code ${index}`));
    vi.advanceTimersByTime(10);
  }
  expect(listener).toHaveBeenCalledTimes(1);
  expect(view.get()).toBe(source.get());
  source.set(edit("last edit"));
  unsubscribe();
  vi.advanceTimersByTime(1000);
  expect(listener).toHaveBeenCalledTimes(1);
  const unsubscribeAgain = view.subscribe(listener);
  expect(view.get()).toBe(source.get());
  unsubscribeAgain();
});

it("coalesces subnet visualizers and flushes changes to other subnet fields", () => {
  const subnet = { ...initial, id: "subnet", name: "Subnet" };
  const source = createReadableStore<SDCPN>({ ...initial, subnets: [subnet] });
  const view = createVisualizerDefinitionStore(source);
  const unsubscribe = view.subscribe(vi.fn());
  const previous = view.get();
  source.set({
    ...source.get(),
    subnets: [{ ...subnet, places: edit("subnet code").places }],
  });
  expect(view.get()).toBe(previous);
  source.set({ ...source.get(), subnets: [{ ...subnet, name: "Renamed" }] });
  expect(view.get()).toBe(source.get());
  unsubscribe();
});
