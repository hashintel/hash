/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";
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
import { useReadOnlyFeedback } from "../../react/hooks/use-read-only-feedback";
import { UserSettingsContext } from "../../react/state/user-settings-context";
import {
  definePetrinautPlugin,
  type PluginApi,
  pluginService,
  type PluginHook,
} from "./define-petrinaut-plugin";
import { PluginRoots, PluginToolbarItems } from "./plugin-outlets";
import {
  usePluginComponentLibraries,
  usePluginService,
  usePluginStatuses,
  usePluginViews,
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

const CounterPlugin = definePetrinautPlugin({
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

const useCounterPlugin: PluginHook<typeof CounterPlugin> = (api) => {
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

const RemountPlugin = definePetrinautPlugin({
  id: "test.remount",
  name: "Remount",
  topBarItems: { mount: { place: "top-bar-end" } },
});

const useRemountPlugin: PluginHook<typeof RemountPlugin> = () => {
  const [mount] = useState(nextMount);

  return { topBarItems: { mount: <span>{`mount ${mount}`}</span> } };
};

const labelPlugin = definePetrinautPlugin({
  id: "test.label",
  name: "Label",
  topBarItems: { label: { place: "top-bar-end" } },
})({ topBarItems: { label: <span>label</span> } });

/** The read-only notice actions that ran, in order. Module scope, as for `commandRuns`. */
const noticeRuns: string[] = [];

const createNoticePlugin = (key: string, label: string) =>
  definePetrinautPlugin(
    { id: `test.${key}`, name: label, readOnlyAction: { label } },
    { readOnlyAction: { run: () => noticeRuns.push(key) } },
  );

const copyPlugin = createNoticePlugin("copy", "Make a copy");
const forkPlugin = createNoticePlugin("fork", "Fork");

describe("PetrinautPluginsProvider", () => {
  it("renders the object form and the hook form, whose api keeps its identity across a host re-render", () => {
    renderPlugins(
      [CounterPlugin(useCounterPlugin), labelPlugin],
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
    const SettingsPlugin = definePetrinautPlugin({
      id: "test.settings",
      name: "Settings",
      access: { document: "read" },
      settings: {
        a: { type: "boolean", default: true, label: "A" },
        b: { type: "boolean", default: false, label: "B" },
      },
      topBarItems: { values: { place: "top-bar-end" } },
    });
    const apis: PluginApi<typeof SettingsPlugin>[] = [];
    const useSettingsPlugin: PluginHook<typeof SettingsPlugin> = (api) => {
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

    renderPlugins([SettingsPlugin(useSettingsPlugin)], <TopBarEnd />);
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
    const CapturePlugin = definePetrinautPlugin({
      id: "test.x",
      name: "Capture",
    });
    const useCapturePlugin: PluginHook<typeof CapturePlugin> = (api) => {
      useLayoutEffect(() => {
        api.errors.capture(error);
        api.errors.capture(error, { source: "x", tags: { pluginId: "spoof" } });
      }, [api]);

      return {};
    };

    renderPlugins([CapturePlugin(useCapturePlugin)], null, {
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
          : [
              `${key}:${"edit" in value || "run" in value || "navigate" in value ? "write" : "read"}`,
            ],
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
      access: { document: "write", experiments: "read", editor: "write" },
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
      writer: ["document:write", "experiments:read", "editor:write"],
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
    const plugin = RemountPlugin(useRemountPlugin);
    const { rerender } = renderPlugins([plugin], <TopBarEnd />);
    const first = screen.getByText(/^mount/).textContent;

    rerender([plugin]);
    expect(screen.getByText(/^mount/).textContent).toBe(first);

    rerender([RemountPlugin(useRemountPlugin)]);
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
    const plugins = [RemountPlugin(useRemountPlugin)];
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
    const SteadyPlugin = definePetrinautPlugin({
      id: "test.steady",
      name: "Steady",
      settings: { beta: { type: "boolean", default: false, label: "Beta" } },
      root: true,
    });
    const useSteadyPlugin: PluginHook<typeof SteadyPlugin> = (api) => {
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

    renderPlugins([SteadyPlugin(useSteadyPlugin)], <View />);
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
    const BrokenPlugin = definePetrinautPlugin({
      id: "test.broken",
      name: "Broken",
    });
    const useBrokenPlugin: PluginHook<typeof BrokenPlugin> = () => {
      throw new Error("plugin failed");
    };
    const Statuses = () =>
      usePluginStatuses().map(({ plugin, status }) => (
        <p key={plugin.manifest.id}>{`${plugin.manifest.id} ${status}`}</p>
      ));

    renderPlugins(
      [BrokenPlugin(useBrokenPlugin), labelPlugin],
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
      root: true,
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

  it("lets two plugins read and show each other's services", () => {
    const FirstPlugin = definePetrinautPlugin({
      id: "test.first",
      name: "First",
      topBarItems: { seen: { place: "top-bar-end" } },
      provides: pluginService<{ name: string }>(),
    });
    const SecondPlugin = definePetrinautPlugin({
      id: "test.second",
      name: "Second",
      topBarItems: { seen: { place: "top-bar-end" } },
      provides: pluginService<{ name: string }>(),
    });
    const firstService = { name: "first" };
    const secondService = { name: "second" };
    const useFirstPlugin: PluginHook<typeof FirstPlugin> = () => {
      const second = usePluginService(SecondPlugin);

      return {
        topBarItems: { seen: <span>{`first sees ${second?.name}`}</span> },
        provides: firstService,
      };
    };
    const useSecondPlugin: PluginHook<typeof SecondPlugin> = () => {
      const first = usePluginService(FirstPlugin);

      return {
        topBarItems: { seen: <span>{`second sees ${first?.name}`}</span> },
        provides: secondService,
      };
    };

    renderPlugins(
      [FirstPlugin(useFirstPlugin), SecondPlugin(useSecondPlugin)],
      <TopBarEnd />,
    );

    expect(screen.getByText("first sees second")).toBeTruthy();
    expect(screen.getByText("second sees first")).toBeTruthy();
  });

  it("starts a remounted plugin's contributions afresh, failures included", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    let throws = true;
    const Item = () => {
      if (throws) {
        throw new Error("contribution failed");
      }

      return <span>item</span>;
    };
    const ItemPlugin = definePetrinautPlugin({
      id: "test.item",
      name: "Item",
      topBarItems: { item: { place: "top-bar-end" } },
    });

    const { rerender } = renderPlugins(
      [ItemPlugin({ topBarItems: { item: <Item /> } })],
      <TopBarEnd />,
    );
    expect(screen.queryByText("item")).toBeNull();

    throws = false;
    rerender([ItemPlugin({ topBarItems: { item: <Item /> } })]);
    expect(screen.getByText("item")).toBeTruthy();
    consoleError.mockRestore();
  });

  it("runs no other plugin's hook when one switches off", () => {
    const steadyHook = vi.fn(() => ({}));
    const steadyPlugin = definePetrinautPlugin({
      id: "test.steady",
      name: "Steady",
    })(steadyHook);
    const togglePlugin = definePetrinautPlugin({
      id: "test.toggle",
      name: "Toggle",
    })({});
    const Switch = () => {
      const { setPluginEnabled } = use(UserSettingsContext);

      return (
        <button
          type="button"
          onClick={() => setPluginEnabled("test.toggle", false)}
        >
          off
        </button>
      );
    };

    renderPlugins([steadyPlugin, togglePlugin], <Switch />);
    const callsAfterMount = steadyHook.mock.calls.length;

    act(() => screen.getByRole("button").click());
    expect(steadyHook).toHaveBeenCalledTimes(callsAfterMount);
  });

  it("runs a failed plugin again once the user switches it off and on", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    let throws = true;
    const FlakyPlugin = definePetrinautPlugin({
      id: "test.flaky",
      name: "Flaky",
    });
    const useFlakyPlugin: PluginHook<typeof FlakyPlugin> = () => {
      if (throws) {
        throw new Error("plugin failed");
      }

      return {};
    };
    const Switch = () => {
      const { setPluginEnabled } = use(UserSettingsContext);
      const [status] = usePluginStatuses().map((entry) => entry.status);

      return (
        <button
          type="button"
          onClick={() => setPluginEnabled("test.flaky", status === "off")}
        >
          {status}
        </button>
      );
    };

    renderPlugins([FlakyPlugin(useFlakyPlugin)], <Switch />);
    const button = screen.getByRole("button");
    expect(button.textContent).toBe("failed");

    throws = false;
    act(() => button.click());
    expect(button.textContent).toBe("off");
    act(() => button.click());
    expect(button.textContent).toBe("on");
    consoleError.mockRestore();
  });

  it("reads another plugin's service while it runs, and keeps the view mounted when it is switched off", () => {
    const SourcePlugin = definePetrinautPlugin({
      id: "test.source",
      name: "Source",
      provides: pluginService<{ value: string }>(),
    });
    const sourcePlugin = SourcePlugin({ provides: { value: "ready" } });
    const View = () => {
      const service = usePluginService(SourcePlugin);
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
    const PalettePlugin = definePetrinautPlugin({
      id: "test.palette",
      name: "Palette",
      commands: {
        toggle: { label: "Toggle the palette", shortcut: "mod+k" },
        clear: { label: "Clear the history", category: "History" },
      },
      buttons: { toggle: { label: "Palette", place: "top-bar-end" } },
    });
    const usePalettePlugin: PluginHook<typeof PalettePlugin> = () => {
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

    renderPlugins([PalettePlugin(usePalettePlugin)], <View />, {
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

  it("skips a button's command while `when` withholds it", () => {
    const runs = vi.fn();
    const clicks = vi.fn();
    const plugin = definePetrinautPlugin({
      id: "test.withheld",
      name: "Withheld",
      commands: { act: { label: "Act" } },
      buttons: { act: { label: "Act", place: "top-bar-end" } },
    })({
      commands: { act: { run: runs, when: false } },
      buttons: { act: { icon: null, onClick: clicks, command: "act" } },
    });

    renderPlugins([plugin], <TopBarEnd />);
    act(() => screen.getByRole("button", { name: "Act" }).click());

    expect(clicks).toHaveBeenCalledOnce();
    expect(runs).not.toHaveBeenCalled();
  });

  it("puts the first running plugin's read-only action on the notice of a blocked edit, and runs it", async () => {
    const View = () => {
      const explainBlockedEdit = useReadOnlyFeedback();
      const { setPluginEnabled } = use(UserSettingsContext);

      return (
        <>
          <button type="button" onClick={() => explainBlockedEdit()}>
            drag a node
          </button>
          <button
            type="button"
            onClick={() => setPluginEnabled("test.copy", false)}
          >
            switch copy off
          </button>
        </>
      );
    };
    const notice = "This document is read-only.";

    renderPlugins([labelPlugin, copyPlugin, forkPlugin], <View />, {
      readonly: true,
    });

    fireEvent.click(screen.getByRole("button", { name: "drag a node" }));
    fireEvent.click(await screen.findByRole("button", { name: "Make a copy" }));
    expect(noticeRuns).toEqual(["copy"]);
    // The toast leaves after the toaster's remove delay, whose timer fires late
    // while other suites load the machine.
    await waitFor(() => expect(screen.queryByText(notice)).toBeNull(), {
      timeout: 3000,
    });

    fireEvent.click(screen.getByRole("button", { name: "switch copy off" }));
    fireEvent.click(screen.getByRole("button", { name: "drag a node" }));
    fireEvent.click(await screen.findByRole("button", { name: "Fork" }));
    expect(noticeRuns).toEqual(["copy", "fork"]);
  });
});

describe("views and component libraries", () => {
  const ViewsReadout = () => {
    const views = usePluginViews();
    return (
      <ul>
        {views.map((view) => (
          <li key={view.id} data-testid="view">
            {view.id}:{view.label}
          </li>
        ))}
      </ul>
    );
  };

  const LibrariesReadout = () => {
    const libraries = usePluginComponentLibraries();
    return (
      <ul>
        {libraries.map((library) => (
          <li key={library.id} data-testid="library">
            {library.id}:{library.name}:
            {library.components.map(({ name }) => name).join(",")}
          </li>
        ))}
      </ul>
    );
  };

  it("lists the running plugins' views with prefixed ids, and their libraries", () => {
    const codePlugin = definePetrinautPlugin(
      {
        id: "test.code",
        name: "Code",
        views: { code: { label: "Code" }, tree: { label: "Tree" } },
      },
      { views: { code: <pre>code</pre>, tree: <pre>tree</pre> } },
    );
    const libraryPlugin = definePetrinautPlugin(
      {
        id: "test.library",
        name: "Library",
        componentLibrary: { name: "Queueing" },
      },
      {
        componentLibrary: [
          {
            id: "queue",
            name: "Queue",
            template: {
              name: "Queue",
              places: [],
              transitions: [],
              types: [],
              differentialEquations: [],
              parameters: [],
            },
          },
        ],
      },
    );

    renderPlugins(
      [codePlugin, libraryPlugin],
      <>
        <ViewsReadout />
        <LibrariesReadout />
      </>,
    );

    expect(
      screen.getAllByTestId("view").map((item) => item.textContent),
    ).toEqual(["test.code:code:Code", "test.code:tree:Tree"]);
    expect(
      screen.getAllByTestId("library").map((item) => item.textContent),
    ).toEqual(["test.library:Queueing:Queue"]);
  });
});
