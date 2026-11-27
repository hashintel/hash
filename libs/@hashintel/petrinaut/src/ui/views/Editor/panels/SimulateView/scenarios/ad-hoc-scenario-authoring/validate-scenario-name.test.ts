import { describe, expect, it } from "vitest";

import { validateScenarioName } from "./validate-scenario-name";

const required = "Scenario name is required.";
const taken =
  'A scenario named "Morning rush" already exists. Choose a unique name.';

describe("validateScenarioName", () => {
  it.each([
    ["", required],
    ["   ", required],
    ["Morning rush", taken],
    ["  Morning rush ", taken],
    ["Evening lull", undefined],
  ])("requires a name, trimmed and unique: %j", (name, expected) => {
    expect(validateScenarioName(name, new Set(["Morning rush"]))).toBe(
      expected,
    );
  });
});
