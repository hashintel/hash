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

const ArcConnectionsProbe = ({
  name = "Automatic arcs",
}: {
  name?: string;
}) => {
  const { enableAutomaticArcConnections, setEnableAutomaticArcConnections } =
    use(UserSettingsContext);
  return (
    <button
      type="button"
      onClick={() =>
        setEnableAutomaticArcConnections(!enableAutomaticArcConnections)
      }
    >
      {name}: {enableAutomaticArcConnections ? "on" : "off"}
    </button>
  );
};

describe("UserSettingsProvider", () => {
  it("defaults automatic arcs off for saved preferences from before the experiment", () => {
    localStorage.setItem(
      "petrinaut:user-settings",
      JSON.stringify({ compactNodes: false }),
    );
    render(
      <UserSettingsProvider>
        <ArcConnectionsProbe />
      </UserSettingsProvider>,
    );
    expect(
      screen.getByRole("button", { name: "Automatic arcs: off" }),
    ).toBeTruthy();
  });

  it("persists automatic arcs independently of the saved arc style", () => {
    localStorage.setItem(
      "petrinaut:user-settings",
      JSON.stringify({ arcRendering: "smoothstep" }),
    );
    const first = render(
      <UserSettingsProvider>
        <ArcConnectionsProbe />
      </UserSettingsProvider>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Automatic arcs: off" }),
    );
    first.unmount();
    render(
      <UserSettingsProvider>
        <ArcConnectionsProbe />
      </UserSettingsProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Automatic arcs: on" }));
    expect(
      JSON.parse(localStorage.getItem("petrinaut:user-settings") ?? "{}"),
    ).toMatchObject({
      enableAutomaticArcConnections: false,
      arcRendering: "smoothstep",
    });
  });

  it.each([false, true])(
    "drops retired flags from saved settings (legacy value=%s)",
    (enabled) => {
      // An in-memory store: some Node versions expose a global `localStorage`
      // whose methods are missing, so the test owns the storage it inspects.
      const entries = new Map<string, string>([
        [
          storageKey,
          JSON.stringify({
            enableAdHocScenarios: true,
            enableNotebookView: enabled,
            brunchDemoMode: enabled,
            webGpuEnabled: enabled,
            enableParameterSweeps: enabled,
            enableInBrowserOptimization: enabled,
            computeBackend: "webgpu",
            showWalkthroughOnInit: enabled,
            showAnimations: false,
          }),
        ],
      ]);
      vi.stubGlobal("localStorage", {
        getItem: (key: string) => entries.get(key) ?? null,
        setItem: (key: string, value: string) => entries.set(key, value),
        removeItem: (key: string) => entries.delete(key),
      });

      try {
        render(<UserSettingsProvider />);

        const persisted = JSON.parse(entries.get(storageKey) ?? "{}") as Record<
          string,
          unknown
        >;
        for (const key of [
          "enableAdHocScenarios",
          "enableNotebookView",
          "brunchDemoMode",
          "webGpuEnabled",
          "enableParameterSweeps",
          "enableInBrowserOptimization",
          "computeBackend",
          "showWalkthroughOnInit",
        ]) {
          expect(key in persisted).toBe(false);
        }
        expect(persisted.showAnimations).toBe(false);
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );

  it("records a plugin switched off once and forgets it when switched on", () => {
    const PluginSwitch = () => {
      const { disabledPluginIds, setPluginEnabled } = use(UserSettingsContext);

      return (
        <>
          <button
            type="button"
            onClick={() => setPluginEnabled("test.plugin", false)}
          >
            off
          </button>
          <button
            type="button"
            onClick={() => setPluginEnabled("test.plugin", true)}
          >
            on
          </button>
          <output>{disabledPluginIds.join(",")}</output>
        </>
      );
    };
    render(
      <UserSettingsProvider>
        <PluginSwitch />
      </UserSettingsProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "off" }));
    fireEvent.click(screen.getByRole("button", { name: "off" }));
    expect(screen.getByRole("status").textContent).toBe("test.plugin");
    expect(JSON.parse(localStorage.getItem(storageKey) ?? "{}")).toMatchObject({
      disabledPluginIds: ["test.plugin"],
    });

    fireEvent.click(screen.getByRole("button", { name: "on" }));
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("reuses an ancestor provider, so a host and the editor share one state", () => {
    // The host mounts the provider above the editor and reads the settings
    // in its own components; the editor's own provider must not fork them.
    render(
      <UserSettingsProvider>
        <ArcConnectionsProbe name="host" />
        <UserSettingsProvider>
          <ArcConnectionsProbe name="editor" />
        </UserSettingsProvider>
      </UserSettingsProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "editor: off" }));
    expect(screen.getByRole("button", { name: "host: on" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "editor: on" })).toBeTruthy();
  });
});
