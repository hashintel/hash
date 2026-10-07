/** @vitest-environment jsdom */
import { act, cleanup, screen, within } from "@testing-library/react";
import { use, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CommandRegistryProvider,
  useCommands,
} from "../../react/commands/command-registry";
import { ErrorTrackerContext } from "../../react/error-tracker-context";
import { UserSettingsContext } from "../../react/state/user-settings-context";
import {
  PetrinautAssistantWindow,
  useEditorAssistantWindowHost,
} from "../views/Editor/assistant-window";
import {
  definePetrinautPlugin,
  type PluginHook,
} from "./define-petrinaut-plugin";
import {
  AssistantSwitchCommands,
  PluginAssistantWindow,
  useAssistantStartAction,
} from "./plugin-assistant";
import { PluginToolbarItems } from "./plugin-outlets";
import { usePluginStatuses } from "./plugins-provider";
import { renderPlugins } from "./plugins-test-harness";

import type { ReactNode } from "react";

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** The editor's assistant window, with the start action the empty-net prompt offers. */
const AssistantProbe = () => {
  const host = useEditorAssistantWindowHost();
  const startAction = useAssistantStartAction();

  return (
    <>
      <p>{`start ${startAction?.id ?? "none"}`}</p>
      <PluginAssistantWindow host={host} />
    </>
  );
};

/** Each plugin's top-bar item says whether its assistant is shown. */
const shownItems = { shown: { place: "top-bar-start" } } as const;
const ShownItems = () => (
  <ul>
    <PluginToolbarItems place="top-bar-start" />
  </ul>
);
const shown = (name: string, isActive: boolean) => (
  <li>{`${name} shown ${String(isActive)}`}</li>
);

const view = (text: string) => (
  <PetrinautAssistantWindow>
    <p>{text}</p>
  </PetrinautAssistantWindow>
);

const createBase = definePetrinautPlugin({
  id: "test.base",
  name: "Base",
  assistant: { label: "Base" },
  topBarItems: shownItems,
});
const useBasePlugin: PluginHook<typeof createBase> = (api) => ({
  assistant: {
    view: view("Base view"),
    tabs: [{ id: "notes", label: "Notes", content: <p>Base notes</p> }],
    startActions: [{ id: "type", label: "Type", icon: null }],
  },
  topBarItems: { shown: shown("base", api.assistant.isActive) },
});
const basePlugin = createBase(useBasePlugin);

const createExtension = definePetrinautPlugin({
  id: "test.extension",
  name: "Extension",
  assistant: { extends: createBase },
  topBarItems: shownItems,
});
const useExtensionPlugin: PluginHook<typeof createExtension> = (api) => ({
  assistant: {
    tabs: [{ id: "extra", label: "Extra", content: <p>Extra tab</p> }],
    startActions: [{ id: "speak", label: "Speak", icon: null }],
  },
  topBarItems: { shown: shown("extension", api.assistant.isActive) },
});
const extensionPlugin = createExtension(useExtensionPlugin);

const createOther = definePetrinautPlugin({
  id: "test.other",
  name: "Other",
  assistant: { label: "Other" },
  topBarItems: shownItems,
});
const useOtherPlugin: PluginHook<typeof createOther> = (api) => ({
  assistant: { view: view("Other view") },
  topBarItems: { shown: shown("other", api.assistant.isActive) },
});
const otherPlugin = createOther(useOtherPlugin);

const PluginSwitch = ({ pluginId }: { pluginId: string }) => {
  const { disabledPluginIds, setPluginEnabled } = use(UserSettingsContext);
  const enabled = !disabledPluginIds.includes(pluginId);

  return (
    <button type="button" onClick={() => setPluginEnabled(pluginId, !enabled)}>
      {`${enabled ? "switch off" : "switch on"} ${pluginId}`}
    </button>
  );
};

const shownTexts = () =>
  screen.getAllByRole("listitem").map((item) => item.textContent);
const tabNames = () =>
  screen.getAllByRole("tab", { hidden: true }).map((tab) => tab.textContent);

