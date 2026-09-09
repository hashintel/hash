import { describe, expect, test } from "vitest";

import { createPetrinautActions, type SDCPN } from "@hashintel/petrinaut-core";
import {
  petrinautAiTools,
  type PetrinautAiToolInput,
} from "@hashintel/petrinaut-core/ai";

import { parseConstructionWhyInput } from "../src/root-node";
import {
  assertStateIdentity,
  locateRootState,
  observedStateInputSchema,
  observedStateMutationNames,
  parseObservedStateInput,
} from "../src/root-state";
import {
  deriveArcEffects,
  expectedNodeDefinition,
} from "../src/transition-record";
import {
  constructionRequest as request,
  emptyDefinition as empty,
  observedOutcome as outcome,
} from "./fixtures";

const type = {
  id: "test-type",
  name: "TestType",
  iconSlug: "circle",
  displayColor: "#0088ff",
  elements: [{ elementId: "test-value", name: "value", type: "string" }],
} satisfies SDCPN["types"][number];
const place = {
  id: "test-place",
  name: "TestPlace",
  colorId: type.id,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
} satisfies SDCPN["places"][number];
const scenario = {
  id: "test-scenario",
  name: "TestScenario",
  scenarioParameters: [],
  initialState: {
    type: "per_place",
    content: { [place.id]: [["2"], ["bad"]] },
  },
} satisfies PetrinautAiToolInput<"addScenario">;
const setup = () => {
  const definition = empty();
  const actions = createPetrinautActions(
    (mutate) => mutate(definition),
    undefined,
    { sanitizeAfterMutation: false },
  );
  actions.addType(type);
  actions.addPlace(place);
  actions.addScenario(petrinautAiTools.addScenario.inputSchema.parse(scenario));
  return definition;
};

