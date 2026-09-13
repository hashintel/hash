import { cleanup, fireEvent, render, screen } from "@testing-library/react";
/**
 * @vitest-environment jsdom
 */
import { use } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UserSettingsContext } from "./user-settings-context";
import { UserSettingsProvider } from "./user-settings-provider";

afterEach(cleanup);

const storageKey = "petrinaut:user-settings";

// The provider persists every change, so a test's toggle would otherwise seed
// the next test's initial state. Guarded: some Node versions expose a global
// `localStorage` whose methods are missing.
beforeEach(() => {
  try {
    localStorage.removeItem(storageKey);
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

/** Reads a persisted setting and writes another, so a write happens on demand. */
const WalkthroughProbe = () => {
  const { showWalkthroughOnInit, brunchDemoMode, setBrunchDemoMode } =
    use(UserSettingsContext);
  return (
    <button type="button" onClick={() => setBrunchDemoMode(!brunchDemoMode)}>
      walkthrough: {showWalkthroughOnInit ? "on" : "off"}
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

  it("loads a blob written with the retired Ad-hoc scenarios key and drops the key on the next write", () => {
    // An in-memory store: some Node versions expose a global `localStorage`
    // whose methods are missing, so the test owns the storage it inspects.
    const entries = new Map<string, string>([
      [
        storageKey,
        JSON.stringify({
          enableAdHocScenarios: true,
          showWalkthroughOnInit: false,
        }),
      ],
    ]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
      removeItem: (key: string) => entries.delete(key),
    });

    try {
      render(
        <UserSettingsProvider>
          <WalkthroughProbe />
        </UserSettingsProvider>,
      );

      fireEvent.click(screen.getByRole("button", { name: "walkthrough: off" }));

      const persisted = JSON.parse(entries.get(storageKey) ?? "{}") as Record<
        string,
        unknown
      >;
      expect("enableAdHocScenarios" in persisted).toBe(false);
      expect(persisted.showWalkthroughOnInit).toBe(false);
      expect(persisted.brunchDemoMode).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
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
