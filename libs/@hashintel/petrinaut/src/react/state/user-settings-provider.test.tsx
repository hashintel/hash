import { cleanup, fireEvent, render, screen } from "@testing-library/react";
/**
 * @vitest-environment jsdom
 */
import { use } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { UserSettingsContext } from "./user-settings-context";
import { UserSettingsProvider } from "./user-settings-provider";

afterEach(cleanup);

// The provider persists every change, so a test's toggle would otherwise seed
// the next test's initial state. Guarded: some Node versions expose a global
// `localStorage` whose methods are missing.
beforeEach(() => {
  try {
    localStorage.removeItem("petrinaut:user-settings");
  } catch {
    // No storage to reset.
  }
});

const DemoModeProbe = ({ name }: { name: string }) => {
  const { brunchDemoMode, setBrunchDemoMode } = use(UserSettingsContext);
  return (
    <button type="button" onClick={() => setBrunchDemoMode(!brunchDemoMode)}>
      {name}: {brunchDemoMode ? "on" : "off"}
    </button>
  );
};

describe("UserSettingsProvider", () => {
  it("starts with Brunch demo mode off and toggles it", () => {
    render(
      <UserSettingsProvider>
        <DemoModeProbe name="probe" />
      </UserSettingsProvider>,
    );

    const probe = screen.getByRole("button", { name: "probe: off" });
    fireEvent.click(probe);
    expect(screen.getByRole("button", { name: "probe: on" })).toBe(probe);
  });

  it("reuses an ancestor provider, so a host and the editor share one state", () => {
    // The host mounts the provider above the editor and reads the settings
    // in its own components; the editor's own provider must not fork them.
    render(
      <UserSettingsProvider>
        <DemoModeProbe name="host" />
        <UserSettingsProvider>
          <DemoModeProbe name="editor" />
        </UserSettingsProvider>
      </UserSettingsProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "editor: off" }));
    expect(screen.getByRole("button", { name: "host: on" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "editor: on" })).toBeTruthy();
  });
});
