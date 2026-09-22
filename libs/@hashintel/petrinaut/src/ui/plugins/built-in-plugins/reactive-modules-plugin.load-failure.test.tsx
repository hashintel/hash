/**
 * @vitest-environment jsdom
 */
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createCommandRegistry } from "@hashintel/petrinaut-core";

import { CommandRegistryProvider } from "../../../react/commands/command-registry";
import { ErrorTrackerContext } from "../../../react/error-tracker-context";
import {
  InstalledPlugins,
  InstalledPluginsProvider,
} from "../installed-plugins";
import { reactiveModulesPlugin } from "./reactive-modules-plugin";

// A file of its own, so the panel's import has not succeeded in an earlier
// test: Vitest runs a mock factory again after it rejects, and caches it once
// it resolves.
const panel = vi.hoisted(() => ({ imports: 0, failedImports: 1 }));

vi.mock("../../views/Editor/panels/reactive-modules-panel", async () => {
  panel.imports += 1;
  await new Promise((resolve) => {
    setTimeout(resolve, 5);
  });
  if (panel.failedImports > 0) {
    panel.failedImports -= 1;
    throw new Error("chunk failed");
  }
  return {
    ReactiveModulesPanel: () => (
      <aside role="dialog" aria-label="Zeroth Reactive Modules" />
    ),
  };
});

describe("reactiveModulesPlugin after a failed import", () => {
  it("reports the failure once, and imports again on the next show", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const registry = createCommandRegistry();
    const captureException = vi.fn();
    render(
      <ErrorTrackerContext value={{ captureException }}>
        <CommandRegistryProvider registry={registry}>
          <InstalledPluginsProvider plugins={[reactiveModulesPlugin]}>
            <InstalledPlugins />
          </InstalledPluginsProvider>
        </CommandRegistryProvider>
      </ErrorTrackerContext>,
    );
    const show = () =>
      act(async () => {
        registry.execute("petrinaut.reactive-modules.show");
      });

    await show();
    await vi.waitFor(() => expect(captureException).toHaveBeenCalledOnce());
    // A window that asked for the import on every render would import again
    // within these frames.
    await act(
      () =>
        new Promise((resolve) => {
          setTimeout(resolve, 50);
        }),
    );
    expect(panel.imports).toBe(1);
    expect(captureException).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();

    await show();
    expect(await screen.findByRole("dialog")).not.toBeNull();
    expect(panel.imports).toBe(2);
    consoleError.mockRestore();
  });
});
