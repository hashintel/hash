import { describe, expect, it } from "vitest";

import {
  classicRunParameterValues,
  classicRunVariables,
  classicScenarioRunState,
  initialMarkingToAdHocPlaces,
} from "./materialize-run-state";

import type { Color, Place, Scenario } from "../../../../types/sdcpn";
import type { InitialMarking } from "../../../api";

const place = (id: string, name: string, colorId: string | null): Place => ({
  id,
  name,
  colorId,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
});

const SATELLITE: Color = {
  id: "colour-satellite",
  name: "Satellite",
  iconSlug: "circle",
  displayColor: "#3676b8",
  elements: [
    { elementId: "e1", name: "altitude", type: "real" },
    { elementId: "e2", name: "active", type: "boolean" },
    { elementId: "e3", name: "tag", type: "uuid" },
  ],
};

const CONTEXT = {
  places: [
    place("place-space", "Space", "colour-satellite"),
    place("place-debris", "Debris", null),
  ],
  types: [SATELLITE],
};

const SCENARIO: Scenario = {
  id: "scenario-moon",
  name: "Moon Orbit",
  scenarioParameters: [
    { type: "real", identifier: "launch_rate", default: 0.3 },
    { type: "integer", identifier: "initialAltitude", default: 20 },
    { type: "boolean", identifier: "night_mode", default: 0 },
    { type: "ratio", identifier: "mix", default: 0.5 },
  ],
  parameterOverrides: { "param-gravity": "9.81" },
  initialState: { type: "code", content: "return {};" },
};

describe("initialMarkingToAdHocPlaces", () => {
  const marking: InitialMarking = {
    "place-space": [
      { altitude: 400, active: true, tag: "0000-aa" },
      { altitude: 550.5, active: false, tag: "0000-bb" },
    ],
    "place-debris": 40,
  };

  it("converts tokens to literal fixed rows in colour-element order", () => {
    const { places, truncated } = initialMarkingToAdHocPlaces(marking, CONTEXT);
    expect(truncated).toEqual([]);
    const space = places["place-space"]!;
    expect(space.kind).toBe("coloured");
    if (space.kind !== "coloured") {
      return;
    }
    expect(space.rows).toHaveLength(2);
    expect(space.rows[0]!.kind).toBe("fixed");
    expect(space.rows[0]!.cells.map((cell) => cell.expression)).toEqual([
      "400",
      "true",
      '"0000-aa"',
    ]);
    expect(space.rows[1]!.cells[1]!.expression).toBe("false");
    expect(space.variables).toEqual([]);
  });

  it("converts counts to literal uncoloured states", () => {
    const { places } = initialMarkingToAdHocPlaces(marking, CONTEXT);
    const debris = places["place-debris"]!;
    expect(debris.kind).toBe("uncoloured");
    if (debris.kind === "uncoloured") {
      expect(debris.count.expression).toBe("40");
    }
  });

  it("caps rows per place and reports the cut", () => {
    const long: InitialMarking = {
      "place-space": Array.from({ length: 130 }, (_, index) => ({
        altitude: index,
        active: false,
        tag: "t",
      })),
    };
    const { places, truncated } = initialMarkingToAdHocPlaces(long, CONTEXT);
    const space = places["place-space"]!;
    expect(space.kind === "coloured" && space.rows.length).toBe(100);
    expect(truncated).toEqual([{ placeName: "Space", shown: 100, total: 130 }]);
  });

  it("keeps every token when the cap is lifted", () => {
    // The quick-simulation form seeds its editable draft from the marking,
    // where a cap would drop tokens the moment the user typed.
    const long = {
      "place-space": Array.from({ length: 130 }, (_unused, index) => ({
        altitude: index,
        active: false,
        tag: "t",
      })),
    };
    const { places, truncated } = initialMarkingToAdHocPlaces(
      long,
      CONTEXT,
      Number.POSITIVE_INFINITY,
    );
    const space = places["place-space"]!;
    expect(space.kind === "coloured" && space.rows.length).toBe(130);
    expect(truncated).toEqual([]);
  });

  it("skips places absent from the marking", () => {
    const { places } = initialMarkingToAdHocPlaces(
      { "place-debris": 0 },
      CONTEXT,
    );
    expect(places["place-space"]).toBeUndefined();
  });
});

describe("classicRunVariables", () => {
  it("names Variables by the identifier verbatim and seeds overrides", () => {
    const variables = classicRunVariables(SCENARIO, {
      initialAltitude: "35",
      night_mode: "1",
    });
    expect(variables.map((variable) => variable.name)).toEqual([
      "launch_rate",
      "initialAltitude",
      "night_mode",
      "mix",
    ]);
    expect(variables[0]).toMatchObject({
      type: "real",
      expression: "0.3",
      exposed: true,
    });
    expect(variables[1]!.expression).toBe("35");
    expect(variables[2]).toMatchObject({ type: "boolean", expression: "true" });
    expect(variables[3]).toMatchObject({ type: "real", expression: "0.5" });
  });
});

describe("classicScenarioRunState", () => {
  it("carries overrides and the materialized marking", () => {
    const { state } = classicScenarioRunState(
      SCENARIO,
      { "place-debris": 3 },
      CONTEXT,
      {},
    );
    expect(state.netParameters).toEqual([
      { parameterId: "param-gravity", expression: "9.81", optimize: null },
    ]);
    expect(state.places["place-debris"]).toBeDefined();
    expect(state.variables).toHaveLength(4);
  });
});

describe("classicRunParameterValues", () => {
  const stateWith = (expressions: Record<string, string>) => ({
    variables: classicRunVariables(SCENARIO, {}).map((variable) =>
      Object.prototype.hasOwnProperty.call(expressions, variable.name)
        ? { ...variable, expression: expressions[variable.name]! }
        : variable,
    ),
    netParameters: [],
    places: {},
  });

  it("pushes literal values under the classic identifiers", () => {
    const values = classicRunParameterValues(
      stateWith({ initialAltitude: "42", night_mode: "true" }),
      SCENARIO,
    );
    expect(values).toContainEqual({
      identifier: "initialAltitude",
      value: "42",
    });
    expect(values).toContainEqual({ identifier: "night_mode", value: "1" });
    expect(values).toContainEqual({ identifier: "launch_rate", value: "0.3" });
  });

  it("reads an emptied cell as its type's neutral", () => {
    // The cell shows `0` / `false` when empty, and the run has to agree:
    // ignoring the edit left the previous value in effect behind it.
    const values = classicRunParameterValues(
      stateWith({ initialAltitude: "", night_mode: "" }),
      SCENARIO,
    );
    expect(values).toContainEqual({
      identifier: "initialAltitude",
      value: "0",
    });
    expect(values).toContainEqual({ identifier: "night_mode", value: "0" });
  });

  it("skips non-literal expressions so the previous value stands", () => {
    const values = classicRunParameterValues(
      stateWith({ initialAltitude: "42 +", night_mode: "maybe" }),
      SCENARIO,
    );
    expect(
      values.find((value) => value.identifier === "initialAltitude"),
    ).toBeUndefined();
    expect(
      values.find((value) => value.identifier === "night_mode"),
    ).toBeUndefined();
  });
});
