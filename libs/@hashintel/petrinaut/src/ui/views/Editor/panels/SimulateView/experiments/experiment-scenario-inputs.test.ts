import { describe, expect, it } from "vitest";

import { scenarioRunInputs } from "./experiment-scenario-inputs";

import type {
  AdHocScenarioState,
  AdHocSynthesisContext,
  Scenario,
} from "@hashintel/petrinaut-core";

const context: AdHocSynthesisContext = {
  netParameters: [],
  places: [],
  types: [],
};

const scenario: Scenario = {
  id: "scenario",
  name: "Scenario",
  scenarioParameters: [
    { type: "real", identifier: "load", default: 10 },
    { type: "integer", identifier: "seed_count", default: 3 },
    { type: "boolean", identifier: "burst", default: 1 },
  ],
  parameterOverrides: {},
  initialState: { type: "per_place", content: {} },
};

const runState = (
  overrides: Partial<
    Record<string, Partial<AdHocScenarioState["variables"][number]>>
  >,
): AdHocScenarioState => ({
  variables: [
    {
      name: "load",
      type: "real",
      expression: "10",
      exposed: true,
      optimize: null,
      ...overrides["load"],
    },
    {
      name: "seed_count",
      type: "integer",
      expression: "3",
      exposed: true,
      optimize: null,
      ...overrides["seed_count"],
    },
    {
      name: "burst",
      type: "boolean",
      expression: "true",
      exposed: true,
      optimize: null,
      ...overrides["burst"],
    },
  ],
  netParameters: [],
  places: {},
});

describe("scenarioRunInputs", () => {
  it("reports fixed values for every literal the form holds", () => {
    expect(scenarioRunInputs(runState({}), scenario, context)).toEqual([
      { identifier: "load", input: { mode: "fixed", value: "10" } },
      { identifier: "seed_count", input: { mode: "fixed", value: "3" } },
      { identifier: "burst", input: { mode: "fixed", value: "1" } },
    ]);
  });

  it("reports a swept Variable as a range from its resolved bounds", () => {
    const inputs = scenarioRunInputs(
      runState({
        load: { optimize: { min: "2 * 2", max: "20", scale: "linear" } },
      }),
      scenario,
      context,
    );
    expect(inputs).toEqual([
      { identifier: "load", input: { mode: "range", min: 4, max: 20 } },
      { identifier: "seed_count", input: { mode: "fixed", value: "3" } },
      { identifier: "burst", input: { mode: "fixed", value: "1" } },
    ]);
  });

  it("reports nothing for a swept Variable whose bound does not resolve", () => {
    const inputs = scenarioRunInputs(
      runState({
        load: {
          optimize: { min: "unknown_name", max: "20", scale: "linear" },
        },
      }),
      scenario,
      context,
    );
    expect(inputs.map((input) => input.identifier)).toEqual([
      "seed_count",
      "burst",
    ]);
  });
});
