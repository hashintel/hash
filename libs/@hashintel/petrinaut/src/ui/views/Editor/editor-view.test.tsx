/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { use, useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  EditorContext,
  type EditorGlobalMode,
  type EditViewMode,
} from "../../../react/state/editor-context";
import {
  definePetrinautPlugin,
  type PluginHook,
} from "../../plugins/define-petrinaut-plugin";
import { useAssistantPanel } from "../../plugins/plugin-assistant";
import { renderPlugins } from "../../plugins/plugins-test-harness";
import { EditorView } from "./editor-view";

import type { PetrinautAiAssistant } from "../../petrinaut";
import type { UIMessageChunk } from "ai";

const lifecycle = vi.hoisted(() => ({
  mount: vi.fn(),
  cancelPendingRequest: vi.fn(),
}));

vi.mock("../../../react", () => ({
  usePetrinautCommands: () => ({ applyAutoLayout: vi.fn() }),
}));
vi.mock("../../../react/hooks/use-element-size", () => ({
  useElementSize: () => ({ width: 1200, height: 800 }),
}));
vi.mock("../../../react/state/use-selection-cleanup", () => ({
  useSelectionCleanup: () => {},
}));
vi.mock("../../../react/state/use-is-read-only", () => ({
  useIsReadOnly: () => false,
}));
vi.mock("./panels/ai-assistant-panel", () => ({
  AiAssistantPanel: ({
    initialInteractionMode,
  }: {
    initialInteractionMode: string | null;
  }) => {
    useEffect(() => {
      lifecycle.mount();
      return lifecycle.cancelPendingRequest;
    }, []);
    return (
      <section aria-label="AI assistant">
        Pending experiment
        {initialInteractionMode && ` in ${initialInteractionMode} mode`}
      </section>
    );
  },
}));
vi.mock("./panels/SimulateView/simulate-view", () => ({
  SimulateViewTabs: () => <nav aria-label="Simulation views" />,
  SimulateView: () => (
    <section aria-label="Experiments">Experiment results</section>
  ),
}));
vi.mock("../Notebook/notebook-view", () => ({
  NotebookView: () => {
    const [query, setQuery] = useState("");
    return (
      <section aria-label="Definitions">
        <input
          aria-label="Definitions search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </section>
    );
  },
}));
vi.mock("../SDCPN/sdcpn-view", () => ({
  SDCPNView: () => {
    const [zoom, setZoom] = useState(1);
    return (
      <button type="button" onClick={() => setZoom(zoom + 1)}>
        Canvas zoom {zoom}
      </button>
    );
  },
}));
vi.mock("./panels/LeftSideBar/panel", () => ({ LeftSideBar: () => null }));
vi.mock("./panels/PropertiesPanel/panel", () => ({
  PropertiesPanel: () => null,
}));
vi.mock("./panels/BottomPanel/panel", () => ({ BottomPanel: () => null }));
vi.mock("./components/BottomBar/bottom-bar", () => ({ BottomBar: () => null }));
vi.mock("./components/TopBar/top-bar", () => ({ TopBar: () => null }));
vi.mock("./components/import-error-dialog", () => ({
  ImportErrorDialog: () => null,
}));
vi.mock("./simulation-creation-drawer", () => ({
  SimulationCreationDrawer: () => null,
}));
vi.mock("./use-editor-commands", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./use-editor-commands")>()),
  EditorCommands: () => null,
}));

const aiAssistant: PetrinautAiAssistant = {
  transport: {
    reconnectToStream: () => Promise.resolve(null),
    sendMessages: () =>
      Promise.resolve(
        new ReadableStream<UIMessageChunk>({
          start(controller) {
            controller.close();
          },
        }),
      ),
  },
};

const onPrompt = vi.fn();

const promptPlugin = definePetrinautPlugin(
  { id: "test.prompt", name: "Prompt", assistant: true },
  { assistant: { content: <p>Plugin chat</p>, onPrompt } },
);

const onStart = vi.fn();
const startEvents: string[] = [];

