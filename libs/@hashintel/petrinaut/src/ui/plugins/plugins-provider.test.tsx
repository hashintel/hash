/** @vitest-environment jsdom */
import { act, cleanup, screen } from "@testing-library/react";
import { type ReactNode, use, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createCommandRegistry,
  createPetrinaut,
} from "@hashintel/petrinaut-core";

import { CommandRegistryProvider } from "../../react/commands/command-registry";
import {
  type ErrorTracker,
  ErrorTrackerContext,
} from "../../react/error-tracker-context";
import { UserSettingsContext } from "../../react/state/user-settings-context";
import {
  definePetrinautPlugin,
  type PluginApi,
  pluginService,
  type PluginHook,
} from "./define-petrinaut-plugin";
import { PluginRoots, PluginToolbarItems } from "./plugin-outlets";
import {
  usePluginService,
  usePluginStatuses,
  useRunningPlugins,
} from "./plugins-provider";
import { renderPlugins } from "./plugins-test-harness";

let mounts = 0;
const nextMount = () => {
  mounts += 1;

  return mounts;
};

const TopBarEnd = () => <PluginToolbarItems place="top-bar-end" />;

const trackedBy =
  (captureException: ErrorTracker["captureException"]) =>
  ({ children }: { children: ReactNode }) => (
    <ErrorTrackerContext value={{ captureException }}>
      {children}
    </ErrorTrackerContext>
  );

beforeEach(() => {
  localStorage.clear();
});

afterEach(cleanup);

const createCounterPlugin = definePetrinautPlugin({
  id: "test.counter",
  name: "Counter",
  topBarItems: { count: { place: "top-bar-end" } },
});

const seenApis: unknown[] = [];

/**
 * What the palette plugin's commands did, in order. Module scope: the React
 * Compiler hoists a handler that captures nothing local, so a test-scoped
 * array would be out of its reach.
 */
const commandRuns: string[] = [];

const useCounterPlugin: PluginHook<typeof createCounterPlugin> = (api) => {
  const [count, setCount] = useState(0);
  useLayoutEffect(() => {
    seenApis.push(api);
  });

  return {
    topBarItems: {
      count: (
        <button type="button" onClick={() => setCount(count + 1)}>
          count {count}
        </button>
      ),
    },
  };
};

const createRemountPlugin = definePetrinautPlugin({
  id: "test.remount",
  name: "Remount",
  topBarItems: { mount: { place: "top-bar-end" } },
});

const useRemountPlugin: PluginHook<typeof createRemountPlugin> = () => {
  const [mount] = useState(nextMount);

  return { topBarItems: { mount: <span>{`mount ${mount}`}</span> } };
};

const labelPlugin = definePetrinautPlugin({
  id: "test.label",
  name: "Label",
  topBarItems: { label: { place: "top-bar-end" } },
})({ topBarItems: { label: <span>label</span> } });

