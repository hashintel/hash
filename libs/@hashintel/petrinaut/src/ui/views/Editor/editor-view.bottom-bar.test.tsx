/** @vitest-environment jsdom */
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { useEditorActions } from "../../../react/state/editor-context";
import { definePetrinautPlugin } from "../../plugins/define-petrinaut-plugin";
import { renderPlugins } from "../../plugins/plugins-test-harness";
import { EditorView } from "./editor-view";

vi.mock("../../../react/hooks/use-element-size", () => ({
  useElementSize: () => ({ width: 1200, height: 800 }),
}));
vi.mock("./panels/SimulateView/simulate-view", () => ({
  SimulateViewTabs: () => <nav aria-label="Simulation views" />,
  SimulateView: () => <section aria-label="Experiments" />,
}));
vi.mock("../Notebook/notebook-view", () => ({ NotebookView: () => null }));
vi.mock("../SDCPN/sdcpn-view", () => ({ SDCPNView: () => null }));
vi.mock("./panels/LeftSideBar/panel", () => ({ LeftSideBar: () => null }));
vi.mock("./panels/PropertiesPanel/panel", () => ({
  PropertiesPanel: () => null,
}));
vi.mock("./panels/BottomPanel/panel", () => ({ BottomPanel: () => null }));
vi.mock("./components/TopBar/top-bar", () => ({ TopBar: () => null }));
vi.mock("./simulation-creation-drawer", () => ({
  SimulationCreationDrawer: () => null,
}));
vi.mock("./use-editor-commands", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./use-editor-commands")>()),
  EditorCommands: () => null,
}));

const assistantPlugin = definePetrinautPlugin(
  { id: "test.assistant", name: "Assistant", assistant: true },
  { assistant: { content: <p>Plugin chat</p> } },
);

/** Stands in for the mode switch of the top bar. */
const ModeSwitch = () => {
  const { setGlobalMode } = useEditorActions();
  return (
    <>
      <button type="button" onClick={() => setGlobalMode("simulate")}>
        To Simulate
      </button>
      <button type="button" onClick={() => setGlobalMode("edit")}>
        To Edit
      </button>
    </>
  );
};

const barButtons = () =>
  screen
    .getAllByRole("button")
    .map((button) => button.getAttribute("aria-label"))
    .filter((label) => label !== null);

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
  vi.unstubAllGlobals();
});

describe("EditorView bottom bar", () => {
  // The assistant's button keeps the group of the tools mounted on a
  // read-only net, so the bar comes back from Simulate mode with the same
  // group and has to put the tools back into it.
  test("offers the tools again on the return from Simulate mode to Edit, beside an assistant", () => {
    renderPlugins(
      [assistantPlugin],
      <>
        <ModeSwitch />
        <EditorView />
      </>,
    );
    const atFirst = barButtons();
    expect(atFirst).toEqual(
      expect.arrayContaining([
        "Add place mode",
        "Add transition mode",
        "Show AI assistant",
      ]),
    );

    fireEvent.click(screen.getByRole("button", { name: "To Simulate" }));
    expect(screen.getByRole("region", { name: "Experiments" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "To Edit" }));

    expect(barButtons()).toEqual(atFirst);
  });
});
