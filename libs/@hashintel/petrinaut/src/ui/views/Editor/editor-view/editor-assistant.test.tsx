/** @vitest-environment jsdom */
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { type ReactNode, use } from "react";
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
  const { setAiAssistantOpen } = use(EditorContext);

  return (
    <>
      <button type="button" onClick={() => setAiAssistantOpen(true)}>
        Show AI assistant
      </button>
      {plugin && (
        <EditorAssistantPanel
          plugin={plugin}
          petriNetId="net"
          focusRequest={0}
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
  });

  test("closes the panel from its title bar", () => {
    renderPlugins([chatPlugin], <Editor />);
    fireEvent.click(screen.getByRole("button", { name: "Show AI assistant" }));

    fireEvent.click(screen.getByRole("button", { name: "Close AI assistant" }));

    expect(screen.getByText("Plugin chat closed")).not.toBeNull();
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
