/** @vitest-environment jsdom */
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { type ReactNode, use, useEffect, useState } from "react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { ErrorTrackerContext } from "../../../../react/error-tracker-context";
import { EditorContext } from "../../../../react/state/editor-context";
import { definePetrinautPlugin } from "../../../plugins/define-petrinaut-plugin";
import {
  AssistantPanelTitle,
  useAssistantPanel,
} from "../../../plugins/plugin-assistant";
import { renderPlugins } from "../../../plugins/plugins-test-harness";
import { EditorAssistantPanel, useEditorAssistant } from "./editor-assistant";

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
    </>
  );
};

const chatPlugin = definePetrinautPlugin(
  { id: "test.chat", name: "Chat", assistant: true },
  { assistant: { content: <PluginChat /> } },
);

const composerPlugin = definePetrinautPlugin(
  { id: "test.composer", name: "Composer", assistant: true },
  {
    assistant: {
      content: <textarea aria-label="Message" data-autofocus />,
    },
  },
);

const closeEvents: string[] = [];

const PausingChat = () => {
  const { isOpen } = useAssistantPanel();
  useEffect(() => {
    if (!isOpen) {
      closeEvents.push("panel closed");
    }
  }, [isOpen]);

  return (
    <AssistantPanelTitle
      onClose={() => {
        closeEvents.push("onClose");
      }}
    >
      Pausing assistant
    </AssistantPanelTitle>
  );
};

const pausingPlugin = definePetrinautPlugin(
  { id: "test.pausing", name: "Pausing", assistant: true },
  { assistant: { content: <PausingChat /> } },
);

const CollapsibleChat = ({ disabled = false }: { disabled?: boolean }) => {
  const { collapsed, setCollapsed } = useAssistantPanel();

  return (
    <>
      <AssistantPanelTitle>Docked assistant</AssistantPanelTitle>
      <textarea aria-label="Message" data-autofocus disabled={disabled} />
      <button type="button" onClick={() => setCollapsed(!collapsed)}>
        {collapsed ? "Expand test chat" : "Collapse test chat"}
      </button>
    </>
  );
};

const collapsiblePlugin = definePetrinautPlugin(
  { id: "test.collapsible", name: "Collapsible", assistant: true },
  { assistant: { content: <CollapsibleChat /> } },
);

