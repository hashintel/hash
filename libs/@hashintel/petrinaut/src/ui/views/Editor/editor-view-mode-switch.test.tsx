/** @vitest-environment jsdom */
// The real view, bars and editor provider, with the mode changed through the
// editor's own actions: the view shows and hides its parts as the application
// does, which a context override in a harness does not.
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { use } from "react";
import { afterEach, expect, test, vi } from "vitest";

import { EditorContext } from "../../../react/state/editor-context";
import { definePetrinautPlugin } from "../../plugins/define-petrinaut-plugin";
import { renderPlugins } from "../../plugins/plugins-test-harness";
import { EditorView } from "./editor-view";

vi.mock("../../../react/hooks/use-element-size", () => ({
  useElementSize: () => ({ width: 1200, height: 800 }),
}));
vi.mock("./panels/SimulateView/simulate-view", () => ({
  SimulateViewTabs: () => null,
  SimulateView: () => null,
}));
vi.mock("../Notebook/notebook-view", () => ({ NotebookView: () => null }));
vi.mock("../SDCPN/sdcpn-view", () => ({ SDCPNView: () => null }));
vi.mock("./panels/LeftSideBar/panel", () => ({ LeftSideBar: () => null }));
vi.mock("./panels/PropertiesPanel/panel", () => ({
  PropertiesPanel: () => null,
}));
vi.mock("./panels/BottomPanel/panel", () => ({ BottomPanel: () => null }));
vi.mock("./simulation-creation-drawer", () => ({
  SimulationCreationDrawer: () => null,
}));

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

afterEach(cleanup);

const assistantPlugin = definePetrinautPlugin(
  { id: "test.assistant", name: "Assistant", assistant: true },
  { assistant: { content: <p>Plugin chat</p> } },
);

const ModeButtons = () => {
  const { setGlobalMode } = use(EditorContext);
  return (
    <>
      {(["edit", "simulate", "actual"] as const).map((mode) => (
        <button key={mode} type="button" onClick={() => setGlobalMode(mode)}>
          Go to {mode}
        </button>
      ))}
    </>
  );
};
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
const goTo = async (mode: string) => {
  fireEvent.click(screen.getByRole("button", { name: `Go to ${mode}` }));
  await settle();
};
const addPlace = () => screen.queryByRole("button", { name: "Add place mode" });

test(
  "the edit tools are back after a visit to Simulate mode, with an assistant",
  { timeout: 60_000 },
  async () => {
    renderPlugins(
      [assistantPlugin],
      <>
        <EditorView />
        <ModeButtons />
      </>,
    );
    await settle();
    expect(addPlace()).not.toBeNull();

    await goTo("simulate");
    await goTo("edit");

    expect(addPlace()).not.toBeNull();
    expect(
      screen.queryByRole("button", { name: "Add transition mode" }),
    ).not.toBeNull();
  },
);

test(
  "a tool armed in Edit stays armed through Simulate and falls back in Actual",
  { timeout: 60_000 },
  async () => {
    renderPlugins(
      [assistantPlugin],
      <>
        <EditorView />
        <ModeButtons />
      </>,
    );
    await settle();
    fireEvent.keyDown(document.body, { key: "n" });
    expect(addPlace()?.getAttribute("aria-pressed")).toBe("true");

    await goTo("simulate");
    await goTo("edit");
    expect(addPlace()?.getAttribute("aria-pressed")).toBe("true");

    await goTo("actual");
    await goTo("edit");
    expect(addPlace()?.getAttribute("aria-pressed")).toBe("false");
  },
);
