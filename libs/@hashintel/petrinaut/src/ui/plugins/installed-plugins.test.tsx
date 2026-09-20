/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCommandRegistry } from "@hashintel/petrinaut-core";

import { CommandRegistryProvider } from "../../react/commands/command-registry";
import { ErrorTrackerContext } from "../../react/error-tracker-context";
import {
  InstalledPlugins,
  InstalledPluginsProvider,
} from "./installed-plugins";
import { definePetrinautPlugin } from "./plugin";

afterEach(cleanup);

describe("InstalledPlugins", () => {
  it("registers declared commands while installed and mounts the component", () => {
    const registry = createCommandRegistry();
    const run = vi.fn();
    const plugin = definePetrinautPlugin({
      id: "test.commands",
      commands: [{ id: "test.commands.run", label: "Run", run }],
      component: () => <output>mounted</output>,
    });

    const view = render(
      <CommandRegistryProvider registry={registry}>
        <InstalledPluginsProvider plugins={[plugin]}>
          <InstalledPlugins />
        </InstalledPluginsProvider>
      </CommandRegistryProvider>,
    );

    expect(screen.getByText("mounted")).not.toBeNull();
    expect(registry.execute("test.commands.run")).toBe(true);
    expect(run).toHaveBeenCalledOnce();

    view.unmount();
    expect(registry.list()).toEqual([]);
  });

  it("keeps the other plugins running when one component throws", () => {
    const captureException = vi.fn();
    const Broken = () => {
      throw new Error("plugin failure");
    };
    const plugins = [
      definePetrinautPlugin({ id: "test.broken", component: Broken }),
      definePetrinautPlugin({
        id: "test.healthy",
        component: () => <output>healthy</output>,
      }),
    ];
    // React reports the caught error through console.error as well.
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    render(
      <ErrorTrackerContext value={{ captureException }}>
        <InstalledPluginsProvider plugins={plugins}>
          <InstalledPlugins />
        </InstalledPluginsProvider>
      </ErrorTrackerContext>,
    );

    expect(screen.getByText("healthy")).not.toBeNull();
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "plugin failure" }),
      { source: "plugin.component", tags: { pluginId: "test.broken" } },
    );
    consoleError.mockRestore();
  });
});
