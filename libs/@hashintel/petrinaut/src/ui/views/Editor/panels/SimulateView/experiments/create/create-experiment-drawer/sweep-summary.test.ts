import { describe, expect, it } from "vitest";

import { EMPTY_AD_HOC_STATE, type Scenario } from "@hashintel/petrinaut-core";

import { describeSweep } from "./sweep-summary";

const scenario: Scenario = {
  id: "scenario",
  name: "Scenario",
  scenarioParameters: [
    { identifier: "rate", type: "real", default: 0.3 },
    { identifier: "crew", type: "integer", default: 2 },
  ],
  parameterOverrides: {},
  initialState: { type: "per_place", content: {} },
};
const context = { netParameters: [], places: [], types: [] };

describe("describeSweep", () => {
  it("is null when no parameter has a range", () => {
    expect(
      describeSweep({
        scenario,
        paramInputs: { rate: { mode: "fixed", value: "0.5" } },
        adHocState: null,
        context,
      }),
    ).toBeNull();
    expect(
      describeSweep({
        scenario: undefined,
        paramInputs: {},
        adHocState: EMPTY_AD_HOC_STATE,
        context,
      }),
    ).toBeNull();
  });

  it("names the swept parameters in the scenario's order", () => {
    const rate = { mode: "range", min: 0, max: 1 } as const;
    expect(
      describeSweep({
        scenario,
        paramInputs: { rate },
        adHocState: null,
        context,
      }),
    ).toEqual({ text: "rate swept over its interval", error: false });
    expect(
      describeSweep({
        scenario,
        paramInputs: { crew: { mode: "range", min: 1, max: 4 }, rate },
        adHocState: null,
        context,
      }),
    ).toEqual({ text: "rate, crew swept over their intervals", error: false });
  });

  it("reports the first invalid interval", () => {
    expect(
      describeSweep({
        scenario,
        paramInputs: {
          rate: { mode: "range", min: 1, max: 1 },
          crew: { mode: "range", min: 4, max: 1 },
        },
        adHocState: null,
        context,
      }),
    ).toEqual({
      text: "rate: range max must be greater than min",
      error: true,
    });
  });
});
