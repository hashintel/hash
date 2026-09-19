/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { use, useEffect, useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  EditorContext,
  type EditorGlobalMode,
  type EditViewMode,
} from "../../../react/state/editor-context";
import { SDCPNContext } from "../../../react/state/sdcpn-context";
import { UserSettingsContext } from "../../../react/state/user-settings-context";
import { EditorView } from "./editor-view";

import type { PetrinautAiAssistant } from "../../petrinaut";
import type { StatusView } from "@hashintel/petrinaut-core";
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
vi.mock("../Kanban/kanban-view", () => ({
  KanbanView: ({ toolbarStart }: { toolbarStart?: ReactNode }) => (
    <section aria-label="Kanban">{toolbarStart}</section>
  ),
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

const ticketStatusView: StatusView = {
  id: "status-view__tickets",
  name: "Ticket status",
  identityRef: "identity__ticket",
  labels: [
    {
      id: "label__open",
      name: "Open",
      displayColor: "#3b82f6",
      places: ["place__open"],
    },
  ],
};

/**
 * The Kanban board is offered only while the Status views setting is on and
 * the net declares a status view; both are overridden per test.
 */
const StatusViewsWorkspace = ({
  mode = "edit",
  initialView = "canvas",
  statusViewsEnabled = true,
  hasStatusView = true,
}: {
  mode?: EditorGlobalMode;
  initialView?: EditViewMode;
  statusViewsEnabled?: boolean;
  hasStatusView?: boolean;
}) => {
  const editor = use(EditorContext);
  const sdcpn = use(SDCPNContext);
  const settings = use(UserSettingsContext);
  const [editViewMode, setEditViewMode] = useState<EditViewMode>(initialView);
  return (
    <UserSettingsContext.Provider
      value={{ ...settings, enableStatusViews: statusViewsEnabled }}
    >
      <SDCPNContext.Provider
        value={{
          ...sdcpn,
          petriNetDefinition: {
            ...sdcpn.petriNetDefinition,
            statusViews: hasStatusView ? [ticketStatusView] : [],
          },
        }}
      >
        <EditorContext.Provider
          value={{ ...editor, globalMode: mode, editViewMode, setEditViewMode }}
        >
          <EditorView titleEditable />
        </EditorContext.Provider>
      </SDCPNContext.Provider>
    </UserSettingsContext.Provider>
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

describe("Kanban board view", () => {
  test("is offered only while the Status views setting is on and the net has a status view", () => {
    const { rerender } = render(
      <StatusViewsWorkspace statusViewsEnabled={false} />,
    );
    expect(screen.getByRole("radio", { name: "Definitions" })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "Kanban" })).toBeNull();

    rerender(<StatusViewsWorkspace hasStatusView={false} />);
    expect(screen.queryByRole("radio", { name: "Kanban" })).toBeNull();

    rerender(<StatusViewsWorkspace />);
    expect(screen.getByRole("radio", { name: "Kanban" })).toBeTruthy();
  });

  test("shows the board in place of the canvas and keeps the canvas state", async () => {
    render(<StatusViewsWorkspace />);
    const canvas = screen.getByRole("button", { name: "Canvas zoom 1" });
    fireEvent.click(canvas);
    fireEvent.click(screen.getByRole("radio", { name: "Kanban" }));
    expect(await screen.findByRole("region", { name: "Kanban" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Canvas zoom 2" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Definitions" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Canvas" }));
    expect(await screen.findByRole("button", { name: "Canvas zoom 2" })).toBe(
      canvas,
    );
    expect(screen.queryByRole("region", { name: "Kanban" })).toBeNull();
  });

  test("falls back to the canvas when the board is no longer available", async () => {
    const { rerender } = render(<StatusViewsWorkspace initialView="kanban" />);
    expect(await screen.findByRole("region", { name: "Kanban" })).toBeTruthy();

    rerender(
      <StatusViewsWorkspace initialView="kanban" statusViewsEnabled={false} />,
    );
    expect(screen.queryByRole("region", { name: "Kanban" })).toBeNull();
    expect(
      await screen.findByRole("button", { name: "Canvas zoom 1" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("radio", { name: "Canvas", checked: true }),
    ).toBeTruthy();
  });

  test("offers the canvas and the board, but not Definitions, in Actual mode", async () => {
    render(<StatusViewsWorkspace mode="actual" />);
    const selector = screen.getByRole("radiogroup", { name: "Actual view" });
    expect(screen.getByRole("radio", { name: "Canvas" })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "Definitions" })).toBeNull();
    expect(selector).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Kanban" }));
    expect(await screen.findByRole("region", { name: "Kanban" })).toBeTruthy();
  });
});
