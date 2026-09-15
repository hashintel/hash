// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import {
  PetrinautNavigationProvider,
  usePetrinautNavigation,
} from "../../../../../../react/navigation";
import { Table } from "../../../../../components/table";
import { SimulationWorkspace } from "../../../shared/simulation-workspace";
import { SimulationPanel } from "./simulation-panel";

class ObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ObserverStub as unknown as typeof ResizeObserver;
afterEach(cleanup);

it("opens resources with one click and keeps arrow selection in the list as panels change", () => {
  const rows = [{ id: "Moon" }, { id: "Earth" }, { id: "Mars" }];
  const ResourceList = () => {
    const { state, navigate } = usePetrinautNavigation();
    const selected = state.simulateResource;
    return (
      <SimulationWorkspace>
        <Table
          columns={[{ id: "name", header: "Name", render: (row) => row.id }]}
          emptyLabel="No scenarios"
          rows={rows}
          getRowId={(row) => row.id}
          selectedRowId={selected?.id}
          onRowSelect={(row) =>
            navigate(
              { simulateResource: { type: "scenario", id: row.id } },
              { cause: "user", action: "simulation-resource" },
            )
          }
        />
        {selected && (
          <SimulationPanel
            key={selected.id}
            title={selected.id}
            onClose={() =>
              navigate(
                { simulateResource: null },
                { cause: "user", action: "simulation-resource" },
              )
            }
          >
            <SimulationPanel.Header />
          </SimulationPanel>
        )}
      </SimulationWorkspace>
    );
  };
  render(
    <PetrinautNavigationProvider initialState={{ mode: "simulate" }}>
      <ResourceList />
    </PetrinautNavigationProvider>,
  );
  const moonRow = screen.getByRole("row", { name: "Moon" });
  fireEvent.click(moonRow, { detail: 1 });
  expect(screen.getByRole("region", { name: "Moon" })).toBeDefined();
  expect(document.activeElement).toBe(moonRow);
  fireEvent.keyDown(moonRow, { key: "ArrowDown" });
  const earthRow = screen.getByRole("row", { name: "Earth" });
  expect(screen.getByRole("region", { name: "Earth" })).toBeDefined();
  expect(earthRow.getAttribute("aria-selected")).toBe("true");
  expect(document.activeElement).toBe(earthRow);
  fireEvent.keyDown(earthRow, { key: "ArrowDown" });
  const marsRow = screen.getByRole("row", { name: "Mars" });
  expect(screen.getByRole("region", { name: "Mars" })).toBeDefined();
  expect(document.activeElement).toBe(marsRow);
  fireEvent.keyDown(marsRow, { key: "ArrowUp" });
  expect(document.activeElement).toBe(earthRow);
  expect(screen.getByRole("region", { name: "Earth" })).toBeDefined();
  const close = screen.getByRole("button", { name: "Close panel" });
  close.focus();
  fireEvent.click(close);
  expect(screen.queryByRole("region")).toBeNull();
  expect(document.activeElement).toBe(earthRow);
  expect(earthRow.getAttribute("aria-selected")).toBe("false");
});

const NavigationProbe = () => {
  const { state } = usePetrinautNavigation();
  return (
    <output aria-label="Presentation">
      {state.simulatePresentation ?? "panel"}
    </output>
  );
};

it("keeps edited content, scroll and focus in the same workspace panel when its route expands and contracts", async () => {
  const view = render(
    <PetrinautNavigationProvider
      initialState={{ overlay: { type: "create-scenario" } }}
    >
      <SimulationWorkspace>
        <SimulationPanel title="Scenario" onClose={() => {}} layer="creation">
          <SimulationPanel.Header />
          <SimulationPanel.Body>
            <input aria-label="Scenario name" defaultValue="Morning" />
          </SimulationPanel.Body>
        </SimulationPanel>
      </SimulationWorkspace>
      <aside aria-label="AI assistant" />
      <NavigationProbe />
    </PetrinautNavigationProvider>,
  );
  const input = await screen.findByRole("textbox", { name: "Scenario name" });
  const panel = screen.getByRole("region", { name: "Scenario" });
  const workspace = view.container.querySelector("[data-simulation-workspace]");
  expect(workspace?.contains(panel)).toBe(true);
  expect(screen.getByLabelText("AI assistant").contains(panel)).toBe(false);
  fireEvent.change(input, { target: { value: "Evening" } });
  const body = input.parentElement!;
  body.scrollTop = 120;
  const expand = within(panel).getByRole("button", {
    name: "Expand to fullscreen",
  });
  expand.focus();
  fireEvent.click(expand);
  expect(screen.getByLabelText("Presentation").textContent).toBe("fullscreen");
  expect(screen.getByRole("region", { name: "Scenario" })).toBe(panel);
  expect(screen.getByRole("textbox", { name: "Scenario name" })).toBe(input);
  expect(input).toHaveProperty("value", "Evening");
  expect(body.scrollTop).toBe(120);
  expect(document.activeElement).toBe(expand);
  fireEvent.click(within(panel).getByRole("button", { name: "Show as panel" }));
  expect(screen.getByLabelText("Presentation").textContent).toBe("panel");
  expect(screen.getByRole("textbox", { name: "Scenario name" })).toBe(input);
  expect(input).toHaveProperty("value", "Evening");
});