const disabledComposerPlugin = definePetrinautPlugin(
  { id: "test.disabled-composer", name: "Disabled composer", assistant: true },
  { assistant: { content: <CollapsibleChat disabled /> } },
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
  const { aiAssistantDockHeight, setAiAssistantOpen } = use(EditorContext);
  const [focusRequest, setFocusRequest] = useState(0);

  return (
    <>
      <button type="button" onClick={() => setAiAssistantOpen(true)}>
        Show AI assistant
      </button>
      <button
        type="button"
        onClick={() => setFocusRequest((request) => request + 1)}
      >
        Request assistant focus
      </button>
      <output aria-label="Dock height">
        {aiAssistantDockHeight ?? "none"}
      </output>
      {plugin && (
        <EditorAssistantPanel
          plugin={plugin}
          petriNetId="net"
          focusRequest={focusRequest}
        />
      )}
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

  test("closes the panel from its title bar", () => {
    renderPlugins([chatPlugin], <Editor />);
    fireEvent.click(screen.getByRole("button", { name: "Show AI assistant" }));

    fireEvent.click(screen.getByRole("button", { name: "Close AI assistant" }));

    expect(screen.getByText("Plugin chat closed")).not.toBeNull();
  });

  test("runs the title's onClose before the panel closes", () => {
    /** Records when the panel asks the editor to close it. */
    const RecordingEditor = () => {
      const editor = use(EditorContext);
      return (
        <EditorContext
          value={{
            ...editor,
            setAiAssistantOpen: (open) => {
              if (!open) {
                closeEvents.push("close requested");
              }
              editor.setAiAssistantOpen(open);
            },
          }}
        >
          <Editor />
        </EditorContext>
      );
    };
    renderPlugins([pausingPlugin], <RecordingEditor />);
    fireEvent.click(screen.getByRole("button", { name: "Show AI assistant" }));
    closeEvents.length = 0;

    fireEvent.click(screen.getByRole("button", { name: "Close AI assistant" }));

    expect(closeEvents).toEqual(["onClose", "close requested", "panel closed"]);
  });

  test("shrinks a collapsed panel to a dock and restores it on expand", () => {
    renderPlugins([collapsiblePlugin], <Editor />);
    fireEvent.click(screen.getByRole("button", { name: "Show AI assistant" }));
    const panel = screen.getByRole("complementary", { name: "AI assistant" });
    vi.spyOn(panel, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ width: 360, height: 72 }),
    );
    const header = screen.getByText("Docked assistant").parentElement!;
    const resize = () =>
      screen.getByRole("button", { name: "Resize AI assistant", hidden: true });
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Message" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Collapse test chat" }));

    expect(header.closest(".d_none")).not.toBeNull();
    expect(resize().closest(".d_none")).not.toBeNull();
    expect(header.parentElement?.className).toContain("ov_visible");
    expect(
      screen.getByRole("status", { name: "Dock height" }).textContent,
    ).toBe("72");
    expect(document.activeElement).toBe(panel);

    const expandButton = screen.getByRole("button", {
      name: "Expand test chat",
    });
    expandButton.focus();
    fireEvent.click(expandButton);

    expect(header.closest(".d_none")).toBeNull();
    expect(resize().closest(".d_none")).toBeNull();
    expect(
      screen.getByRole("status", { name: "Dock height" }).textContent,
    ).toBe("none");
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Message" }),
    );
  });

  test("keeps focus already inside an expanded panel on a new focus request", () => {
    renderPlugins([collapsiblePlugin], <Editor />);
    fireEvent.click(screen.getByRole("button", { name: "Show AI assistant" }));
    const collapseButton = screen.getByRole("button", {
      name: "Collapse test chat",
    });
    collapseButton.focus();

    fireEvent.click(
      screen.getByRole("button", { name: "Request assistant focus" }),
    );

    expect(document.activeElement).toBe(collapseButton);
  });

  test("focuses the panel on open and expand when the composer is disabled", () => {
    renderPlugins([disabledComposerPlugin], <Editor />);
    fireEvent.click(screen.getByRole("button", { name: "Show AI assistant" }));
    const panel = screen.getByRole("complementary", { name: "AI assistant" });
    expect(document.activeElement).toBe(panel);

    fireEvent.click(screen.getByRole("button", { name: "Collapse test chat" }));
    const expand = screen.getByRole("button", { name: "Expand test chat" });
    expand.focus();
    fireEvent.click(expand);
    expect(document.activeElement).toBe(panel);
  });

  test("collapses a floating panel to the dock and floats it again on expand", () => {
    renderPlugins([collapsiblePlugin], <Editor />);
    fireEvent.click(screen.getByRole("button", { name: "Show AI assistant" }));
    fireEvent.click(screen.getByRole("button", { name: "Float AI assistant" }));
    const panel = screen.getByRole("complementary", { name: "AI assistant" });
    expect(
      screen.getByRole("button", { name: "Move AI assistant" }),
    ).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Collapse test chat" }));

    expect(panel.getAttribute("data-placement")).toBe("floating");
    expect(
      screen
        .getByRole("button", { name: "Move AI assistant", hidden: true })
        .closest(".d_none"),
    ).not.toBeNull();
    expect(panel.style.getPropertyValue("--floating-panel-top")).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Expand test chat" }));

    expect(
      screen
        .getByRole("button", { name: "Move AI assistant" })
        .closest(".d_none"),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Dock AI assistant" }),
    ).not.toBeNull();
    expect(panel.style.getPropertyValue("--floating-panel-top")).not.toBe("");
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
