import { describe, expect, test } from "vitest";

import { getEffectiveSelectedScenarioId } from "./provider";

import type { Scenario } from "@hashintel/petrinaut-core";

const scenarios = [{ id: "first" }, { id: "second" }] as Scenario[];

describe("effective simulation scenario", () => {
  test("preserves the full editor's explicit no-scenario selection", () => {
    expect(getEffectiveSelectedScenarioId(scenarios, null)).toBeNull();
  });

  test("defaults missing and stale selections to the first scenario", () => {
    expect(getEffectiveSelectedScenarioId(scenarios, undefined)).toBe("first");
    expect(getEffectiveSelectedScenarioId(scenarios, "stale")).toBe("first");
  });

  test("defaults an explicit no-scenario selection when one is required", () => {
    expect(getEffectiveSelectedScenarioId(scenarios, null, true)).toBe("first");
  });
});
