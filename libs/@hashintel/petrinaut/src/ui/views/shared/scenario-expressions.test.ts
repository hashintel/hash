import { expect, it } from "vitest";

import { scenarioExpressions } from "./scenario-expressions";

import type {
  AdHocSynthesisContext,
  Scenario,
} from "@hashintel/petrinaut-core";

const context: AdHocSynthesisContext = {
  places: [],
  types: [],
  netParameters: [
    {
      id: "rate",
      variableName: "rate",
      name: "Rate",
      type: "real",
      defaultValue: "1 / 2",
    },
  ],
};
const scenario: Scenario = {
  id: "scenario",
  name: "Baseline",
  scenarioParameters: [],
  parameterOverrides: {},
  initialState: {
    type: "per_place",
    content: { queue: "scenario.amount * 2" },
  },
};

it("keeps parameter defaults and overrides as source expressions", () => {
  const target = { kind: "netParameter", parameterId: "rate" } as const;
  expect(scenarioExpressions(scenario, context)(target)).toBe("1 / 2");
  expect(
    scenarioExpressions(
      { ...scenario, parameterOverrides: { rate: "scenario.rate" } },
      context,
    )(target),
  ).toBe("scenario.rate");
});

it("shows per-place expressions and the complete source for code scenarios", () => {
  const target = { kind: "count", placeId: "queue", row: null } as const;
  expect(scenarioExpressions(scenario, context)(target)).toBe(
    "scenario.amount * 2",
  );
  const code = "return { Queue: scenario.amount * 2 };";
  expect(
    scenarioExpressions(
      { ...scenario, initialState: { type: "code", content: code } },
      context,
    )(target),
  ).toBe(code);
});