describe("PetrinautPluginsProvider", () => {
  it("renders the object form and the hook form, whose api keeps its identity across a host re-render", () => {
    renderPlugins(
      [createCounterPlugin(useCounterPlugin), labelPlugin],
      <TopBarEnd />,
    );

    expect(screen.getByText("label")).toBeTruthy();
    const apiBefore = seenApis.at(-1);
    const rendersBefore = seenApis.length;
    act(() => screen.getByRole("button", { name: "count 0" }).click());

    expect(screen.getByRole("button", { name: "count 1" })).toBeTruthy();
    expect(seenApis.length).toBeGreaterThan(rendersBefore);
    expect(seenApis.at(-1)).toBe(apiBefore);
  });

  it("applies two settings.set calls of one tick, with a new api over the same families", () => {
    const createSettingsPlugin = definePetrinautPlugin({
      id: "test.settings",
      name: "Settings",
      access: { document: "read" },
      settings: {
        a: { type: "boolean", default: true, label: "A" },
        b: { type: "boolean", default: false, label: "B" },
      },
      topBarItems: { values: { place: "top-bar-end" } },
    });
    const apis: PluginApi<typeof createSettingsPlugin>[] = [];
    const useSettingsPlugin: PluginHook<typeof createSettingsPlugin> = (
      api,
    ) => {
      useLayoutEffect(() => {
        apis.push(api);
      });

      return {
        topBarItems: {
          values: (
            <button
              type="button"
              onClick={() => {
                api.settings.set("a", false);
                api.settings.set("b", true);
              }}
            >
              {`a ${api.settings.get("a")} b ${api.settings.get("b")}`}
            </button>
          ),
        },
      };
    };

    renderPlugins([createSettingsPlugin(useSettingsPlugin)], <TopBarEnd />);
    const before = apis.at(-1);
    act(() => screen.getByRole("button", { name: "a true b false" }).click());

    expect(screen.getByRole("button", { name: "a false b true" })).toBeTruthy();
    expect(
      JSON.parse(localStorage.getItem("petrinaut:plugin:test.settings") ?? ""),
    ).toEqual({ a: false, b: true });
    const after = apis.at(-1);
    expect(after).not.toBe(before);
    expect(after?.document).toBe(before?.document);
    expect(after?.errors).toBe(before?.errors);
    expect(after?.notifications).toBe(before?.notifications);
  });

  it("tags api.errors.capture with the plugin's id, which the plugin cannot replace", () => {
    const captureException = vi.fn();
    const error = new Error("plugin error");
    const createCapturePlugin = definePetrinautPlugin({
      id: "test.x",
      name: "Capture",
    });
    const useCapturePlugin: PluginHook<typeof createCapturePlugin> = (api) => {
      useLayoutEffect(() => {
        api.errors.capture(error);
        api.errors.capture(error, { source: "x", tags: { pluginId: "spoof" } });
      }, [api]);

      return {};
    };

    renderPlugins([createCapturePlugin(useCapturePlugin)], null, {
      wrapper: trackedBy(captureException),
    });

    expect(captureException).toHaveBeenCalledWith(error, {
      source: "plugin.test.x",
      tags: { pluginId: "test.x" },
    });
    expect(captureException).toHaveBeenCalledWith(error, {
      source: "x",
      tags: { pluginId: "test.x" },
    });
  });

  it("gives a hook only the families and levels its manifest declares", () => {
    const members: Record<string, readonly string[]> = {};
    const record = (id: string, api: object) => {
      members[id] = Object.entries(api).flatMap(([key, value]) =>
        key === "errors" || key === "notifications"
          ? []
          : [`${key}:${"edit" in value || "run" in value ? "write" : "read"}`],
      );
    };
    const createNone = definePetrinautPlugin({ id: "test.none", name: "None" });
    const useNone: PluginHook<typeof createNone> = (api) => {
      useLayoutEffect(() => record("none", api));

      return {};
    };
    const createReader = definePetrinautPlugin({
      id: "test.reader",
      name: "Reader",
      access: { document: "read" },
    });
    const useReader: PluginHook<typeof createReader> = (api) => {
      useLayoutEffect(() => record("reader", api));

      return {};
    };
    const createWriter = definePetrinautPlugin({
      id: "test.writer",
      name: "Writer",
      access: { document: "write", experiments: "read" },
    });
    const useWriter: PluginHook<typeof createWriter> = (api) => {
      useLayoutEffect(() => record("writer", api));

      return {};
    };

    renderPlugins(
      [createNone(useNone), createReader(useReader), createWriter(useWriter)],
      null,
    );

    expect(members).toEqual({
      none: [],
      reader: ["document:read"],
      writer: ["document:write", "experiments:read"],
    });
  });

  it("mounts the view once the hosts committed, before the portals it opens", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const View = () => {
      const [firstSeen] = useState(useRunningPlugins().length);

      return (
        <>
          <p>{`view saw ${firstSeen}`}</p>
          {createPortal(<p>dialog</p>, container)}
        </>
      );
    };

    renderPlugins([labelPlugin], <View />, { container });

    expect(
      [...container.querySelectorAll("p")].map((node) => node.textContent),
    ).toEqual(["view saw 1", "dialog"]);
  });

  it("remounts a re-created plugin and keeps the host of the same plugin object", () => {
    const plugin = createRemountPlugin(useRemountPlugin);
    const { rerender } = renderPlugins([plugin], <TopBarEnd />);
    const first = screen.getByText(/^mount/).textContent;

    rerender([plugin]);
    expect(screen.getByText(/^mount/).textContent).toBe(first);

    rerender([createRemountPlugin(useRemountPlugin)]);
    expect(screen.getByText(/^mount/).textContent).not.toBe(first);
  });

  it("remounts the hosts, not the view, for a new core instance, as a readonly toggle makes", () => {
    const View = () => {
      const [mount] = useState(nextMount);

      return (
        <>
          <p>{`view ${mount}`}</p>
          <TopBarEnd />
        </>
      );
    };
    const plugins = [createRemountPlugin(useRemountPlugin)];
    const { instance, rerender } = renderPlugins(plugins, <View />);
    const view = screen.getByText(/^view/).textContent;
    const host = screen.getByText(/^mount/).textContent;

    rerender(
      plugins,
      <View />,
      createPetrinaut({ document: instance.handle, readonly: true }),
    );
    expect(screen.getByText(/^view/).textContent).toBe(view);
    expect(screen.getByText(/^mount/).textContent).not.toBe(host);
  });

  it("re-renders the view when contributions change, not when a host re-renders with the same ones", () => {
    const steady = { rerun: () => {}, flip: () => {} };
    const createSteadyPlugin = definePetrinautPlugin({
      id: "test.steady",
      name: "Steady",
      settings: { beta: { type: "boolean", default: false, label: "Beta" } },
    });
    const useSteadyPlugin: PluginHook<typeof createSteadyPlugin> = (api) => {
      const [, setTick] = useState(0);
      useLayoutEffect(() => {
        steady.rerun = () => setTick((tick) => tick + 1);
        steady.flip = () => api.settings.set("beta", !api.settings.get("beta"));
      });

      return { root: <span>steady</span> };
    };
    const viewRendered = vi.fn();
    const View = () => {
      viewRendered();
      useRunningPlugins();

      return null;
    };

    renderPlugins([createSteadyPlugin(useSteadyPlugin)], <View />);
    const rendersAfterMount = viewRendered.mock.calls.length;

    act(() => steady.rerun());
    expect(viewRendered).toHaveBeenCalledTimes(rendersAfterMount);

    act(() => steady.flip());
    expect(viewRendered).toHaveBeenCalledTimes(rendersAfterMount + 1);
  });

  it("keeps the view and the other plugins running when a hook throws, and reports it", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const captureException = vi.fn();
    const createBrokenPlugin = definePetrinautPlugin({
      id: "test.broken",
      name: "Broken",
    });
    const useBrokenPlugin: PluginHook<typeof createBrokenPlugin> = () => {
      throw new Error("plugin failed");
    };
    const Statuses = () =>
      usePluginStatuses().map(({ plugin, status }) => (
        <p key={plugin.manifest.id}>{`${plugin.manifest.id} ${status}`}</p>
      ));

    renderPlugins(
      [createBrokenPlugin(useBrokenPlugin), labelPlugin],
      <>
        <Statuses />
        <TopBarEnd />
      </>,
      { wrapper: trackedBy(captureException) },
    );

    expect(screen.getByText("test.broken failed")).toBeTruthy();
    expect(screen.getByText("test.label on")).toBeTruthy();
    expect(screen.getByText("label")).toBeTruthy();
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "plugin failed" }),
      { source: "plugin", tags: { pluginId: "test.broken", place: "hook" } },
    );
    consoleError.mockRestore();
  });

  it("keeps a plugin's other contributions rendering when one throws, and reports where", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const captureException = vi.fn();
    const Throws = () => {
      throw new Error("contribution failed");
    };
    const rootPlugin = definePetrinautPlugin({
      id: "test.root",
      name: "Root",
      topBarItems: { ok: { place: "top-bar-end" } },
    })({ root: <Throws />, topBarItems: { ok: <span>still here</span> } });
    const itemPlugin = definePetrinautPlugin({
      id: "test.item",
      name: "Item",
      topBarItems: { broken: { place: "top-bar-end" } },
    })({ topBarItems: { broken: <Throws /> } });

    renderPlugins(
      [rootPlugin, itemPlugin],
      <>
        <PluginRoots />
        <TopBarEnd />
      </>,
      { wrapper: trackedBy(captureException) },
    );

    expect(screen.getByText("still here")).toBeTruthy();
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
      source: "plugin",
      tags: { pluginId: "test.root", place: "root" },
    });
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
      source: "plugin",
      tags: {
        pluginId: "test.item",
        place: "top-bar-end",
        contributionId: "broken",
      },
    });
    consoleError.mockRestore();
  });

  it("reads another plugin's service while it runs, and keeps the view mounted when it is switched off", () => {
    const createSourcePlugin = definePetrinautPlugin({
      id: "test.source",
      name: "Source",
      provides: pluginService<{ value: string }>(),
    });
    const sourcePlugin = createSourcePlugin({ provides: { value: "ready" } });
    const View = () => {
      const service = usePluginService(createSourcePlugin);
      const { setPluginEnabled } = use(UserSettingsContext);
      const [mount] = useState(nextMount);

      return (
        <button
          type="button"
          onClick={() => setPluginEnabled("test.source", service === undefined)}
        >
          {`view ${mount} sees ${service?.value ?? "nothing"}`}
        </button>
      );
    };

    renderPlugins([sourcePlugin], <View />);
    const button = screen.getByRole("button");
    const mount = /view (\d+)/.exec(button.textContent)?.[1];
    expect(button.textContent).toBe(`view ${mount} sees ready`);

    act(() => button.click());
    expect(button.textContent).toBe(`view ${mount} sees nothing`);

    act(() => button.click());
    expect(button.textContent).toBe(`view ${mount} sees ready`);
  });

  it("registers declared commands under prefixed ids while `when` holds, runs the latest handler, and withdraws them with the plugin", () => {
    const registry = createCommandRegistry();
    const createPalettePlugin = definePetrinautPlugin({
      id: "test.palette",
      name: "Palette",
      commands: {
        toggle: { label: "Toggle the palette", shortcut: "mod+k" },
        clear: { label: "Clear the history", category: "History" },
      },
      buttons: { toggle: { label: "Palette", place: "top-bar-end" } },
    });
    const usePalettePlugin: PluginHook<typeof createPalettePlugin> = () => {
      const [toggles, setToggles] = useState(0);

      return {
        commands: {
          toggle: {
            run: () => {
              commandRuns.push(`toggle ${toggles}`);
              setToggles(toggles + 1);
            },
          },
          clear: {
            run: () => commandRuns.push("clear"),
            when: toggles > 0,
          },
        },
        buttons: { toggle: { icon: null, command: "toggle" } },
      };
    };
    const Around = ({ children }: { children: ReactNode }) => (
      <CommandRegistryProvider registry={registry}>
        {children}
      </CommandRegistryProvider>
    );
    const View = () => {
      const { setPluginEnabled } = use(UserSettingsContext);

      return (
        <>
          <TopBarEnd />
          <button
            type="button"
            onClick={() => setPluginEnabled("test.palette", false)}
          >
            switch off
          </button>
        </>
      );
    };
    const registered = () =>
      registry
        .list()
        .map(({ id, label, category, shortcut }) => [
          id,
          label,
          category,
          shortcut,
        ]);

    renderPlugins([createPalettePlugin(usePalettePlugin)], <View />, {
      Around,
    });
    expect(registered()).toEqual([
      ["test.palette.toggle", "Toggle the palette", "Palette", "mod+k"],
    ]);

    act(() => screen.getByRole("button", { name: "Palette" }).click());
    expect(commandRuns).toEqual(["toggle 0"]);
    expect(registered()).toEqual([
      ["test.palette.toggle", "Toggle the palette", "Palette", "mod+k"],
      ["test.palette.clear", "Clear the history", "History", undefined],
    ]);

    act(() => {
      registry.execute("test.palette.toggle");
      registry.execute("test.palette.clear");
    });
    expect(commandRuns).toEqual(["toggle 0", "toggle 1", "clear"]);

    act(() => screen.getByRole("button", { name: "switch off" }).click());
    expect(registered()).toEqual([]);
  });
});
