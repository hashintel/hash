/** @vitest-environment jsdom */
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { Activity, use, useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { unavailableActualMode } from "@hashintel/petrinaut-core";

import {
  ActualModeContext,
  type ActualModeContextValue,
} from "../../../../../react/actual-mode-context";
import {
  SimulationContext,
  type SimulationState,
} from "../../../../../react/simulation/context";
import {
  useEditorActions,
  useEditorState,
} from "../../../../../react/state/editor-context";
import { definePetrinautPlugin } from "../../../../plugins/define-petrinaut-plugin";
import { renderPlugins } from "../../../../plugins/plugins-test-harness";
import { BottomPanel } from "./panel";

import type { ReactNode } from "react";

// The timeline's chart library reads the pixel ratio as its module loads.
vi.hoisted(() => {
  globalThis.matchMedia = (() => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof matchMedia;
});

// The timelines draw charts, which this file does not look at.
vi.mock("./subviews/event-timeline/content", () => ({
  EventTimeline: () => "Timeline of the run",
}));
vi.mock("./subviews/event-timeline/main", () => ({
  EventTimelineHeaderActions: () => null,
}));
vi.mock("./subviews/simulation-timeline/actual", () => ({
  ActualTimeline: () => "Timeline of the execution",
}));

afterEach(cleanup);

/** Opens the bottom panel of the editor it is rendered in. */
const WithPanelOpen = ({ children }: { children: ReactNode }) => {
  const { setBottomPanelOpen } = useEditorActions();
  useEffect(() => setBottomPanelOpen(true), [setBottomPanelOpen]);
  return children;
};

const notesPlugin = definePetrinautPlugin(
  {
    id: "test.notes",
    name: "Notes",
    bottomPanelViews: { notes: { title: "Notes" } },
  },
  {
    bottomPanelViews: {
      notes: {
        content: "Nothing noted",
        headerAction: <button type="button">Clear notes</button>,
      },
    },
  },
);

const view = (
  <WithPanelOpen>
    <BottomPanel />
  </WithPanelOpen>
);

/** Says whether the editor's bottom panel is open, and enters and leaves Actual mode. */
const EditorProbe = () => {
  const isOpen = useEditorState((editor) => editor.isBottomPanelOpen);
  const { setGlobalMode } = useEditorActions();
  return (
    <>
      <output aria-label="Bottom panel">{isOpen ? "open" : "closed"}</output>
      <button type="button" onClick={() => setGlobalMode("actual")}>
        Enter Actual mode
      </button>
      <button type="button" onClick={() => setGlobalMode("edit")}>
        Leave Actual mode
      </button>
    </>
  );
};

const WithRun = ({
  simulationState,
  actualMode,
  children,
}: {
  simulationState: SimulationState;
  actualMode: ActualModeContextValue;
  children: ReactNode;
}) => (
  <SimulationContext
    value={{ ...use(SimulationContext), state: simulationState }}
  >
    <ActualModeContext value={actualMode}>{children}</ActualModeContext>
  </SimulationContext>
);

const streamingExecution: ActualModeContextValue = {
  available: true,
  source: { id: "execution" },
  status: "streaming",
  title: null,
  definition: null,
  initialState: {},
  transitionFirings: [],
  timelineStartedAtMs: null,
  timelineNowMs: null,
  error: null,
};

/** The closed panel of an editor whose run and reported execution are as given. */
const panelWith = (
  simulationState: SimulationState,
  actualMode: ActualModeContextValue = unavailableActualMode,
) => (
  <WithRun simulationState={simulationState} actualMode={actualMode}>
    <EditorProbe />
    <BottomPanel />
  </WithRun>
);

/**
 * The panel of a run that one click ends while it picks the Diagnostics tab:
 * the run's state lives in a context, the tab in the editor's state.
 */
const PanelOfStoppableRun = () => {
  const [simulationState, setSimulationState] =
    useState<SimulationState>("Running");
  const { setActiveBottomPanelTab } = useEditorActions();
  return (
    <WithRun
      simulationState={simulationState}
      actualMode={unavailableActualMode}
    >
      <button
        type="button"
        onClick={() => {
          setActiveBottomPanelTab("diagnostics");
          setSimulationState("NotRun");
        }}
      >
        Stop and show Diagnostics
      </button>
      <BottomPanel />
    </WithRun>
  );
};

const panelState = () => screen.getByRole("status", { name: "Bottom panel" });

const tabNames = () =>
  screen.getAllByRole("tab").map((tab) => tab.getAttribute("aria-label"));
const selectedTab = () =>
  screen
    .getAllByRole("tab")
    .find((tab) => tab.getAttribute("aria-selected") === "true")
    ?.getAttribute("aria-label");

describe("BottomPanel", () => {
  it("shows a plugin's view as a tab after its own, with its content and header action", () => {
    renderPlugins([notesPlugin], view);

    expect(tabNames()).toEqual(["Diagnostics", "Simulation Settings", "Notes"]);
    expect(screen.queryByText("Nothing noted")).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear notes" })).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Notes" }));

    expect(selectedTab()).toBe("Notes");
    expect(screen.getByRole("tabpanel").textContent).toBe("Nothing noted");
    expect(screen.getByRole("button", { name: "Clear notes" })).toBeTruthy();
  });

  it("starts an own tab at the top after a scrolled tab of a plugin", () => {
    renderPlugins([notesPlugin], view);
    fireEvent.click(screen.getByRole("tab", { name: "Notes" }));
    screen.getByRole("tabpanel").scrollTop = 40;

    fireEvent.click(screen.getByRole("tab", { name: "Diagnostics" }));

    expect(screen.getByRole("tabpanel").scrollTop).toBe(0);
  });

  it("returns to its first tab when the plugin of the active one stops", () => {
    const { rerender } = renderPlugins([notesPlugin], view);
    fireEvent.click(screen.getByRole("tab", { name: "Notes" }));
    expect(selectedTab()).toBe("Notes");

    rerender([]);

    expect(tabNames()).toEqual(["Diagnostics", "Simulation Settings"]);
    expect(selectedTab()).toBe("Diagnostics");
    expect(screen.queryByText("Nothing noted")).toBeNull();
  });

  it("keeps the tab picked in the update that ends the run", () => {
    renderPlugins([], <PanelOfStoppableRun />);
    expect(selectedTab()).toBe("Timeline");

    fireEvent.click(
      screen.getByRole("button", { name: "Stop and show Diagnostics" }),
    );

    expect(tabNames()).toEqual(["Diagnostics", "Simulation Settings"]);
    expect(selectedTab()).toBe("Diagnostics");
  });

  it("opens on the Timeline when a run starts", () => {
    const { rerender } = renderPlugins([], panelWith("NotRun"));
    expect(panelState().textContent).toBe("closed");
    expect(selectedTab()).toBe("Diagnostics");

    rerender([], panelWith("Running"));

    expect(panelState().textContent).toBe("open");
    expect(tabNames()).toEqual([
      "Diagnostics",
      "Simulation Settings",
      "Timeline",
    ]);
    expect(selectedTab()).toBe("Timeline");
    expect(screen.getByRole("tabpanel").textContent).toBe(
      "Timeline of the run",
    );
  });

  it("keeps the tab picked during a run when the canvas comes back into view", () => {
    const canvasView = (mode: "visible" | "hidden") => (
      <Activity mode={mode}>{panelWith("Running")}</Activity>
    );
    const { rerender } = renderPlugins([], canvasView("visible"));
    fireEvent.click(screen.getByRole("tab", { name: "Diagnostics" }));

    rerender([], canvasView("hidden"));
    rerender([], canvasView("visible"));

    expect(selectedTab()).toBe("Diagnostics");
  });

  it("opens on the Actual timeline when a reported execution starts", () => {
    const { rerender } = renderPlugins([], panelWith("NotRun"));
    fireEvent.click(screen.getByRole("button", { name: "Enter Actual mode" }));
    expect(panelState().textContent).toBe("closed");

    rerender([], panelWith("NotRun", streamingExecution));

    expect(panelState().textContent).toBe("open");
    expect(tabNames()).toEqual(["Timeline", "Events"]);
    expect(selectedTab()).toBe("Timeline");
    expect(screen.getByRole("tabpanel").textContent).toBe(
      "Timeline of the execution",
    );
  });

  it("returns to Diagnostics when the editor leaves Actual mode", () => {
    renderPlugins([], panelWith("NotRun", streamingExecution));
    fireEvent.click(screen.getByRole("button", { name: "Enter Actual mode" }));
    expect(selectedTab()).toBe("Timeline");

    fireEvent.click(screen.getByRole("button", { name: "Leave Actual mode" }));

    expect(tabNames()).toEqual(["Diagnostics", "Simulation Settings"]);
    expect(selectedTab()).toBe("Diagnostics");
  });
});