describe("assistant plugins", () => {
  it("shows the first assistant with its extensions' tabs and start actions, and tells each plugin whether it is shown", () => {
    renderPlugins(
      [extensionPlugin, basePlugin, otherPlugin],
      <>
        <AssistantProbe />
        <ShownItems />
      </>,
    );

    expect(screen.getByText("Base view")).toBeTruthy();
    expect(tabNames()).toEqual(["Base", "Notes", "Extra"]);
    expect(screen.getByText("start type")).toBeTruthy();
    expect(shownTexts()).toEqual([
      "extension shown true",
      "base shown true",
      "other shown false",
    ]);
  });

  it("keeps a stored choice whose plugin is off and applies it once the plugin is back", () => {
    localStorage.setItem(
      "petrinaut:user-settings",
      JSON.stringify({
        aiAssistantId: "test.other",
        disabledPluginIds: ["test.other"],
      }),
    );
    renderPlugins(
      [basePlugin, otherPlugin],
      <>
        <AssistantProbe />
        <PluginSwitch pluginId="test.other" />
      </>,
    );
    expect(screen.getByText("Base view")).toBeTruthy();

    act(() =>
      screen.getByRole("button", { name: "switch on test.other" }).click(),
    );
    expect(screen.getByText("Other view")).toBeTruthy();
    expect(screen.queryByText("Base view")).toBeNull();
  });

  it("drops a failed assistant from the resolution and stops its extensions", () => {
    const createFailing = definePetrinautPlugin({
      id: "test.base",
      name: "Base",
      assistant: { label: "Base" },
    });
    const useFailingPlugin: PluginHook<typeof createFailing> = () => {
      throw new Error("assistant failed");
    };
    const captureException = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const StatusList = () => (
      <ol aria-label="statuses">
        {usePluginStatuses().map(({ plugin, status }) => (
          <li key={plugin.manifest.id}>{`${plugin.manifest.id} ${status}`}</li>
        ))}
      </ol>
    );

    renderPlugins(
      [createFailing(useFailingPlugin), extensionPlugin, otherPlugin],
      <>
        <AssistantProbe />
        <StatusList />
      </>,
      {
        Around: ({ children }) => (
          <ErrorTrackerContext value={{ captureException }}>
            {children}
          </ErrorTrackerContext>
        ),
      },
    );

    expect(screen.getByText("Other view")).toBeTruthy();
    expect(screen.getByText("start none")).toBeTruthy();
    expect(
      within(screen.getByRole("list", { name: "statuses" }))
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "test.base failed",
      "test.extension needs-parent",
      "test.other on",
    ]);
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: { pluginId: "test.base", place: "hook" },
      }),
    );
  });

  it("keeps the view and unrelated plugins mounted when a parent is switched off, stopping only its extensions", () => {
    let mounts = 0;
    const nextMount = () => {
      mounts += 1;

      return mounts;
    };
    const mountItem = (name: string): ReactNode => {
      const MountItem = () => {
        const [mount] = useState(nextMount);

        return <li>{`${name} mount ${mount}`}</li>;
      };

      return <MountItem />;
    };
    const parent = createBase({
      assistant: { view: null },
      topBarItems: { shown: mountItem("base") },
    });
    const extension = createExtension({
      assistant: {},
      topBarItems: { shown: mountItem("extension") },
    });
    const bystander = definePetrinautPlugin({
      id: "test.bystander",
      name: "Bystander",
      topBarItems: shownItems,
    })({ topBarItems: { shown: mountItem("bystander") } });
    const View = () => {
      const [mount] = useState(nextMount);

      return <p>{`view mount ${mount}`}</p>;
    };
    const viewText = () => screen.getByText(/^view mount/).textContent;

    renderPlugins(
      [parent, extension, bystander],
      <>
        <View />
        <ShownItems />
        <PluginSwitch pluginId="test.base" />
      </>,
    );
    const viewBefore = viewText();
    const [baseBefore, extensionBefore, bystanderBefore] = shownTexts();

    act(() =>
      screen.getByRole("button", { name: "switch off test.base" }).click(),
    );
    expect(viewText()).toBe(viewBefore);
    expect(shownTexts()).toEqual([bystanderBefore]);

    act(() =>
      screen.getByRole("button", { name: "switch on test.base" }).click(),
    );
    expect(viewText()).toBe(viewBefore);
    const [baseAfter, extensionAfter, bystanderAfter] = shownTexts();
    expect(bystanderAfter).toBe(bystanderBefore);
    expect(baseAfter).not.toBe(baseBefore);
    expect(extensionAfter).not.toBe(extensionBefore);
  });

  it("renders a failing tab as nothing and keeps the view and the other tabs", () => {
    const Failing = () => {
      throw new Error("tab failed");
    };
    const captureException = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failingTab = createExtension({
      assistant: {
        tabs: [{ id: "broken", label: "Broken", content: <Failing /> }],
      },
      topBarItems: { shown: null },
    });

    renderPlugins([basePlugin, failingTab], <AssistantProbe />, {
      Around: ({ children }) => (
        <ErrorTrackerContext value={{ captureException }}>
          {children}
        </ErrorTrackerContext>
      ),
    });

    expect(screen.getByText("Base view")).toBeTruthy();
    expect(screen.getByText("Base notes")).toBeTruthy();
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: {
          pluginId: "test.extension",
          place: "assistant-tab",
          contributionId: "broken",
        },
      }),
    );
  });

  it.each([
    ["chat", "is the chat tab's id"],
    ["notes", "another tab already has"],
  ])(
    "leaves out and reports a tab with the taken id %s, keeping the view and the other tabs",
    (id, reason) => {
      const captureException = vi.fn();
      vi.spyOn(console, "error").mockImplementation(() => {});
      const withTab = createExtension({
        assistant: { tabs: [{ id, label: "Taken", content: null }] },
        topBarItems: { shown: null },
      });

      renderPlugins([basePlugin, withTab], <AssistantProbe />, {
        Around: ({ children }) => (
          <ErrorTrackerContext value={{ captureException }}>
            {children}
          </ErrorTrackerContext>
        ),
      });

      expect(screen.getByText("Base view")).toBeTruthy();
      expect(tabNames()).toEqual(["Base", "Notes"]);
      expect(captureException).toHaveBeenCalledWith(
        expect.objectContaining({
          message: `Petrinaut plugin "test.extension" returned an assistant tab with id "${id}", which ${reason}. Choose another id.`,
        }),
        expect.objectContaining({
          tags: {
            pluginId: "test.extension",
            place: "assistant-tab",
            contributionId: id,
          },
        }),
      );
    },
  );

  it("replaces a failing view with a window that says so", () => {
    const Failing = () => {
      throw new Error("view failed");
    };
    vi.spyOn(console, "error").mockImplementation(() => {});

    renderPlugins(
      [
        createBase({
          assistant: { view: <Failing /> },
          topBarItems: { shown: null },
        }),
      ],
      <AssistantProbe />,
    );

    expect(screen.getByRole("alert", { hidden: true }).textContent).toBe(
      "The assistant stopped working. Reload the page to start it again.",
    );
  });

  it("offers a palette command for each assistant but the shown one, which switches to it", () => {
    const CommandIds = () => (
      <ol aria-label="commands">
        {useCommands().map((command) => (
          <li key={command.id}>{command.id}</li>
        ))}
      </ol>
    );
    const commandIds = () =>
      within(screen.getByRole("list", { name: "commands" }))
        .queryAllByRole("listitem")
        .map((item) => item.textContent);
    const Palette = () => {
      const commands = useCommands();

      return (
        <button
          type="button"
          onClick={() =>
            commands
              .find(({ id }) => id === "petrinaut.ai-assistant.use:test.other")
              ?.run()
          }
        >
          use other
        </button>
      );
    };

    renderPlugins(
      [basePlugin, otherPlugin],
      <>
        <AssistantSwitchCommands />
        <AssistantProbe />
        <CommandIds />
        <Palette />
      </>,
      { Around: CommandRegistryProvider },
    );
    expect(commandIds()).toEqual(["petrinaut.ai-assistant.use:test.other"]);

    act(() => screen.getByRole("button", { name: "use other" }).click());
    expect(screen.getByText("Other view")).toBeTruthy();
    expect(commandIds()).toEqual(["petrinaut.ai-assistant.use:test.base"]);
  });
});
