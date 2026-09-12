/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { isWebGpuAvailable } from "@hashintel/petrinaut-core";

import { defaultUserSettings } from "../../../../react/state/user-settings-context";
import { ViewportSettingsDialog } from "./viewport-settings-dialog";

afterEach(cleanup);

describe("experimental simulation settings", () => {
  it("keep parameter sweeps and in-browser optimization off by default", () => {
    expect(defaultUserSettings.enableParameterSweeps).toBe(false);
    expect(defaultUserSettings.enableInBrowserOptimization).toBe(false);
  });

  it("offer no Ad-hoc scenarios row: the scenario form is the only scenario form", async () => {
    // The dialog body portals to document.body, which `screen` covers.
    render(<ViewportSettingsDialog open onOpenChange={() => {}} />);

    await screen.findByText(/Parameter sweeps/);
    expect(screen.queryByText(/Ad-hoc scenarios/)).toBeNull();
    expect(
      screen.queryByText(/Define initial state and parameters inline/),
    ).toBeNull();
  });
});

describe("WebGPU setting", () => {
  it("is off by default", () => {
    // The GPU path is a restricted subset engine with a different random
    // generator, so it must never be offered — let alone used — without the user
    // turning it on.
    expect(defaultUserSettings.webGpuEnabled).toBe(false);
  });

  it("detects WebGPU support from the host, not a build flag", () => {
    // The runtime gate the control's `disabled` state is derived from.
    vi.stubGlobal("navigator", { gpu: {} });
    try {
      expect(isWebGpuAvailable()).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }

    vi.stubGlobal("navigator", {});
    try {
      expect(isWebGpuAvailable()).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
