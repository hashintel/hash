import { describe, expect, it } from "vitest";

import { validateScenarioName } from "./validate-scenario-name";

describe("validateScenarioName", () => {
  it("requires a non-empty name", () => {
    expect(validateScenarioName("", new Set())).toBe(
      "Scenario name is required.",
    );
    expect(validateScenarioName("   ", new Set())).toBe(
      "Scenario name is required.",
    );
  });

  it("rejects a name another scenario already carries", () => {
    expect(
      validateScenarioName("Morning rush", new Set(["Morning rush"])),
    ).toBe(
      'A scenario named "Morning rush" already exists. Choose a unique name.',
    );
  });

  it("compares the trimmed name and accepts a unique one", () => {
    expect(
      validateScenarioName("  Morning rush ", new Set(["Morning rush"])),
    ).toBe(
      'A scenario named "Morning rush" already exists. Choose a unique name.',
    );
    expect(
      validateScenarioName("Evening lull", new Set(["Morning rush"])),
    ).toBe(undefined);
  });
});
