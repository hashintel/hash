/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { type ReactNode, use, useEffect } from "react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";

import { createCommandRegistry } from "@hashintel/petrinaut-core";

import { CommandRegistryProvider } from "../../../../react/commands/command-registry";
import { ErrorTrackerContext } from "../../../../react/error-tracker-context";
import { EditorContext } from "../../../../react/state/editor-context";
import { definePetrinautPlugin } from "../../../plugins/define-petrinaut-plugin";
import {
  AssistantPanelTitle,
  useAssistantPanel,
} from "../../../plugins/plugin-assistant";
import { renderPlugins } from "../../../plugins/plugins-test-harness";
import {
  AssistantCommands,
  EditorAssistantPanel,
  useEditorAssistant,
} from "./editor-assistant";

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      public disconnect() {}
      public observe() {}
      public unobserve() {}
    },
  );
});

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const PluginChat = () => {
  const panel = useAssistantPanel();

  return (
    <>
      <AssistantPanelTitle
        actions={<button type="button">Clear test chat</button>}
      >
        Test assistant
      </AssistantPanelTitle>
      <p>{panel.isOpen ? "Plugin chat open" : "Plugin chat closed"}</p>
      <button type="button" onClick={() => panel.setCompact(!panel.compact)}>
        {panel.compact ? "Expand" : "Use the dock"}
      </button>
    </>
  );
};

const chatPlugin = definePetrinautPlugin(
  { id: "test.chat", name: "Chat", assistant: true },
  { assistant: { content: <PluginChat /> } },
);

/** What the closing chat saw, in order. */
const closing: string[] = [];

const ClosingChat = () => {
  const { isOpen } = useAssistantPanel();
  useEffect(() => {
    if (!isOpen) {
      closing.push("closed");
    }
  }, [isOpen]);

  return (
    <AssistantPanelTitle onClose={() => closing.push("onClose")}>
      Closing assistant
    </AssistantPanelTitle>
  );
};

const closingPlugin = definePetrinautPlugin(
  { id: "test.closing", name: "Closing", assistant: true },
  { assistant: { content: <ClosingChat /> } },
);

const composerPlugin = definePetrinautPlugin(
  { id: "test.composer", name: "Composer", assistant: true },
  {
    assistant: {
      content: <textarea aria-label="Message" data-autofocus />,
    },
  },
);

const Throwing = (): ReactNode => {
  throw new Error("The chat broke");
};

const brokenPlugin = definePetrinautPlugin(
  { id: "test.broken", name: "Broken", assistant: true },
  { assistant: { content: <Throwing /> } },
);

/** The panel as the editor mounts it, with a button standing in for the toggle. */
const Editor = () => {
  const { plugin } = useEditorAssistant();
  const { setAiAssistantOpen, aiAssistantDockHeight } = use(EditorContext);

  return (
    <>
      <AssistantCommands />
      <button type="button" onClick={() => setAiAssistantOpen(true)}>
        Show AI assistant
      </button>
      <output aria-label="Dock height">
        {aiAssistantDockHeight ?? "none"}
      </output>
      <EditorAssistantPanel plugin={plugin} petriNetId="net" focusRequest={0} />
    </>
  );
};

