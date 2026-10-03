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

const AssistantProbe = ({ name }: { name: string }) => {
  const { aiAssistantId, setAiAssistantId } = use(UserSettingsContext);
  return (
    <button
      type="button"
      onClick={() =>
        setAiAssistantId(aiAssistantId === null ? "test.assistant" : null)
      }
    >
      {name}: {aiAssistantId ?? "none"}
    </button>
  );
};

/** Reads a persisted setting and writes another, so a write happens on demand. */
const WalkthroughProbe = () => {
  const { showWalkthroughOnInit, setAiAssistantId } = use(UserSettingsContext);
  return (
    <button type="button" onClick={() => setAiAssistantId("test.assistant")}>
      walkthrough: {showWalkthroughOnInit ? "on" : "off"}
    </button>
  );
};

const ArcConnectionsProbe = () => {
  const { enableAutomaticArcConnections, setEnableAutomaticArcConnections } =
    use(UserSettingsContext);
  return (
    <button
      type="button"
      onClick={() =>
        setEnableAutomaticArcConnections(!enableAutomaticArcConnections)
      }
    >
      Automatic arcs: {enableAutomaticArcConnections ? "on" : "off"}
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

  it("starts with no chosen assistant and records a choice", () => {
    render(
      <UserSettingsProvider>
        <AssistantProbe name="probe" />
      </UserSettingsProvider>,
    );

    const probe = screen.getByRole("button", { name: "probe: none" });
    fireEvent.click(probe);
    expect(screen.getByRole("button", { name: "probe: test.assistant" })).toBe(
      probe,
    );
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

        fireEvent.click(
          screen.getByRole("button", { name: "walkthrough: off" }),
        );

        const persisted = JSON.parse(entries.get(storageKey) ?? "{}") as Record<
          string,
          unknown
        >;
        for (const key of [
          "enableAdHocScenarios",
          "enableNotebookView",
          "webGpuEnabled",
          "enableParameterSweeps",
          "enableInBrowserOptimization",
          "computeBackend",
          "brunchDemoMode",
        ]) {
          expect(key in persisted).toBe(false);
        }
        expect(persisted.showWalkthroughOnInit).toBe(false);
        expect(persisted.aiAssistantId).toBe("test.assistant");
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );

  it("reuses an ancestor provider, so a host and the editor share one state", () => {
    // The host mounts the provider above the editor and reads the settings
    // in its own components; the editor's own provider must not fork them.
    render(
      <UserSettingsProvider>
        <AssistantProbe name="host" />
        <UserSettingsProvider>
          <AssistantProbe name="editor" />
        </UserSettingsProvider>
      </UserSettingsProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "editor: none" }));
    expect(
      screen.getByRole("button", { name: "host: test.assistant" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "editor: test.assistant" }),
    ).toBeTruthy();
  });
});