const StartChat = ({ started }: { started: boolean }) => {
  const { isOpen } = useAssistantPanel();
  useEffect(() => {
    if (started) {
      startEvents.push(isOpen ? "started open" : "started closed");
    }
  }, [isOpen, started]);

  return <p>{started ? "Plugin chat listening" : "Plugin chat"}</p>;
};

const startDefinition = definePetrinautPlugin({
  id: "test.start",
  name: "Start",
  assistant: true,
});

const useStartPlugin: PluginHook<typeof startDefinition> = () => {
  const [started, setStarted] = useState(false);
  return {
    assistant: {
      content: <StartChat started={started} />,
      onPrompt,
      startAction: {
        label: "Start listening",
        icon: null,
        run: () => {
          onStart();
          setStarted(true);
        },
      },
    },
  };
};

const startPlugin = startDefinition(useStartPlugin);

const silentPlugin = definePetrinautPlugin(
  { id: "test.silent", name: "Silent", assistant: true },
  { assistant: { content: <p>Plugin chat</p> } },
);

const EditorAtMode = ({
  mode,
  view = "canvas",
}: {
  mode: EditorGlobalMode;
  view?: EditViewMode;
}) => {
  const editor = use(EditorContext);
  return (
    <EditorContext.Provider
      value={{
        ...editor,
        globalMode: mode,
        editViewMode: view,
        isAiAssistantOpen: true,
      }}
    >
      <EditorView aiAssistant={aiAssistant} titleEditable />
    </EditorContext.Provider>
  );
};

const EditableWorkspace = () => {
  const editor = use(EditorContext);
  const [editViewMode, setEditViewMode] = useState<EditViewMode>("canvas");
  return (
    <EditorContext.Provider
      value={{ ...editor, editViewMode, setEditViewMode }}
    >
      <EditorView titleEditable />
    </EditorContext.Provider>
  );
};

