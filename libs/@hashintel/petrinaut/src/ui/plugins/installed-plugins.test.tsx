/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { lazy } from "react";
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
      {
        source: "plugin.contribution",
        tags: {
          pluginId: "test.broken",
          contributionId: "component",
          place: "component",
        },
      },
    );
    consoleError.mockRestore();
  });

  it("keeps a plugin's declared commands when its component throws", () => {
    const registry = createCommandRegistry();
    const run = vi.fn();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const plugin = definePetrinautPlugin({
      id: "test.half-broken",
      commands: [{ id: "test.half-broken.run", label: "Run", run }],
      component: () => {
        throw new Error("component failure");
      },
    });

    render(
      <CommandRegistryProvider registry={registry}>
        <InstalledPluginsProvider plugins={[plugin]}>
          <InstalledPlugins />
        </InstalledPluginsProvider>
      </CommandRegistryProvider>,
    );

    expect(registry.execute("test.half-broken.run")).toBe(true);
    expect(run).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });

  it("lets a lazy component load without blanking the other plugins", async () => {
    let resolveModule: (module: {
      default: () => React.ReactNode;
    }) => void = () => {};
    const Lazy = lazy(
      () =>
        new Promise<{ default: () => React.ReactNode }>((resolve) => {
          resolveModule = resolve;
        }),
    );
    const plugins = [
      definePetrinautPlugin({ id: "test.lazy", component: Lazy }),
      definePetrinautPlugin({
        id: "test.eager",
        component: () => <output>eager</output>,
      }),
    ];

    render(
      <InstalledPluginsProvider plugins={plugins}>
        <InstalledPlugins />
      </InstalledPluginsProvider>,
    );

    expect(screen.getByText("eager")).not.toBeNull();
    expect(screen.queryByText("lazy")).toBeNull();

    await act(async () => {
      resolveModule({ default: () => <output>lazy</output> });
    });
    expect(screen.getByText("lazy")).not.toBeNull();
  });

  it("does not re-register commands when a plugin is rebuilt with equal ones", () => {
    const registry = createCommandRegistry();
    const listener = vi.fn();
    registry.subscribe(listener);
    const build = () =>
      definePetrinautPlugin({
        id: "test.rebuilt",
        commands: [{ id: "test.rebuilt.run", label: "Run", run: () => {} }],
      });

    const view = render(
      <CommandRegistryProvider registry={registry}>
        <InstalledPluginsProvider plugins={[build()]}>
          <InstalledPlugins />
        </InstalledPluginsProvider>
      </CommandRegistryProvider>,
    );
    expect(listener).toHaveBeenCalledOnce();

    view.rerender(
      <CommandRegistryProvider registry={registry}>
        <InstalledPluginsProvider plugins={[build()]}>
          <InstalledPlugins />
        </InstalledPluginsProvider>
      </CommandRegistryProvider>,
    );
    expect(listener).toHaveBeenCalledOnce();
    expect(registry.list().map((command) => command.id)).toEqual([
      "test.rebuilt.run",
    ]);
  });
});