it("closes on Escape only inside the panel and after nested controls have handled it", () => {
  const onClose = vi.fn();
  const view = render(
    <PetrinautNavigationProvider>
      <SimulationPanel title="Scenario" onClose={onClose}>
        <SimulationPanel.Header />
        <input
          aria-label="Expression"
          onKeyDown={(event) => event.preventDefault()}
        />
      </SimulationPanel>
      <input aria-label="AI message" />
    </PetrinautNavigationProvider>,
  );
  fireEvent.keyDown(screen.getByRole("textbox", { name: "AI message" }), {
    key: "Escape",
  });
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Expression" }), {
    key: "Escape",
  });
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole("region", { name: "Scenario" }), {
    key: "Escape",
  });
  expect(onClose).toHaveBeenCalledOnce();
  view.rerender(
    <PetrinautNavigationProvider>
      <SimulationPanel title="Scenario" onClose={onClose} closeDisabled>
        <SimulationPanel.Header />
      </SimulationPanel>
    </PetrinautNavigationProvider>,
  );
  fireEvent.keyDown(screen.getByRole("region", { name: "Scenario" }), {
    key: "Escape",
  });
  fireEvent.click(screen.getByRole("button", { name: "Close panel" }));
  expect(onClose).toHaveBeenCalledOnce();
});

const LayeredPanels = () => {
  const { state, navigate } = usePetrinautNavigation();
  const closeCreation = () =>
    navigate((current) => ({ ...current, overlay: null }), {
      cause: "user",
      action: "overlay",
    });
  return (
    <SimulationWorkspace>
      <button
        type="button"
        onClick={() =>
          navigate(
            (current) => ({
              ...current,
              overlay: { type: "create-experiment" },
            }),
            { cause: "user", action: "overlay" },
          )
        }
      >
        Create experiment
      </button>
      <SimulationPanel title="Results" onClose={() => {}}>
        <SimulationPanel.Header />
        <input aria-label="Chart choice" defaultValue="All runs" />
      </SimulationPanel>
      {state.overlay?.type === "create-experiment" ? (
        <SimulationPanel
          title="New experiment"
          layer="creation"
          onClose={closeCreation}
        >
          <SimulationPanel.Header />
        </SimulationPanel>
      ) : null}
    </SimulationWorkspace>
  );
};

it("preserves the results panel behind creation and restores it when creation closes", () => {
  render(
    <PetrinautNavigationProvider>
      <LayeredPanels />
    </PetrinautNavigationProvider>,
  );
  const choice = screen.getByRole("textbox", { name: "Chart choice" });
  fireEvent.change(choice, { target: { value: "Selected runs" } });
  fireEvent.click(screen.getByRole("button", { name: "Create experiment" }));
  expect(screen.queryByRole("region", { name: "Results" })).toBeNull();
  const creation = screen.getByRole("region", { name: "New experiment" });
  fireEvent.click(
    within(creation).getByRole("button", { name: "Close panel" }),
  );
  expect(screen.getByRole("textbox", { name: "Chart choice" })).toBe(choice);
  expect(choice).toHaveProperty("value", "Selected runs");
});

it("keeps canvas shortcuts from handling keys pressed in the panel", () => {
  const canvasShortcut = vi.fn();
  render(
    <PetrinautNavigationProvider>
      <SimulationPanel title="Scenario" onClose={() => {}}>
        <SimulationPanel.Header />
      </SimulationPanel>
    </PetrinautNavigationProvider>,
  );
  document.addEventListener("keydown", canvasShortcut);
  try {
    const panel = screen.getByRole("region", { name: "Scenario" });
    fireEvent.keyDown(panel, { key: "Delete" });
    fireEvent.keyDown(panel, { key: "z", metaKey: true });
    expect(canvasShortcut).not.toHaveBeenCalled();
  } finally {
    document.removeEventListener("keydown", canvasShortcut);
  }
});

it.each(["edit", "notebook", "actual"] as const)(
  "keeps the main view interactive when leaving fullscreen results for %s",
  (mode) => {
    const ModeViews = () => {
      const { state, navigate } = usePetrinautNavigation();
      return (
        <>
          <button
            type="button"
            onClick={() =>
              navigate({ mode }, { cause: "user", action: "mode" })
            }
          >
            Switch mode
          </button>
          <SimulationWorkspace>
            <button type="button">Main view action</button>
            {state.mode === "simulate" ? (
              <SimulationPanel title="Results" onClose={() => {}}>
                <SimulationPanel.Header />
              </SimulationPanel>
            ) : null}
          </SimulationWorkspace>
        </>
      );
    };
    render(
      <PetrinautNavigationProvider
        initialState={{
          mode: "simulate",
          simulateResource: { type: "experiment", id: "experiment-1" },
          simulatePresentation: "fullscreen",
        }}
      >
        <ModeViews />
      </PetrinautNavigationProvider>,
    );
    const mainViewAction = screen.getByText("Main view action");
    expect(mainViewAction.closest("[inert]")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Switch mode" }));
    expect(screen.queryByRole("region", { name: "Results" })).toBeNull();
    expect(mainViewAction.closest("[inert]")).toBeNull();
  },
);
