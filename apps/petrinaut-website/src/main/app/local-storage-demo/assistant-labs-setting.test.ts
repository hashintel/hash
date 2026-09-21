import { describe, expect, it, vi } from "vitest";

import { assistantLabsSettings } from "./assistant-labs-setting";

const inputs = {
  brunchSelected: false,
  canSelectAssistant: true,
  isBrunchConfigured: true,
  selectAssistant: () => {},
};

describe("assistantLabsSettings", () => {
  it("offers the setting when Brunch is configured and the route allows a choice", () => {
    expect(
      assistantLabsSettings(inputs).map((setting) => setting.label),
    ).toEqual(["Brunch assistant"]);
  });

  it("offers nothing without a Brunch endpoint", () => {
    expect(
      assistantLabsSettings({ ...inputs, isBrunchConfigured: false }),
    ).toEqual([]);
  });

  it("offers nothing where the route fixes the assistant", () => {
    expect(
      assistantLabsSettings({ ...inputs, canSelectAssistant: false }),
    ).toEqual([]);
  });

  it("reports the selected assistant", () => {
    expect(
      assistantLabsSettings({ ...inputs, brunchSelected: true })[0]?.value,
    ).toBe(true);
  });

  it("selects Brunch when switched on and stock when switched off", () => {
    const selectAssistant = vi.fn();
    const [setting] = assistantLabsSettings({ ...inputs, selectAssistant });
    setting?.onChange(true);
    expect(selectAssistant).toHaveBeenLastCalledWith("brunch");
    setting?.onChange(false);
    expect(selectAssistant).toHaveBeenLastCalledWith("stock");
  });
});
