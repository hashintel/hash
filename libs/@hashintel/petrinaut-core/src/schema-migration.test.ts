import { describe, expect, test } from "vitest";

import { createJsonDocHandle } from "./handle";
import { createPetrinaut } from "./instance";
import { migrateScenarioRowsForTypeEdit } from "./schema-migration";
import { scenarioSchema } from "./schemas/scenario-schema";
import { formatUuid, toUuid } from "./simulation/engine/uuid";

import type { Place, SDCPN } from "./types/sdcpn";

const NIL_UUID_STRING = "00000000-0000-0000-0000-000000000000";

const makePlace = (id: string, colorId: string | null): Place => ({
  id,
  name: `Place${id.replaceAll(/[^a-zA-Z0-9]/g, "")}`,
  colorId,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
});

const makeBaseSDCPN = (): SDCPN => ({
  places: [makePlace("place-1", "type-1"), makePlace("place-plain", null)],
  transitions: [],
  types: [
    {
      id: "type-1",
      name: "Particle",
      iconSlug: "circle",
      displayColor: "#34a0fa",
      elements: [
        { elementId: "element-1", name: "mass", type: "real" },
        { elementId: "element-2", name: "count", type: "integer" },
        { elementId: "element-3", name: "label", type: "string" },
      ],
    },
  ],
  differentialEquations: [],
  parameters: [],
  subnets: [
    {
      id: "subnet-1",
      name: "Inner",
      places: [makePlace("place-sub", "type-1")],
      transitions: [],
      types: [],
      differentialEquations: [],
      parameters: [],
    },
  ],
  scenarios: [
    {
      id: "scenario-1",
      name: "Baseline",
      scenarioParameters: [],
      parameterOverrides: {},
      initialState: {
        type: "per_place",
        content: {
          "place-1": [
            [1.5, 2, "alpha"],
            [2.5, 3, "beta"],
          ],
          "place-sub": [[9.5, 7, "gamma"]],
          "place-plain": "5",
        },
      },
    },
    {
      id: "scenario-2",
      name: "Coded",
      scenarioParameters: [],
      parameterOverrides: {},
      initialState: {
        type: "code",
        content: "return {};",
      },
    },
  ],
});

const cloneSDCPN = (sdcpn: SDCPN): SDCPN =>
  (
    globalThis as typeof globalThis & {
      structuredClone: <Value>(value: Value) => Value;
    }
  ).structuredClone(sdcpn);

const createInstance = (initial: SDCPN = makeBaseSDCPN()) =>
  createPetrinaut({
    document: createJsonDocHandle({ initial: cloneSDCPN(initial) }),
  });

const getScenarioRows = (
  sdcpn: SDCPN,
  placeId: string,
): (number | boolean | string)[][] => {
  const scenario = sdcpn.scenarios![0]!;
  if (scenario.initialState.type !== "per_place") {
    throw new Error("expected per_place scenario");
  }
  const rows = scenario.initialState.content[placeId];
  if (!Array.isArray(rows)) {
    throw new Error(`expected rows for ${placeId}`);
  }
  return rows;
};

describe("migrateScenarioRowsForTypeEdit", () => {
  test("move applies the same permutation the elements array received", () => {
    const sdcpn = cloneSDCPN(makeBaseSDCPN());
    // Mirror the element move (index 0 → index 2) on the type itself first.
    const [moved] = sdcpn.types[0]!.elements.splice(0, 1);
    sdcpn.types[0]!.elements.splice(2, 0, moved!);

    migrateScenarioRowsForTypeEdit(sdcpn, "type-1", {
      kind: "move",
      fromIndex: 0,
      toIndex: 2,
    });

    expect(getScenarioRows(sdcpn, "place-1")).toEqual([
      [2, "alpha", 1.5],
      [3, "beta", 2.5],
    ]);
  });

  test("fills ragged rows with element defaults", () => {
    const sdcpn = cloneSDCPN(makeBaseSDCPN());
    const scenario = sdcpn.scenarios![0]!;
    if (scenario.initialState.type !== "per_place") {
      throw new Error("expected per_place scenario");
    }
    scenario.initialState.content["place-1"] = [[1.5]];

    sdcpn.types[0]!.elements.push({
      elementId: "element-4",
      name: "id",
      type: "uuid",
    });
    migrateScenarioRowsForTypeEdit(sdcpn, "type-1", {
      kind: "add",
      element: sdcpn.types[0]!.elements[3]!,
    });

    // Missing integer/string cells default to 0/"" and the new uuid column
    // defaults to the nil UUID string.
    expect(getScenarioRows(sdcpn, "place-1")).toEqual([
      [1.5, 0, "", NIL_UUID_STRING],
    ]);
  });

  test("ignores types with no colored places and unknown types", () => {
    const sdcpn = cloneSDCPN(makeBaseSDCPN());
    const before = cloneSDCPN(sdcpn).scenarios;
    migrateScenarioRowsForTypeEdit(sdcpn, "type-unknown", {
      kind: "remove",
      index: 0,
    });
    expect(sdcpn.scenarios).toEqual(before);
  });
});

