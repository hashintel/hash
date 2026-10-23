import { afterEach, beforeAll, expect, test, vi } from "vitest";

import { readRustWasm } from "../../scripts/read-rust-wasm.mjs";
import { createJsonDocHandle } from "../handle";
import { createPetrinaut, type Petrinaut } from "../instance";
import { toPetrinautId } from "../petrinaut-id";
import { createRustPetrinaut, initializePetrinautRust } from "./index";

const instances: Petrinaut[] = [];
beforeAll(async () => {
  await initializePetrinautRust(await readRustWasm());
});
afterEach(() => {
  for (const instance of instances.splice(0)) {
    instance.dispose();
  }
});
const create = async (
  options: Partial<Parameters<typeof createRustPetrinaut>[0]> = {},
) => {
  const instance = await createRustPetrinaut({
    initial: { places: [], transitions: [] },
    ...options,
  });
  instances.push(instance);
  return instance;
};

test("runs mutations, native positions, cascaded deletion and history like the JSON instance", async () => {
  const rust = await create();
  const reference = createPetrinaut({
    document: createJsonDocHandle({ initial: { places: [], transitions: [] } }),
  });
  instances.push(reference);
  for (const instance of [rust, reference]) {
    instance.mutations.addPlace({
      id: "p",
      name: "Queue",
      x: 0,
      y: 0,
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
    });
    instance.mutations.addTransition({
      id: "t",
      name: "Serve",
      x: 10,
      y: 20,
      inputArcs: [],
      outputArcs: [],
      lambdaType: "stochastic",
      lambdaCode: "export default () => 1;",
      transitionKernelCode: "",
    });
    instance.mutations.updatePlacePosition({
      placeId: "p",
      position: { x: 42, y: 7 },
    });
    instance.mutations.commitNodePositions({
      commits: [
        { id: "p", itemType: "place", position: { x: 1, y: 2 } },
        { id: "t", itemType: "transition", position: { x: 3, y: 4 } },
      ],
    });
  }
  expect(rust.definition.get()).toEqual(reference.definition.get());
  const unchangedTransition = rust.handle.doc()?.transitions[0];
  rust.mutations.updatePlacePosition({
    placeId: "p",
    position: { x: 2, y: 3 },
  });
  expect(rust.handle.doc()?.transitions[0]).toBe(unchangedTransition);
  rust.handle.history?.undo();
  for (const instance of [rust, reference]) {
    instance.mutations.removePlace({ placeId: "p" });
  }
  expect(rust.definition.get()).toEqual(reference.definition.get());
  for (const instance of [rust, reference]) {
    instance.handle.history?.goToIndex(0);
  }
  expect(rust.definition.get()).toEqual(reference.definition.get());
});

test("rolls back thrown drafts and rejects non-finite JSON without a history entry", async () => {
  const instance = await create();
  const initial = instance.definition.get();
  expect(() =>
    instance.handle.change((draft) => {
      draft.places.push({
        id: "p",
        name: "Queue",
        x: 0,
        y: 0,
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
      });
      throw new Error("cancel");
    }),
  ).toThrow("cancel");
  expect(() =>
    instance.handle.change((draft) => {
      draft.places.push({
        id: "p",
        name: "Queue",
        x: Infinity,
        y: 0,
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
      });
    }),
  ).toThrow("finite numbers");
  expect(instance.definition.get()).toBe(initial);
  expect(instance.handle.history?.canUndo.get()).toBe(false);
});

test("native no-op moves do not emit patches or create history", async () => {
  const instance = await create({
    initial: {
      places: [{ id: "p", name: "Queue", x: 0, y: 0 }],
      transitions: [],
    },
  });
  const listener = vi.fn();
  instance.patches.subscribe(listener);
  instance.mutations.updatePlacePosition({
    placeId: "p",
    position: { x: 0, y: 0 },
  });
  expect(listener).not.toHaveBeenCalled();
  expect(instance.handle.history?.canUndo.get()).toBe(false);
  expect(instance.definition.get().places[0]?.id).toBe(toPetrinautId("p"));
});

test("read-only instances guard both native moves and draft mutations", async () => {
  const instance = await create({
    readonly: true,
    initial: {
      places: [{ id: "p", name: "Queue", x: 0, y: 0 }],
      transitions: [],
    },
  });
  instance.mutations.updatePlacePosition({
    placeId: "p",
    position: { x: 42, y: 7 },
  });
  instance.mutations.addPlace({
    id: "other",
    name: "Other",
    x: 0,
    y: 0,
    colorId: null,
    dynamicsEnabled: false,
    differentialEquationId: null,
  });
  expect(instance.definition.get().places).toHaveLength(1);
  expect(instance.definition.get().places[0]?.x).toBe(0);
});

test("dispose is idempotent and stale handles cannot use freed Wasm memory", async () => {
  const instance = await create();
  const listener = vi.fn();
  instance.definition.subscribe(listener);
  instance.dispose();
  instance.dispose();
  expect(instance.handle.state.get()).toBe("unavailable");
  expect(instance.handle.doc()).toBeUndefined();
  expect(() =>
    instance.mutations.addPlace({
      id: "p",
      name: "Queue",
      x: 0,
      y: 0,
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
    }),
  ).toThrow("disposed");
  expect(() => instance.mutations.commitNodePositions({ commits: [] })).toThrow(
    "disposed",
  );
  expect(listener).not.toHaveBeenCalled();
});

test("rejects reserved patch paths before committing Rust state", async () => {
  const instance = await create();
  expect(() =>
    instance.handle.change((draft) => {
      draft.metadata = JSON.parse('{"constructor": 1}') as Record<
        string,
        number
      >;
    }),
  ).toThrow("reserved property");
  expect(instance.handle.history?.canUndo.get()).toBe(false);
  instance.mutations.addPlace({
    id: "p",
    name: "Queue",
    x: 0,
    y: 0,
    colorId: null,
    dynamicsEnabled: false,
    differentialEquationId: null,
  });
  expect(instance.definition.get().places).toHaveLength(1);
});
