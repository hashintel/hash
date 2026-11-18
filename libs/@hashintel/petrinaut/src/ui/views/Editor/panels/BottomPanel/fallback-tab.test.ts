import { describe, expect, it } from "vitest";

import { fallbackBottomPanelTab } from "./fallback-tab";

describe("fallbackBottomPanelTab", () => {
  it("keeps a tab that is still available", () => {
    expect(
      fallbackBottomPanelTab("simulation-settings", [
        "diagnostics",
        "simulation-settings",
      ]),
    ).toBeNull();
  });

  it("returns to Simulation Settings when the simulation's timeline goes", () => {
    expect(
      fallbackBottomPanelTab("simulation-timeline", [
        "diagnostics",
        "simulation-settings",
      ]),
    ).toBe("simulation-settings");
  });

  it("takes the first tab left when the settings are not there either", () => {
    // Switching to Actual mode from a simulation's timeline.
    expect(
      fallbackBottomPanelTab("simulation-timeline", [
        "actual-timeline",
        "actual-events",
      ]),
    ).toBe("actual-timeline");
  });

  it("takes the first tab left for any other tab that goes", () => {
    expect(
      fallbackBottomPanelTab("compilation", [
        "diagnostics",
        "simulation-settings",
      ]),
    ).toBe("diagnostics");
    expect(fallbackBottomPanelTab("compilation", [])).toBeNull();
  });
});
