import { describe, expect, test } from "vitest";

import {
  getEffectiveSelectedScenarioId,
  shouldNormalizeScenarioSelection,
} from "./provider";

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

/**
 * The provider rewrites a stale or absent scenario in the host's location. The
 * decision lives in its own function so this is testable without a rendered
 * provider: without these, deleting the normalization would fail nothing.
 */
describe("scenario selection normalization", () => {
  test("rewrites an absent request when a scenario is required", () => {
    expect(
      shouldNormalizeScenarioSelection({
        effectiveSelectedScenarioId: "first",
        requestedScenarioId: undefined,
        requireScenario: true,
      }),
    ).toBe(true);
  });

  test("rewrites an explicit no-scenario request when one is required", () => {
    expect(
      shouldNormalizeScenarioSelection({
        effectiveSelectedScenarioId: "first",
        requestedScenarioId: null,
        requireScenario: true,
      }),
    ).toBe(true);
  });

  test("keeps an explicit no-scenario choice when none is required", () => {
    expect(
      shouldNormalizeScenarioSelection({
        effectiveSelectedScenarioId: null,
        requestedScenarioId: null,
      }),
    ).toBe(false);
  });

  test("rewrites a stale request whether or not one is required", () => {
    expect(
      shouldNormalizeScenarioSelection({
        effectiveSelectedScenarioId: "first",
        requestedScenarioId: "gone",
      }),
    ).toBe(true);
    expect(
      shouldNormalizeScenarioSelection({
        effectiveSelectedScenarioId: "first",
        requestedScenarioId: "gone",
        requireScenario: true,
      }),
    ).toBe(true);
  });

  test("leaves a request that already names the scenario in effect", () => {
    expect(
      shouldNormalizeScenarioSelection({
        effectiveSelectedScenarioId: "first",
        requestedScenarioId: "first",
        requireScenario: true,
      }),
    ).toBe(false);
  });

  test("writes nothing when no scenario exists to normalize to", () => {
    expect(
      shouldNormalizeScenarioSelection({
        effectiveSelectedScenarioId: null,
        requestedScenarioId: undefined,
        requireScenario: true,
      }),
    ).toBe(false);
  });
});
