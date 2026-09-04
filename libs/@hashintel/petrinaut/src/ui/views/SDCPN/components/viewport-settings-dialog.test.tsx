/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";

import { isWebGpuAvailable } from "@hashintel/petrinaut-core";

import { defaultUserSettings } from "../../../../react/state/user-settings-context";

/**
 * The dialog body itself is rendered through Ark UI's portal, which
 * testing-library cannot reach from this render tree, so these cover the two
 * things that actually decide behaviour: whether WebGPU is offered by default,
 * and the runtime gate the control's `disabled` state is derived from.
 */
describe("experimental simulation settings", () => {
  it("keep parameter sweeps, the optimization surface and in-browser optimization off by default", () => {
    expect(defaultUserSettings.enableParameterSweeps).toBe(false);
    expect(defaultUserSettings.enableOptimizationSurface).toBe(false);
    expect(defaultUserSettings.enableInBrowserOptimization).toBe(false);
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
