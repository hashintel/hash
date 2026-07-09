import { describe, expect, it } from "vitest";

import { formatUuid, toUuid, type SDCPN } from "@hashintel/petrinaut-core";

import {
  migrateInitialMarkingForTypeChanges,
  snapshotTypeElements,
} from "./migrate-initial-marking";

const NIL_UUID_STRING = "00000000-0000-0000-0000-000000000000";

const makeSDCPN = (): SDCPN => ({
  places: [
    {
      id: "place-1",
      name: "Pool",
      colorId: "type-1",
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
    {
      id: "place-plain",
      name: "Plain",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
  ],
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
      ],
    },
  ],
  differentialEquations: [],
  parameters: [],
  subnets: [
    {
      id: "subnet-1",
      name: "Inner",
      places: [
        {
          id: "place-sub",
          name: "SubPool",
          colorId: "type-sub",
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 0,
          y: 0,
        },
      ],
      transitions: [],
      types: [
        {
          id: "type-sub",
          name: "SubToken",
          iconSlug: "square",
          displayColor: "#ff0000",
          elements: [
            { elementId: "sub-element-1", name: "level", type: "real" },
          ],
        },
      ],
      differentialEquations: [],
      parameters: [],
    },
  ],
});

describe("migrateInitialMarkingForTypeChanges", () => {
  it("returns null when type schemas did not change (including pure additions and reorders)", () => {
    const before = makeSDCPN();
    const previousTypeElements = snapshotTypeElements(before);

    const after = makeSDCPN();
    // Pure addition + reorder: name-keyed records need no migration.
    after.types[0]!.elements = [
      { elementId: "element-2", name: "count", type: "integer" },
      { elementId: "element-1", name: "mass", type: "real" },
      { elementId: "element-3", name: "label", type: "string" },
    ];

    expect(
      migrateInitialMarkingForTypeChanges({
        initialMarking: { "place-1": [{ mass: 1.5, count: 2 }] },
        previousTypeElements,
        sdcpn: after,
      }),
    ).toBeNull();
  });

  it("re-keys renamed elements", () => {
    const before = makeSDCPN();
    const previousTypeElements = snapshotTypeElements(before);

    const after = makeSDCPN();
    after.types[0]!.elements[0]!.name = "mass_kg";

    const migrated = migrateInitialMarkingForTypeChanges({
      initialMarking: {
        "place-1": [
          { mass: 1.5, count: 2 },
          { mass: 2.5, count: 3 },
        ],
      },
      previousTypeElements,
      sdcpn: after,
    });

    expect(migrated).toEqual({
      "place-1": [
        { mass_kg: 1.5, count: 2 },
        { mass_kg: 2.5, count: 3 },
      ],
    });
  });

  it("coerces re-typed elements, falling back to defaults when coercion fails", () => {
    const before = makeSDCPN();
    before.types[0]!.elements = [
      { elementId: "element-1", name: "mass", type: "real" },
      { elementId: "element-2", name: "count", type: "integer" },
      { elementId: "element-3", name: "label", type: "string" },
      { elementId: "element-4", name: "flag", type: "integer" },
      { elementId: "element-5", name: "id", type: "integer" },
    ];
    const previousTypeElements = snapshotTypeElements(before);

    const after = makeSDCPN();
    after.types[0]!.elements = [
      { elementId: "element-1", name: "mass", type: "integer" },
      { elementId: "element-2", name: "count", type: "integer" },
      { elementId: "element-3", name: "label", type: "integer" },
      { elementId: "element-4", name: "flag", type: "boolean" },
      { elementId: "element-5", name: "id", type: "uuid" },
    ];

    const migrated = migrateInitialMarkingForTypeChanges({
      initialMarking: {
        "place-1": [{ mass: 1.7, count: 2, label: "abc", flag: 0, id: 42 }],
      },
      previousTypeElements,
      sdcpn: after,
    });

    expect(migrated).toEqual({
      "place-1": [
        {
          mass: 2, // real 1.7 → integer rounds
          count: 2,
          label: 0, // "abc" → integer falls back to default
          flag: false, // 0 → boolean
          id: formatUuid(toUuid(42)), // number → canonical UUIDv5 string
        },
      ],
    });
  });

  it("uses the nil UUID string for missing values coerced to uuid", () => {
    const before = makeSDCPN();
    const previousTypeElements = snapshotTypeElements(before);

    const after = makeSDCPN();
    after.types[0]!.elements[1] = {
      elementId: "element-2",
      name: "count",
      type: "uuid",
    };

    const migrated = migrateInitialMarkingForTypeChanges({
      initialMarking: { "place-1": [{ mass: 1.5 }] },
      previousTypeElements,
      sdcpn: after,
    });

    expect(migrated).toEqual({
      "place-1": [{ mass: 1.5, count: NIL_UUID_STRING }],
    });
  });

  it("drops keys of removed elements and stale keys", () => {
    const before = makeSDCPN();
    const previousTypeElements = snapshotTypeElements(before);

    const after = makeSDCPN();
    after.types[0]!.elements = [
      { elementId: "element-1", name: "mass", type: "real" },
    ];

    const migrated = migrateInitialMarkingForTypeChanges({
      initialMarking: {
        "place-1": [{ mass: 1.5, count: 2, stale: "junk" }],
      },
      previousTypeElements,
      sdcpn: after,
    });

    expect(migrated).toEqual({ "place-1": [{ mass: 1.5 }] });
  });

  it("skips uncoloured (number) markings and untouched places", () => {
    const before = makeSDCPN();
    const previousTypeElements = snapshotTypeElements(before);

    const after = makeSDCPN();
    after.types[0]!.elements[0]!.name = "mass_kg";

    const untouchedRecords = [{ level: 1 }];
    const migrated = migrateInitialMarkingForTypeChanges({
      initialMarking: {
        "place-1": [{ mass: 1.5, count: 2 }],
        "place-plain": 5,
        "place-sub": untouchedRecords,
      },
      previousTypeElements,
      sdcpn: after,
    });

    expect(migrated).not.toBeNull();
    expect(migrated!["place-plain"]).toBe(5);
    // Unchanged place keeps its identity (no render churn for readers).
    expect(migrated!["place-sub"]).toBe(untouchedRecords);
  });

  it("migrates subnet types and subnet places", () => {
    const before = makeSDCPN();
    const previousTypeElements = snapshotTypeElements(before);

    const after = makeSDCPN();
    after.subnets![0]!.types[0]!.elements[0]!.name = "water_level";

    const migrated = migrateInitialMarkingForTypeChanges({
      initialMarking: { "place-sub": [{ level: 0.3 }] },
      previousTypeElements,
      sdcpn: after,
    });

    expect(migrated).toEqual({ "place-sub": [{ water_level: 0.3 }] });
  });

  it("returns null when records already match the new schema", () => {
    const before = makeSDCPN();
    const previousTypeElements = snapshotTypeElements(before);

    const after = makeSDCPN();
    // Element removed, but no record ever stored a value for it.
    after.types[0]!.elements = [
      { elementId: "element-1", name: "mass", type: "real" },
    ];

    expect(
      migrateInitialMarkingForTypeChanges({
        initialMarking: { "place-1": [{ mass: 1.5 }] },
        previousTypeElements,
        sdcpn: after,
      }),
    ).toBeNull();
  });
});
