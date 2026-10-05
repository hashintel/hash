/** @vitest-environment jsdom */
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { use, useState } from "react";
import { createPortal } from "react-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createJsonDocHandle } from "@hashintel/petrinaut-core";

import { ErrorTrackerContext } from "../../react/error-tracker-context";
import { UserSettingsContext } from "../../react/state/user-settings-context";
import { UserSettingsProvider } from "../../react/state/user-settings-provider";
import {
  definePetrinautPlugin,
  type PetrinautPlugin,
  type PetrinautPluginApi,
} from "./define-petrinaut-plugin";
import { useActiveAssistantContent } from "./plugin-assistants";
import { definePluginToken } from "./plugin-token";
import {
  PetrinautPluginsProvider,
  usePetrinautPluginList,
  usePetrinautPlugins,
} from "./plugins-provider";

import type { PetrinautAiAssistant } from "../petrinaut";
import type { ReactNode } from "react";

const handle = createJsonDocHandle({
  id: "plugins-provider-test",
  initial: {
    places: [],
    transitions: [],
    types: [],
    parameters: [],
    differentialEquations: [],
  },
});
const document = { id: handle.id, handle };

const transport: PetrinautAiAssistant["transport"] = {
  reconnectToStream: () => Promise.resolve(null),
  sendMessages: () => Promise.reject(new Error("not sent")),
};

const captureException = vi.fn();

const renderPlugins = (plugins: readonly PetrinautPlugin[], probe: ReactNode) =>
  render(
    <ErrorTrackerContext value={{ captureException }}>
      <UserSettingsProvider>
        <PetrinautPluginsProvider plugins={plugins} document={document}>
          {probe}
        </PetrinautPluginsProvider>
      </UserSettingsProvider>
    </ErrorTrackerContext>,
  );

/** Lists the plugins the editor would see, with their `count` top-bar item. */
const PluginList = () => {
  const plugins = usePetrinautPlugins();

  return (
    <ul>
      {plugins.map(({ manifest, providers }) => (
        <li key={manifest.id}>
          {manifest.id}
          {providers.topBarItems?.count}
        </li>
      ))}
    </ul>
  );
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  captureException.mockReset();
});