describe("EditorAssistantPanel", () => {
  test("renders a plugin's content and title bar in the panel", () => {
    renderPlugins([chatPlugin], <Editor />);
    fireEvent.click(screen.getByRole("button", { name: "Show AI assistant" }));

    const panel = screen.getByRole("complementary", { name: "AI assistant" });
    expect(panel.textContent).toContain("Test assistant");
    expect(panel.textContent).toContain("Plugin chat open");

    const panelButtons = [...panel.querySelectorAll("button")].map(
      (button) => button.getAttribute("aria-label") ?? button.textContent,
    );
    expect(panelButtons).toEqual([
      "Resize AI assistant",
      "Float AI assistant",
      "Clear test chat",
      "Close AI assistant",
      "Use the dock",
    ]);
    expect(document.activeElement).toBe(panel);
  });

  test("focuses the content's data-autofocus element when the panel opens", () => {
    renderPlugins([composerPlugin], <Editor />);
    fireEvent.click(screen.getByRole("button", { name: "Show AI assistant" }));

    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Message" }),
    );
  });

  test("shrinks to a dock the canvas clears, and restores the panel", () => {
    renderPlugins([chatPlugin], <Editor />);
    fireEvent.click(screen.getByRole("button", { name: "Show AI assistant" }));
    const panel = screen.getByRole("complementary", { name: "AI assistant" });
    const dockHeight = screen.getByRole("status", { name: "Dock height" });

    fireEvent.click(screen.getByRole("button", { name: "Use the dock" }));
    expect(panel.dataset.compact).toBe("true");
    expect(dockHeight.textContent).toBe("0");
    expect(document.activeElement).toBe(panel);

    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(panel.dataset.compact).toBe("false");
    expect(dockHeight.textContent).toBe("none");
  });

  test("closes the panel from its title bar", () => {
    renderPlugins([chatPlugin], <Editor />);
    fireEvent.click(screen.getByRole("button", { name: "Show AI assistant" }));

    fireEvent.click(screen.getByRole("button", { name: "Close AI assistant" }));

    expect(screen.getByText("Plugin chat closed")).not.toBeNull();
  });

  test("runs the title's onClose before the panel closes", () => {
    renderPlugins([closingPlugin], <Editor />);
    fireEvent.click(screen.getByRole("button", { name: "Show AI assistant" }));
    closing.length = 0;

    fireEvent.click(screen.getByRole("button", { name: "Close AI assistant" }));

    expect(closing).toEqual(["onClose", "closed"]);
  });

  test("keeps the panel's frame when the plugin's content throws, and reports it", () => {
    const captureException = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderPlugins([brokenPlugin], <Editor />, {
      Around: ({ children }) => (
        <ErrorTrackerContext value={{ captureException }}>
          {children}
        </ErrorTrackerContext>
      ),
    });
    fireEvent.click(screen.getByRole("button", { name: "Show AI assistant" }));

    expect(
      screen.getByRole("button", { name: "Close AI assistant" }),
    ).not.toBeNull();
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
      source: "plugin",
      tags: { pluginId: "test.broken", place: "assistant" },
    });
  });
});

describe("choosing the assistant", () => {
  const renderWithCommands = (settings: object) => {
    localStorage.setItem("petrinaut:user-settings", JSON.stringify(settings));
    const registry = createCommandRegistry();
    renderPlugins([chatPlugin, composerPlugin], <Editor />, {
      Around: ({ children }) => (
        <CommandRegistryProvider registry={registry}>
          {children}
        </CommandRegistryProvider>
      ),
    });
    fireEvent.click(screen.getByRole("button", { name: "Show AI assistant" }));

    return registry;
  };

  test("shows the chosen assistant and switches to another from the palette", () => {
    const registry = renderWithCommands({ assistantPluginId: "test.composer" });
    expect(screen.getByRole("textbox", { name: "Message" })).not.toBeNull();
    expect(registry.list().map(({ label }) => label)).toEqual([
      "Use Chat as the AI assistant",
    ]);

    act(() => registry.list()[0]?.run());

    expect(screen.getByText("Plugin chat open")).not.toBeNull();
    expect(registry.list().map(({ label }) => label)).toEqual([
      "Use Composer as the AI assistant",
    ]);
    expect(
      JSON.parse(localStorage.getItem("petrinaut:user-settings") ?? "{}"),
    ).toMatchObject({ assistantPluginId: "test.chat" });
  });

  test("shows the first running assistant while the chosen one is switched off", () => {
    const registry = renderWithCommands({
      assistantPluginId: "test.composer",
      disabledPluginIds: ["test.composer"],
    });

    expect(screen.getByText("Plugin chat open")).not.toBeNull();
    expect(screen.queryByRole("textbox", { name: "Message" })).toBeNull();
    expect(registry.list()).toEqual([]);
    expect(
      screen.queryByRole("button", { name: "Switch AI assistant" }),
    ).toBeNull();
  });

  test("switches the assistant from the title bar's menu", async () => {
    renderWithCommands({});
    const panel = screen.getByRole("complementary", { name: "AI assistant" });

    fireEvent.click(
      within(panel).getByRole("button", { name: "Switch AI assistant" }),
    );
    const items = within(await screen.findByRole("menu")).getAllByRole(
      "menuitem",
    );
    expect(
      items.map((item) => [item.textContent, item.dataset.selected]),
    ).toEqual([
      ["Chat", "true"],
      ["Composer", undefined],
    ]);

    // The menu selects its highlighted item: a press highlights the item
    // under the pointer, a moment before the click selects it.
    const composer = () => screen.getByRole("menuitem", { name: "Composer" });
    fireEvent.pointerDown(composer());
    await waitFor(() => expect(composer().dataset.highlighted).toBe(""));
    fireEvent.click(composer());

    expect(
      await screen.findByRole("textbox", { name: "Message" }),
    ).not.toBeNull();
    expect(
      JSON.parse(localStorage.getItem("petrinaut:user-settings") ?? "{}"),
    ).toMatchObject({ assistantPluginId: "test.composer" });
  });
});