describe("native typed state construction", () => {
  test.each(observedStateMutationNames)(
    "%s preserves the full canonical input export, including metadata",
    (name) => {
      const canonical = petrinautAiTools[name].inputSchema.toJSONSchema({
        io: "input",
      });
      const joined = observedStateInputSchema(name).toJSONSchema({
        io: "input",
      });
      const { brunch: _brunch, ...properties } = joined.properties!;
      expect({
        ...joined,
        properties,
        required: joined.required?.filter((key) => key !== "brunch"),
      }).toEqual(canonical);
    },
  );
  test("scenario input omission survives while the canonical execution inserts its own default", () => {
    const schema = observedStateInputSchema("addScenario");
    expect(schema.toJSONSchema({ io: "input" }).required).not.toContain(
      "parameterOverrides",
    );
    const raw = {
      ...scenario,
      brunch: {
        basis: { kind: "absent", reason: "TEST" },
        observationToolCallId: "test-read",
        requestedBaseHash: "a".repeat(64),
      },
    };
    expect(schema.parse(raw)).toHaveProperty("parameterOverrides", {});
    expect(parseObservedStateInput("addScenario", raw)).not.toHaveProperty(
      "parameterOverrides",
    );
    const before = empty();
    before.types.push(type);
    before.places.push(place);
    const req = request("addScenario", scenario);
    const after = expectedNodeDefinition(req, before);
    expect(after.scenarios?.[0]?.parameterOverrides).toEqual({});
    expect(outcome(req, before, after)).toBe("applied");
    const effects = deriveArcEffects(req, before, after);
    expect(effects.derived).toEqual([
      { kind: "created", path: "/scenarios/0/parameterOverrides", after: {} },
    ]);
    expect(effects.created).toContainEqual({
      kind: "created",
      path: "/scenarios/0/initialState",
      after: scenario.initialState,
    });
  });
  test("explicit empty overrides are authored, not an omitted-input default", () => {
    const before = empty();
    before.types.push(type);
    before.places.push(place);
    const req = request("addScenario", { ...scenario, parameterOverrides: {} });
    expect(
      deriveArcEffects(req, before, expectedNodeDefinition(req, before))
        .derived,
    ).toEqual([]);
  });
  test("canonical add-element migration is fully derived, never inherited operation basis", () => {
    const before = setup();
    const req = request("addTypeElement", {
      typeId: type.id,
      element: { elementId: "test-active", name: "active", type: "boolean" },
    });
    const after = expectedNodeDefinition(req, before);
    expect(after.scenarios?.[0]?.initialState).toEqual({
      type: "per_place",
      content: {
        [place.id]: [
          ["2", false],
          ["bad", false],
        ],
      },
    });
    const effects = deriveArcEffects(req, before, after);
    expect(effects.created.map((effect) => effect.path)).toEqual([
      "/types/0/elements/1/elementId",
      "/types/0/elements/1/name",
      "/types/0/elements/1/type",
    ]);
    expect(effects.derived.map((effect) => effect.path)).toEqual([
      "/scenarios/0/initialState/content/test-place/0/1",
      "/scenarios/0/initialState/content/test-place/1/1",
    ]);
    expect(outcome(req, before, after)).toBe("applied");
    const falsified = structuredClone(after);
    falsified.scenarios![0]!.name = "Unrecorded";
    expect(outcome(req, before, falsified)).toBe("unknown");
  });
  test("canonical change-type coerces and defaults invalid text, not operational inventory", () => {
    const before = setup();
    const req = request("updateTypeElement", {
      typeId: type.id,
      elementId: "test-value",
      update: { type: "integer" },
    });
    const after = expectedNodeDefinition(req, before);
    expect(after.scenarios?.[0]?.initialState).toEqual({
      type: "per_place",
      content: { [place.id]: [[2], [0]] },
    });
    expect(deriveArcEffects(req, before, after).updated).toEqual([
      {
        kind: "updated",
        path: "/types/0/elements/0/type",
        before: "string",
        after: "integer",
      },
    ]);
    expect(deriveArcEffects(req, before, after).derived).toHaveLength(2);
    expect(outcome(req, before, after)).toBe("applied");
    expect(outcome(req, before, before)).toBe("no-op");
  });
  test("explicit scenario correction only attributes actual changed cells", () => {
    const before = setup();
    const req = request("updateScenario", {
      scenarioId: scenario.id,
      update: {
        initialState: {
          type: "per_place",
          content: { [place.id]: [["2"], ["3"]] },
        },
      },
    });
    const after = expectedNodeDefinition(req, before);
    const effects = deriveArcEffects(req, before, after);
    expect(effects.updated).toEqual([
      {
        kind: "updated",
        path: "/scenarios/0/initialState/content/test-place/1/0",
        before: "bad",
        after: "3",
      },
    ]);
    expect(effects.derived).toEqual([]);
  });
  test("rejects duplicate and known-retired root identities before canonical addType courtesy", () => {
    const current = setup();
    expect(() =>
      assertStateIdentity(request("addType", type), current, []),
    ).toThrow(/Duplicate/);
    expect(() =>
      assertStateIdentity(request("addType", type), empty(), [current]),
    ).toThrow(/retired/);
    expect(() =>
      assertStateIdentity(
        request("addScenario", { ...scenario, id: place.id }),
        current,
        [],
      ),
    ).toThrow(/Duplicate/);
    const canonicalOnly = empty();
    const actions = createPetrinautActions((mutate) => mutate(canonicalOnly));
    actions.addType(type);
    actions.addType(type);
    expect(canonicalOnly.types).toHaveLength(2);
  });
  test("rejects duplicate, missing and known-retired parent-scoped element identities", () => {
    const current = setup();
    expect(() =>
      assertStateIdentity(
        request("addType", {
          ...type,
          id: "new",
          elements: [type.elements[0]!, type.elements[0]!],
        }),
        current,
        [],
      ),
    ).toThrow(/Duplicate nested/);
    expect(() =>
      assertStateIdentity(
        request("addTypeElement", {
          typeId: type.id,
          element: type.elements[0]!,
        }),
        current,
        [],
      ),
    ).toThrow(/Duplicate/);
    const removed = structuredClone(current);
    removed.types[0]!.elements = [];
    expect(() =>
      assertStateIdentity(
        request("addTypeElement", {
          typeId: type.id,
          element: type.elements[0]!,
        }),
        removed,
        [current],
      ),
    ).toThrow(/retired/);
    expect(() =>
      assertStateIdentity(
        request("updateTypeElement", {
          typeId: type.id,
          elementId: "missing",
          update: { name: "newName" },
        }),
        current,
        [],
      ),
    ).toThrow(/Unknown/);
    current.types[0]!.elements.push(type.elements[0]!);
    expect(() =>
      assertStateIdentity(
        request("updateTypeElement", {
          typeId: type.id,
          elementId: "test-value",
          update: { name: "newName" },
        }),
        current,
        [],
      ),
    ).toThrow(/Ambiguous/);
  });
  test("refuses missing initial-state and override references rather than silently ignoring them", () => {
    const current = setup();
    expect(() =>
      assertStateIdentity(
        request("updateScenario", {
          scenarioId: scenario.id,
          update: {
            initialState: { type: "per_place", content: { missing: [] } },
          },
        }),
        current,
        [],
      ),
    ).toThrow(/existing place/);
    expect(() =>
      assertStateIdentity(
        request("updateScenario", {
          scenarioId: scenario.id,
          update: { parameterOverrides: { missing: "1" } },
        }),
        current,
        [],
      ),
    ).toThrow(/existing parameter/);
  });
  test("keeps code scenario footprints unavailable without replacing their canonical schema", () => {
    const current = setup();
    const input = {
      scenarioId: scenario.id,
      update: {
        initialState: { type: "code" as const, content: "return {};" },
      },
    };
    expect(
      petrinautAiTools.updateScenario.inputSchema.safeParse(input).success,
    ).toBe(true);
    expect(() =>
      assertStateIdentity(request("updateScenario", input), current, []),
    ).toThrow(/code and ad-hoc/);
    expect(() =>
      locateRootState(current, {
        kind: "type",
        name: type.name,
        field: "/elements/length",
      }),
    ).toThrow(/absent/);
  });
  test("name/field lookup follows stable identity across each exact permutation snapshot", () => {
    const current = setup();
    current.types.unshift({
      ...type,
      id: "other",
      name: "OtherType",
      elements: [],
    });
    expect(
      locateRootState(current, {
        kind: "type-element",
        type: type.id,
        name: "value",
        field: "type",
      }).path,
    ).toBe("/types/1/elements/0/type");
    current.types.reverse();
    expect(
      locateRootState(current, {
        kind: "type-element",
        type: type.id,
        name: "value",
        field: "type",
      }).path,
    ).toBe("/types/0/elements/0/type");
    expect(() =>
      locateRootState(current, {
        kind: "type-element",
        name: "value",
        field: "type",
      }),
    ).toThrow(/parent/);
    expect(() =>
      locateRootState(current, {
        kind: "scenario",
        name: scenario.name,
        field: "/initialState/content/missing",
      }),
    ).toThrow(/absent/);
    expect(
      parseConstructionWhyInput({
        kind: "type-element",
        type: type.name,
        name: "value",
        field: "type",
      }),
    ).toMatchObject({ kind: "type-element" });
    expect(() =>
      parseConstructionWhyInput({
        kind: "scenario",
        name: scenario.name,
        transition: "mixed",
      }),
    ).toThrow(/exact root arc query/);
  });
});
