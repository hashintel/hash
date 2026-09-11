/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { use, useEffect } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  EditorContext,
  type EditorGlobalMode,
} from "../../../react/state/editor-context";
import { UserSettingsContext } from "../../../react/state/user-settings-context";
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
  SimulateView: () => (
    <section aria-label="Experiments">Experiment results</section>
  ),
}));
vi.mock("../Notebook/notebook-view", () => ({
  NotebookView: () => <section aria-label="Notebook" />,
}));
vi.mock("../SDCPN/sdcpn-view", () => ({ SDCPNView: () => null }));
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
vi.mock("./use-editor-commands", () => ({ EditorCommands: () => null }));

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

const EditorAtMode = ({ mode }: { mode: EditorGlobalMode }) => {
  const editor = use(EditorContext);
  const settings = use(UserSettingsContext);
  return (
    <UserSettingsContext.Provider
      value={{ ...settings, enableNotebookView: true }}
    >
      <EditorContext.Provider
        value={{ ...editor, globalMode: mode, isAiAssistantOpen: true }}
      >
        <EditorView aiAssistant={aiAssistant} />
      </EditorContext.Provider>
    </UserSettingsContext.Provider>
  );
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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

    rerender(<EditorAtMode mode="notebook" />);
    expect(screen.getByRole("region", { name: "Notebook" })).toBeTruthy();
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
