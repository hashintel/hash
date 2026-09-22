/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCommandRegistry } from "@hashintel/petrinaut-core";

import { CommandRegistryProvider } from "../../../react/commands/command-registry";
import { ErrorTrackerContext } from "../../../react/error-tracker-context";
import {
  InstalledPlugins,
  InstalledPluginsProvider,
} from "../installed-plugins";
import { reactiveModulesPlugin } from "./reactive-modules-plugin";

const panel = vi.hoisted(() => ({ mounts: 0, fail: false }));

vi.mock("../../views/Editor/panels/reactive-modules-panel", async () => {
  const { useEffect } = await import("react");
  return {
    ReactiveModulesPanel: ({ onClose }: { onClose: () => void }) => {
      if (panel.fail) {
        throw new Error("panel failure");
      }
      useEffect(() => {
        panel.mounts += 1;
      }, []);
      return (
        <aside role="dialog" aria-label="Zeroth Reactive Modules">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </aside>
      );
    },
  };
});

const showCommandId = "petrinaut.reactive-modules.show";

const renderEditorPlugins = () => {
  const registry = createCommandRegistry();
  const captureException = vi.fn();
  const view = render(
    <ErrorTrackerContext value={{ captureException }}>
      <CommandRegistryProvider registry={registry}>
        <InstalledPluginsProvider plugins={[reactiveModulesPlugin]}>
          <InstalledPlugins />
        </InstalledPluginsProvider>
      </CommandRegistryProvider>
    </ErrorTrackerContext>,
  );
  // Awaited, so that a window which suspends on its first load is retried
  // inside the same act scope once the panel module resolves.
  const show = () =>
    act(async () => {
      registry.execute(showCommandId);
    });
  return { registry, captureException, show, ...view };
};

beforeEach(() => {
  panel.mounts = 0;
  panel.fail = false;
});

afterEach(cleanup);

describe("reactiveModulesPlugin", () => {
  it("lists the command while installed", () => {
    const { registry, unmount } = renderEditorPlugins();
    const command = registry.list().find((entry) => entry.id === showCommandId);
    expect(command).toMatchObject({
      label: "Show Zeroth Reactive Modules",
      category: "Editor",
    });
    expect(command?.keywords).toEqual([
      "zeroth",
      "reactive",
      "module",
      "export",
      "compile",
      "python",
      "ir",
    ]);
    unmount();
    expect(registry.list()).toEqual([]);
  });

  it("opens the window from the command and closes it from the window", async () => {
    const { show } = renderEditorPlugins();
    expect(screen.queryByRole("dialog")).toBeNull();

    await show();
    const dialog = await screen.findByRole("dialog", {
      name: "Zeroth Reactive Modules",
    });

    act(() => screen.getByRole("button", { name: "Close" }).click());
    expect(dialog.isConnected).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps an open window mounted when the command runs again", async () => {
    const { show } = renderEditorPlugins();
    await show();
    await screen.findByRole("dialog");
    await show();
    await screen.findByRole("dialog");
    expect(panel.mounts).toBe(1);
  });

  it("keeps the command after the window fails, and retries on the next run", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { registry, captureException, show } = renderEditorPlugins();
    panel.fail = true;
    await show();
    await vi.waitFor(() => expect(captureException).toHaveBeenCalled());
    expect(captureException.mock.calls[0]?.[1]).toEqual({
      source: "plugin.contribution",
      tags: {
        pluginId: "petrinaut.reactive-modules",
        contributionId: "petrinaut.reactive-modules.window",
        place: "component",
      },
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      registry.list().some((command) => command.id === showCommandId),
    ).toBe(true);

    panel.fail = false;
    await show();
    expect(await screen.findByRole("dialog")).not.toBeNull();
    consoleError.mockRestore();
  });
});