describe("scenario row migration through actions", () => {
  test("addTypeElement appends default cells to root and subnet place rows", () => {
    const instance = createInstance();

    instance.mutations.addTypeElement({
      typeId: "type-1",
      element: { elementId: "element-4", name: "id", type: "uuid" },
    });

    const definition = instance.definition.get();
    expect(getScenarioRows(definition, "place-1")).toEqual([
      [1.5, 2, "alpha", NIL_UUID_STRING],
      [2.5, 3, "beta", NIL_UUID_STRING],
    ]);
    expect(getScenarioRows(definition, "place-sub")).toEqual([
      [9.5, 7, "gamma", NIL_UUID_STRING],
    ]);
  });

  test("removeTypeElement splices the matching column out of each row", () => {
    const instance = createInstance();

    instance.mutations.removeTypeElement({
      typeId: "type-1",
      elementId: "element-2",
    });

    const definition = instance.definition.get();
    expect(getScenarioRows(definition, "place-1")).toEqual([
      [1.5, "alpha"],
      [2.5, "beta"],
    ]);
    expect(getScenarioRows(definition, "place-sub")).toEqual([[9.5, "gamma"]]);
  });

  test("moveTypeElement permutes row columns, clamping out-of-range targets", () => {
    const instance = createInstance();

    instance.mutations.moveTypeElement({
      typeId: "type-1",
      elementId: "element-1",
      toIndex: 99,
    });

    const definition = instance.definition.get();
    expect(definition.types[0]!.elements.map((el) => el.elementId)).toEqual([
      "element-2",
      "element-3",
      "element-1",
    ]);
    expect(getScenarioRows(definition, "place-1")).toEqual([
      [2, "alpha", 1.5],
      [3, "beta", 2.5],
    ]);
  });

  test("changing an element type coerces cells, with default fallback", () => {
    const instance = createInstance();

    // real → integer: 1.5 rounds to 2 (and 2.5 to 3, banker-free Math.round).
    instance.mutations.updateTypeElement({
      typeId: "type-1",
      elementId: "element-1",
      update: { type: "integer" },
    });
    expect(getScenarioRows(instance.definition.get(), "place-1")).toEqual([
      [2, 2, "alpha"],
      [3, 3, "beta"],
    ]);

    // string "alpha" → integer: not numeric, falls back to the default 0.
    instance.mutations.updateTypeElement({
      typeId: "type-1",
      elementId: "element-3",
      update: { type: "integer" },
    });
    expect(getScenarioRows(instance.definition.get(), "place-1")).toEqual([
      [2, 2, 0],
      [3, 3, 0],
    ]);

    // integer → boolean: nonzero numbers become true.
    instance.mutations.updateTypeElement({
      typeId: "type-1",
      elementId: "element-3",
      update: { type: "boolean" },
    });
    expect(getScenarioRows(instance.definition.get(), "place-1")).toEqual([
      [2, 2, false],
      [3, 3, false],
    ]);

    // integer → uuid: numbers convert deterministically to canonical
    // lowercase UUIDv5 strings.
    instance.mutations.updateTypeElement({
      typeId: "type-1",
      elementId: "element-2",
      update: { type: "uuid" },
    });
    expect(getScenarioRows(instance.definition.get(), "place-1")).toEqual([
      [2, formatUuid(toUuid(2)), false],
      [3, formatUuid(toUuid(3)), false],
    ]);
    expect(getScenarioRows(instance.definition.get(), "place-sub")).toEqual([
      [10, formatUuid(toUuid(7)), false],
    ]);
  });

  test("rename-only element updates leave rows untouched", () => {
    const instance = createInstance();

    instance.mutations.updateTypeElement({
      typeId: "type-1",
      elementId: "element-1",
      update: { name: "mass_kg" },
    });

    expect(getScenarioRows(instance.definition.get(), "place-1")).toEqual([
      [1.5, 2, "alpha"],
      [2.5, 3, "beta"],
    ]);
  });

  test("leaves uncolored expressions and code scenarios untouched, and keeps scenarios valid", () => {
    const instance = createInstance();

    instance.mutations.addTypeElement({
      typeId: "type-1",
      element: { elementId: "element-4", name: "active", type: "boolean" },
    });
    instance.mutations.removeTypeElement({
      typeId: "type-1",
      elementId: "element-1",
    });

    const definition = instance.definition.get();
    const perPlaceScenario = definition.scenarios![0]!;
    if (perPlaceScenario.initialState.type !== "per_place") {
      throw new Error("expected per_place scenario");
    }
    expect(perPlaceScenario.initialState.content["place-plain"]).toBe("5");
    expect(definition.scenarios![1]!.initialState).toEqual({
      type: "code",
      content: "return {};",
    });

    for (const scenario of definition.scenarios!) {
      expect(() => scenarioSchema.parse(scenario)).not.toThrow();
    }
  });

  test("undoing a type-element edit restores the migrated rows atomically", () => {
    const instance = createInstance();

    instance.mutations.removeTypeElement({
      typeId: "type-1",
      elementId: "element-2",
    });
    expect(getScenarioRows(instance.definition.get(), "place-1")).toEqual([
      [1.5, "alpha"],
      [2.5, "beta"],
    ]);

    instance.handle.history!.undo();

    const definition = instance.definition.get();
    expect(definition.types[0]!.elements).toHaveLength(3);
    expect(getScenarioRows(definition, "place-1")).toEqual([
      [1.5, 2, "alpha"],
      [2.5, 3, "beta"],
    ]);
  });
});
