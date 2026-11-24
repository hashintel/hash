import { describe, expect, it } from "vitest";

import { lowerScenarioToHir } from "@hashintel/petrinaut-core/hir";

import { scenarioRunPreview } from "./scenario-run-preview";

import type {
  AdHocSynthesisContext,
  Scenario,
} from "@hashintel/petrinaut-core";

const scenario: Scenario = {
  id: "scenario",
  name: "Busy week",
  scenarioParameters: [{ type: "integer", identifier: "orders", default: 5 }],
  parameterOverrides: { rate: "scenario.orders * 2" },
  initialState: { type: "per_place", content: { depot: "scenario.orders" } },
};

const net: AdHocSynthesisContext = {
  netParameters: [
    {
      id: "rate",
      name: "Rate",
      variableName: "rate",
      type: "real",
      defaultValue: "1",
    },
  ],
  places: [
    {
      id: "depot",
      name: "Depot",
      colorId: null,
      dynamicsEnabled: false,
      x: 0,
      y: 0,
    },
  ],
  types: [],
};

const lowered = { hir: lowerScenarioToHir(scenario), error: null };

describe("scenarioRunPreview", () => {
  it("shows the parameters and places a run starts with, for the values of this run", () => {
    const preview = scenarioRunPreview(
      scenario,
      lowered,
      net,
      { orders: "7" },
      [],
    );

    expect(preview.previewReady).toBe(true);
    expect(preview.notice).toBeNull();
    expect(preview.state.netParameters).toEqual([
      { parameterId: "rate", expression: "14", optimize: null },
    ]);
    expect(Object.keys(preview.state.places)).toEqual(["depot"]);
  });

  it("takes a parameter's default where the value of this run is not a number", () => {
    const preview = scenarioRunPreview(
      scenario,
      lowered,
      net,
      { orders: "many" },
      [],
    );

    expect(preview.state.netParameters).toEqual([
      { parameterId: "rate", expression: "10", optimize: null },
    ]);
  });

  it("shows the scenario's own overrides and says so while it compiles", () => {
    const variables = [
      {
        id: "orders",
        name: "orders",
        type: "integer" as const,
        expression: "7",
        exposed: true,
        optimize: null,
      },
    ];

    expect(
      scenarioRunPreview(
        scenario,
        { hir: null, error: null },
        net,
        { orders: "7" },
        variables,
      ),
    ).toEqual({
      state: {
        variables,
        netParameters: [
          {
            parameterId: "rate",
            expression: "scenario.orders * 2",
            optimize: null,
          },
        ],
        places: {},
      },
      notice: "Compiling the initial state preview…",
      previewReady: false,
    });
  });

  it("says why the scenario could not be compiled", () => {
    const preview = scenarioRunPreview(
      scenario,
      { hir: null, error: "The language worker stopped" },
      net,
      {},
      [],
    );

    expect(preview.previewReady).toBe(false);
    expect(preview.notice).toBe(
      "The initial state preview could not be compiled: The language worker stopped",
    );
  });

  it("says why the initial state could not be computed", () => {
    const fractional: Scenario = {
      ...scenario,
      parameterOverrides: { count: "1.5" },
    };
    const preview = scenarioRunPreview(
      fractional,
      { hir: lowerScenarioToHir(fractional), error: null },
      {
        ...net,
        netParameters: [
          {
            id: "count",
            name: "Count",
            variableName: "count",
            type: "integer",
            defaultValue: "1",
          },
        ],
      },
      {},
      [],
    );

    expect(preview.previewReady).toBe(false);
    expect(preview.notice).toMatch(
      /^The initial state preview could not be computed: ./,
    );
  });
});
