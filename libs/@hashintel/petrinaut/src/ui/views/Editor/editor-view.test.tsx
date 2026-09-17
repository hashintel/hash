/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { use, useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  EditorContext,
  type EditorGlobalMode,
  type EditViewMode,
} from "../../../react/state/editor-context";
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
  AiAssistantPanel: () => {
    useEffect(() => {
      lifecycle.mount();
      return lifecycle.cancelPendingRequest;
    }, []);
    return <section aria-label="AI assistant">Pending experiment</section>;
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
vi.mock("./components/ai-cta-modal", () => ({ AiCtaModal: () => null }));
vi.mock("./components/import-error-dialog", () => ({
  ImportErrorDialog: () => null,
}));
vi.mock("../../components/walkthrough/walkthrough-dialog", () => ({
  WalkthroughDialog: () => null,
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
