/** @vitest-environment jsdom */
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { type ReactNode, use, useState } from "react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { ErrorTrackerContext } from "../../../../react/error-tracker-context";
import { EditorContext } from "../../../../react/state/editor-context";
import { definePetrinautPlugin } from "../../../plugins/define-petrinaut-plugin";
import {
  AssistantPanelTitle,
  type AssistantStartRequest,
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

const onTitleClose = vi.fn();

const PluginChat = () => {
  const panel = useAssistantPanel();

  return (
    <>
      <AssistantPanelTitle
        actions={<button type="button">Clear test chat</button>}
        onClose={onTitleClose}
      >
        Test assistant
      </AssistantPanelTitle>
      <p>{panel.isOpen ? "Plugin chat open" : "Plugin chat closed"}</p>
      {panel.startRequest !== null && (
        <button type="button" onClick={panel.consumeStartRequest}>
          Start with {JSON.stringify(panel.startRequest)}
        </button>
      )}
    </>
  );
};

const chatPlugin = definePetrinautPlugin(
  { id: "test.chat", name: "Chat", assistant: true },
  {
    assistant: {
      content: <PluginChat />,
      startAction: { id: "listen", label: "Listen", icon: null },
    },
  },
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

/** The panel as the editor mounts it, with buttons standing in for the toggle and the empty-canvas prompt. */
const Editor = () => {
  const assistant = useEditorAssistant();
  const { setAiAssistantOpen } = use(EditorContext);
  const [startRequest, setStartRequest] =
    useState<AssistantStartRequest | null>(null);

  return (
    <>
      <button type="button" onClick={() => setAiAssistantOpen(true)}>
        Show AI assistant
      </button>
      {assistant.startAction && (
        <button
          type="button"
          onClick={() => {
            setStartRequest({ action: assistant.startAction!.id });
            setAiAssistantOpen(true);
          }}
        >
          {assistant.startAction.label}
        </button>
      )}
      {assistant.plugin && (
        <EditorAssistantPanel
          plugin={assistant.plugin}
          petriNetId="net"
          focusRequest={0}
          startRequest={startRequest}
          consumeStartRequest={() => setStartRequest(null)}
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

  test("runs the title's onClose, then closes the panel", () => {
    renderPlugins([chatPlugin], <Editor />);
    fireEvent.click(screen.getByRole("button", { name: "Show AI assistant" }));

    fireEvent.click(screen.getByRole("button", { name: "Close AI assistant" }));

    expect(onTitleClose).toHaveBeenCalledOnce();
    expect(screen.getByText("Plugin chat closed")).not.toBeNull();
  });

  test("hands the start action's request to the content until it is consumed", () => {
    renderPlugins([chatPlugin], <Editor />);

    fireEvent.click(screen.getByRole("button", { name: "Listen" }));
    const start = screen.getByRole("button", {
      name: 'Start with {"action":"listen"}',
    });
    fireEvent.click(start);

    expect(screen.queryByRole("button", { name: /^Start with/u })).toBeNull();
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