beforeEach(() => {
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
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("EditorView assistant lifecycle", () => {
  test("keeps the pending assistant mounted when opening experiment results and changing modes", () => {
    const { rerender, unmount } = render(<EditorAtMode mode="edit" />);
    const assistant = screen.getByRole("region", { name: "AI assistant" });
    expect(lifecycle.mount).toHaveBeenCalledTimes(1);

    rerender(<EditorAtMode mode="simulate" />);
    expect(screen.getByRole("region", { name: "Experiments" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "AI assistant" })).toBe(
      assistant,
    );

    rerender(<EditorAtMode mode="edit" view="definitions" />);
    expect(screen.getByRole("region", { name: "Definitions" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "AI assistant" })).toBe(
      assistant,
    );

    rerender(<EditorAtMode mode="edit" />);
    expect(screen.getByRole("region", { name: "AI assistant" })).toBe(
      assistant,
    );
    expect(lifecycle.mount).toHaveBeenCalledTimes(1);
    expect(lifecycle.cancelPendingRequest).not.toHaveBeenCalled();

    unmount();
    expect(lifecycle.cancelPendingRequest).toHaveBeenCalledTimes(1);
  });
});

const promptInput = () =>
  screen.getByRole("textbox", {
    name: "Describe the process you want to create",
  });

const sendPrompt = (message: string) => {
  fireEvent.change(promptInput(), { target: { value: message } });
  fireEvent.click(
    screen.getByRole("button", { name: "Send first AI assistant message" }),
  );
};

const assistantPanel = () =>
  screen.getByRole("complementary", { name: "AI assistant", hidden: true });

describe("EditorView empty-net prompt", () => {
  test("opens the panel and hands the message to the plugin assistant's onPrompt", () => {
    renderPlugins([promptPlugin], <EditorView titleEditable />);

    sendPrompt("Build an SIR model");

    expect(onPrompt).toHaveBeenCalledOnce();
    expect(onPrompt).toHaveBeenCalledWith("Build an SIR model");
    expect(assistantPanel().getAttribute("aria-hidden")).toBeNull();
    expect(assistantPanel().textContent).toContain("Plugin chat");
  });

  test("offers a plugin assistant without a start action no Voice, only a disabled Send", () => {
    renderPlugins([promptPlugin], <EditorView titleEditable />);

    expect(
      screen.queryByRole("button", { name: "Start voice mode" }),
    ).toBeNull();
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Send first AI assistant message",
      }).disabled,
    ).toBe(true);
  });

  test("opens the panel, then runs the plugin assistant's start action once", () => {
    startEvents.length = 0;
    renderPlugins([startPlugin], <EditorView titleEditable />);

    fireEvent.click(screen.getByRole("button", { name: "Start listening" }));

    expect(onStart).toHaveBeenCalledOnce();
    expect(onPrompt).not.toHaveBeenCalled();
    expect(startEvents).toEqual(["started open"]);
    expect(assistantPanel().getAttribute("aria-hidden")).toBeNull();
    expect(assistantPanel().textContent).toContain("Plugin chat listening");
    expect(
      screen.queryByRole("textbox", {
        name: "Describe the process you want to create",
      }),
    ).toBeNull();
  });

  test("sends typed text once to onPrompt without running the start action", () => {
    renderPlugins([startPlugin], <EditorView titleEditable />);

    fireEvent.change(promptInput(), { target: { value: "Model a queue" } });
    expect(
      screen.queryByRole("button", { name: "Start listening" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Send first AI assistant message" }),
    );

    expect(onPrompt).toHaveBeenCalledOnce();
    expect(onPrompt).toHaveBeenCalledWith("Model a queue");
    expect(onStart).not.toHaveBeenCalled();
    expect(assistantPanel().textContent).toContain("Plugin chat");
  });

  test("hides the prompt while the plugin assistant has no onPrompt", () => {
    renderPlugins([silentPlugin], <EditorView titleEditable />);

    expect(
      screen.queryByRole("textbox", {
        name: "Describe the process you want to create",
      }),
    ).toBeNull();
  });

  test("keeps the built-in chat's Voice start", () => {
    renderPlugins(
      [],
      <EditorView
        aiAssistant={{ ...aiAssistant, renderVoiceMode: () => null }}
        titleEditable
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start voice mode" }));

    expect(
      screen.getByRole("region", { name: "AI assistant" }).textContent,
    ).toContain("Pending experiment in voice mode");
  });

  test("offers the built-in chat without Voice no start action", () => {
    renderPlugins([], <EditorView aiAssistant={aiAssistant} titleEditable />);

    expect(
      screen.queryByRole("button", { name: "Start voice mode" }),
    ).toBeNull();
    sendPrompt("Build an SIR model");

    expect(
      screen.getByRole("region", { name: "AI assistant" }).textContent,
    ).toContain("Pending experiment in text mode");
  });
});

describe("Edit workspace views", () => {
  test("switches views without losing local state or scroll position", async () => {
    render(<EditableWorkspace />);
    const canvas = screen.getByRole("button", { name: "Canvas zoom 1" });
    fireEvent.click(canvas);
    fireEvent.click(screen.getByRole("radio", { name: "Definitions" }));
    const notebook = await screen.findByRole("region", { name: "Definitions" });
    expect(screen.queryByRole("button", { name: "Canvas zoom 2" })).toBeNull();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Definitions search" }),
      {
        target: { value: "collision" },
      },
    );
    notebook.scrollTop = 240;
    fireEvent.click(screen.getByRole("radio", { name: "Canvas" }));
    expect(await screen.findByRole("button", { name: "Canvas zoom 2" })).toBe(
      canvas,
    );
    expect(screen.queryByRole("region", { name: "Definitions" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Definitions" }));
    expect(await screen.findByRole("region", { name: "Definitions" })).toBe(
      notebook,
    );
    expect(
      (
        screen.getByRole("textbox", {
          name: "Definitions search",
        }) as HTMLInputElement
      ).value,
    ).toBe("collision");
    expect(notebook.scrollTop).toBe(240);
  });

  test.each(["simulate", "actual"] as const)(
    "does not offer Edit views in %s",
    (mode) => {
      render(<EditorAtMode mode={mode} />);
      expect(
        screen.queryByRole("radiogroup", { name: "Edit view" }),
      ).toBeNull();
    },
  );
});