describe("PetrinautPluginsProvider", () => {
  it("runs each body as a hook and hands a dependent its provider's value from the same render", () => {
    const Counter = definePluginToken<{
      count: number;
      increment: () => void;
    }>("test.counter");
    const useCounterPlugin = () => {
      const [count, setCount] = useState(0);

      return {
        provides: {
          counter: { count, increment: () => setCount((value) => value + 1) },
        },
      };
    };
    const counterPlugin = definePetrinautPlugin(
      { id: "test.counter", name: "Counter", provides: { counter: Counter } },
      useCounterPlugin,
    );
    const readerPlugin = definePetrinautPlugin(
      {
        id: "test.reader",
        name: "Reader",
        requires: { counter: Counter },
        topBarItems: { count: { place: "top-bar-start" } },
      },
      (api) => ({
        topBarItems: {
          count: (
            <button type="button" onClick={api.deps.counter.increment}>
              count {api.deps.counter.count} of {api.document.id}
            </button>
          ),
        },
      }),
    );

    renderPlugins([readerPlugin, counterPlugin], <PluginList />);

    const items = screen
      .getAllByRole("listitem")
      .map((item) => item.textContent);
    expect(items).toEqual([
      "test.counter",
      "test.readercount 0 of plugins-provider-test",
    ]);
    act(() => screen.getByRole("button").click());
    expect(screen.getByRole("button").textContent).toBe(
      "count 1 of plugins-provider-test",
    );
  });

  it("merges an extension into the active assistant and tells both plugins they are shown", () => {
    // Each plugin reports `isActive` through a top-bar item the list renders.
    const shownItem = (
      api: PetrinautPluginApi<{ id: string; name: string }>,
    ) => <span>{` shown ${String(api.assistant.isActive)}`}</span>;
    const baseManifest = {
      id: "test.base",
      name: "Base",
      assistant: { label: "Base" },
      topBarItems: { count: { place: "top-bar-start" } },
    } as const;
    const extensionManifest = {
      id: "test.extension",
      name: "Extension",
      assistant: { extends: "test.base" },
      topBarItems: { count: { place: "top-bar-start" } },
    } as const;
    const otherManifest = {
      id: "test.other",
      name: "Other",
      assistant: { label: "Other" },
      topBarItems: { count: { place: "top-bar-start" } },
    } as const;
    const useBasePlugin = (api: PetrinautPluginApi<typeof baseManifest>) => ({
      assistant: {
        chat: { transport, primaryLabel: "Base" },
        tabs: [{ id: "base", label: "Base", content: <p>Base tab</p> }],
      },
      topBarItems: { count: shownItem(api) },
    });
    const useExtensionPlugin = (
      api: PetrinautPluginApi<typeof extensionManifest>,
    ) => ({
      assistant: {
        chat: { workingLabel: "Extended" },
        tabs: [{ id: "extra", label: "Extra", content: <p>Extra tab</p> }],
      },
      topBarItems: { count: shownItem(api) },
    });
    const useOtherPlugin = (api: PetrinautPluginApi<typeof otherManifest>) => ({
      assistant: { chat: { transport, primaryLabel: "Other" } },
      topBarItems: { count: shownItem(api) },
    });
    const ActiveAssistant = () => {
      const active = useActiveAssistantContent();

      return active === null ? (
        <p>no assistant</p>
      ) : (
        <p>
          {active.pluginId}: {active.chat.primaryLabel},{" "}
          {active.chat.workingLabel}, tabs{" "}
          {active.tabs.map((tab) => `${tab.pluginId}/${tab.id}`).join(" ")}
        </p>
      );
    };

    renderPlugins(
      [
        definePetrinautPlugin(baseManifest, useBasePlugin),
        definePetrinautPlugin(extensionManifest, useExtensionPlugin),
        definePetrinautPlugin(otherManifest, useOtherPlugin),
      ],
      <>
        <ActiveAssistant />
        <PluginList />
      </>,
    );

    expect(screen.getByText(/test.base:/).textContent).toBe(
      "test.base: Base, Extended, tabs test.base/base test.extension/extra",
    );
    expect(
      screen.getAllByRole("listitem").map((item) => item.textContent),
    ).toEqual([
      "test.base shown true",
      "test.extension shown true",
      "test.other shown false",
    ]);
  });

  it("keeps the view and unrelated plugins mounted across a switch, remounting only the plugins requiring the switched one", () => {
    // Every body and the view keep a mount number in state: a remount draws a new one.
    let mounts = 0;
    const nextMount = () => {
      mounts += 1;

      return mounts;
    };
    const Counter = definePluginToken<number>("test.counter");
    const countItem = { count: { place: "top-bar-start" } } as const;
    const counter = definePetrinautPlugin(
      {
        id: "test.counter",
        name: "Counter",
        provides: { counter: Counter },
        topBarItems: countItem,
      },
      () => {
        const [mount] = useState(nextMount);

        return {
          provides: { counter: mount },
          topBarItems: { count: <span>{` mount ${mount}`}</span> },
        };
      },
    );
    const reader = definePetrinautPlugin(
      {
        id: "test.reader",
        name: "Reader",
        requires: { counter: Counter },
        topBarItems: countItem,
      },
      (api) => {
        const [mount] = useState(nextMount);

        return {
          topBarItems: {
            count: <span>{` mount ${mount} sees ${api.deps.counter}`}</span>,
          },
        };
      },
    );
    const bystander = definePetrinautPlugin(
      { id: "test.bystander", name: "Bystander", topBarItems: countItem },
      () => {
        const [mount] = useState(nextMount);

        return { topBarItems: { count: <span>{` mount ${mount}`}</span> } };
      },
    );
    const View = () => {
      const [mount] = useState(nextMount);

      return <p>{`view mount ${mount}`}</p>;
    };
    const Switch = () => {
      const { disabledPluginIds, setPluginEnabled } = use(UserSettingsContext);
      const enabled = !disabledPluginIds.includes("test.counter");

      return (
        <button
          type="button"
          onClick={() => setPluginEnabled("test.counter", !enabled)}
        >
          {enabled ? "switch off" : "switch on"}
        </button>
      );
    };
    const items = () =>
      screen.getAllByRole("listitem").map((item) => item.textContent);
    const view = () => screen.getByText(/^view mount/).textContent;

    renderPlugins(
      [counter, reader, bystander],
      <>
        <View />
        <PluginList />
        <Switch />
      </>,
    );

    const viewBefore = view();
    const [counterBefore, readerBefore, bystanderBefore] = items();
    expect(readerBefore).toMatch(/^test\.reader mount \d+ sees \d+$/);

    act(() => screen.getByRole("button", { name: "switch off" }).click());
    expect(view()).toBe(viewBefore);
    expect(items()).toEqual([bystanderBefore]);

    act(() => screen.getByRole("button", { name: "switch on" }).click());
    expect(view()).toBe(viewBefore);
    const [counterAfter, readerAfter, bystanderAfter] = items();
    expect(bystanderAfter).toBe(bystanderBefore);
    expect(counterAfter).not.toBe(counterBefore);
    expect(readerAfter).not.toBe(readerBefore);
    expect(readerAfter).toMatch(/^test\.reader mount \d+ sees \d+$/);
  });

  it("re-renders the view's readers when a contribution changes, not when a body re-renders with the same one", () => {
    const steadyManifest = {
      id: "test.steady",
      name: "Steady",
      flags: { beta: { default: false, label: "Beta" } },
      topBarItems: { count: { place: "top-bar-start" } },
    } as const;
    // Shared across renders, as a compiled body returns while its inputs hold.
    const steadyProviders = { topBarItems: { count: <span> steady</span> } };
    let rerun: (() => void) | null = null;
    let flip: (() => void) | null = null;
    const steady = definePetrinautPlugin(steadyManifest, (api) => {
      const [, setTick] = useState(0);
      rerun = () => setTick((tick) => tick + 1);
      flip = () => api.flags.set("beta", !api.flags.get("beta"));

      return steadyProviders;
    });
    const readerRendered = vi.fn();
    const Reader = () => {
      readerRendered();
      const plugins = usePetrinautPlugins();

      return <p>{`${plugins.length} plugin(s)`}</p>;
    };

    renderPlugins([steady], <Reader />);

    expect(screen.getByText("1 plugin(s)")).toBeTruthy();
    const rendersAfterMount = readerRendered.mock.calls.length;

    act(() => rerun?.());
    expect(readerRendered).toHaveBeenCalledTimes(rendersAfterMount);

    act(() => flip?.());
    expect(readerRendered).toHaveBeenCalledTimes(rendersAfterMount + 1);
  });

  it("keeps the view before the portals it opens while mounting, so they paint above it", () => {
    // Petrinaut's root is both the view's parent and the portal container.
    const container = window.document.createElement("div");
    window.document.body.append(container);
    const View = () => (
      <>
        <p>view</p>
        {createPortal(<p>dialog</p>, container)}
      </>
    );

    render(
      <UserSettingsProvider>
        <PetrinautPluginsProvider plugins={[]} document={document}>
          <View />
        </PetrinautPluginsProvider>
      </UserSettingsProvider>,
      { container },
    );

    expect(
      [...container.querySelectorAll("p")].map((node) => node.textContent),
    ).toEqual(["view", "dialog"]);
  });

  it("keeps the view and the other plugins when a body throws, and reports it", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const broken = definePetrinautPlugin(
      { id: "test.broken", name: "Broken" },
      () => {
        throw new Error("plugin failed");
      },
    );
    const fine = definePetrinautPlugin(
      { id: "test.fine", name: "Fine" },
      () => ({}),
    );

    renderPlugins([broken, fine], <PluginList />);

    expect(
      screen.getAllByRole("listitem").map((item) => item.textContent),
    ).toEqual(["test.fine"]);
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "plugin failed" }),
      { source: "plugin.body", tags: { pluginId: "test.broken" } },
    );
    consoleError.mockRestore();
  });

  it("gives no host to a plugin the user switched off, nor to the plugins requiring it", () => {
    localStorage.setItem(
      "petrinaut:user-settings",
      JSON.stringify({ disabledPluginIds: ["test.counter"] }),
    );
    const Counter = definePluginToken<number>("test.counter");
    const counter = definePetrinautPlugin(
      { id: "test.counter", name: "Counter", provides: { counter: Counter } },
      () => ({ provides: { counter: 1 } }),
    );
    const reader = definePetrinautPlugin(
      { id: "test.reader", name: "Reader", requires: { counter: Counter } },
      () => ({}),
    );
    const bystander = definePetrinautPlugin(
      { id: "test.bystander", name: "Bystander" },
      () => ({}),
    );
    const StatusList = () => {
      const statuses = usePetrinautPluginList();

      return (
        <ol aria-label="statuses">
          {statuses.map(({ plugin, enabled, disabledBy }) => (
            <li key={plugin.manifest.id}>
              {plugin.manifest.id} {enabled ? "on" : `off by ${disabledBy}`}
            </li>
          ))}
        </ol>
      );
    };

    renderPlugins(
      [reader, bystander, counter],
      <>
        <PluginList />
        <StatusList />
      </>,
    );

    const [running, statuses] = screen.getAllByRole("list");
    expect(
      within(running!)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["test.bystander"]);
    expect(
      within(statuses!)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "test.counter off by test.counter",
      "test.reader off by test.counter",
      "test.bystander on",
    ]);
  });

  it("gives a body its persisted flags and re-runs it when one changes", () => {
    localStorage.setItem(
      "petrinaut:plugin:test.flagged",
      JSON.stringify({ beta: true, stale: 1 }),
    );
    const flaggedManifest = {
      id: "test.flagged",
      name: "Flagged",
      flags: { beta: { default: false, label: "Beta" } },
      topBarItems: { count: { place: "top-bar-start" } },
    } as const;
    const flagged = definePetrinautPlugin(flaggedManifest, (api) => ({
      topBarItems: {
        count: (
          <button
            type="button"
            onClick={() => api.flags.set("beta", !api.flags.get("beta"))}
          >
            beta {String(api.flags.get("beta"))}
          </button>
        ),
      },
    }));

    renderPlugins([flagged], <PluginList />);

    expect(screen.getByRole("button").textContent).toBe("beta true");
    act(() => screen.getByRole("button").click());
    expect(screen.getByRole("button").textContent).toBe("beta false");
    expect(
      JSON.parse(localStorage.getItem("petrinaut:plugin:test.flagged") ?? ""),
    ).toEqual({ beta: false });
  });
});
