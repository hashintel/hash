// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import {
  PetrinautNavigationProvider,
  usePetrinautNavigation,
} from "../../../../react/navigation";
import { SimulationPanel } from "../panels/SimulateView/shared/simulation-panel";
import { SimulationWorkspace } from "./simulation-workspace";

let workspaceWidth = 1200;
vi.mock("../../../../react/hooks/use-element-size", () => ({
  useElementSize: () => ({ width: workspaceWidth, height: 800 }),
}));

afterEach(() => {
  cleanup();
  workspaceWidth = 1200;
});

it("resizes the divider, retains its width through fullscreen, and fits beside other panels", () => {
  const workspace = () => (
    <PetrinautNavigationProvider
      initialState={{ overlay: { type: "create-scenario" } }}
    >
      <SimulationWorkspace>
        <SimulationPanel title="Scenario" layer="creation" onClose={() => {}}>
          <SimulationPanel.Header />
          <SimulationPanel.Body>
            <input aria-label="Name" defaultValue="Moon" />
          </SimulationPanel.Body>
        </SimulationPanel>
      </SimulationWorkspace>
    </PetrinautNavigationProvider>
  );
  const view = render(workspace());
  const panelSlot = view.container.querySelector<HTMLElement>(
    "[data-simulation-workspace]",
  )!;
  const width = () =>
    panelSlot.style.getPropertyValue("--simulation-panel-width");
  const resize = (start: number, end: number) => {
    fireEvent.mouseDown(
      screen.getByRole("button", { name: "Resize simulation panel" }),
      { clientX: start },
    );
    fireEvent.mouseMove(document, { clientX: end });
    fireEvent.mouseUp(document);
  };
  expect(width()).toBe("720px");
  resize(480, 380);
  expect(width()).toBe("820px");
  const input = screen.getByRole("textbox", { name: "Name" });
  fireEvent.change(input, { target: { value: "Earth" } });
  fireEvent.click(screen.getByRole("button", { name: "Expand to fullscreen" }));
  expect(
    screen.queryByRole("button", { name: "Resize simulation panel" }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Show as panel" }));
  expect(width()).toBe("820px");
  expect(screen.getByRole("textbox", { name: "Name" })).toBe(input);
  expect(input).toHaveProperty("value", "Earth");
  workspaceWidth = 900;
  view.rerender(workspace());
  expect(width()).toBe("620px");
  workspaceWidth = 1200;
  view.rerender(workspace());
  expect(width()).toBe("820px");
  resize(380, -1000);
  expect(width()).toBe("920px");
  resize(280, 2000);
  expect(width()).toBe("440px");
});

it("restores a tab's fullscreen resource directly and only animates presentation changes", () => {
  const Workspace = () => {
    const { state, navigate } = usePetrinautNavigation();
    return (
      <>
        <nav aria-label="Simulation views">
          {(["experiments", "scenarios"] as const).map((view) => (
            <button
              key={view}
              type="button"
              onClick={() =>
                navigate(
                  { simulateView: view, simulateResource: null },
                  { cause: "user", action: "simulation-view" },
                )
              }
            >
              {view}
            </button>
          ))}
        </nav>
        <SimulationWorkspace>
          <p>Resource list</p>
          {state.simulateResource && (
            <SimulationPanel
              title="Mars Orbit"
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
      </>
    );
  };
  const view = render(
    <PetrinautNavigationProvider
      initialState={{
        mode: "simulate",
        simulateView: "scenarios",
        simulateResource: { type: "scenario", id: "mars" },
        simulatePresentation: "fullscreen",
      }}
    >
      <Workspace />
    </PetrinautNavigationProvider>,
  );
  const workspace = view.container.querySelector(
    "[data-simulation-workspace]",
  )!;
  expect(workspace.getAttribute("data-fullscreen")).toBe("true");
  expect(workspace.getAttribute("data-animate")).toBe("false");
  expect(
    screen.getByRole("heading", { name: "Scenarios Mars Orbit" }),
  ).toBeTruthy();
  expect(screen.getByText("Resource list").closest("[inert]")).toBeTruthy();
  expect(screen.getByRole("navigation").closest("[inert]")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Show as panel" }));
  expect(workspace.getAttribute("data-animate")).toBe("true");
  expect(screen.getByRole("heading", { name: "Mars Orbit" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Expand to fullscreen" }));
  fireEvent.click(screen.getByRole("button", { name: "experiments" }));
  expect(screen.queryByRole("region", { name: "Mars Orbit" })).toBeNull();
  const scenariosTab = screen.getByRole("button", { name: "scenarios" });
  scenariosTab.focus();
  fireEvent.click(scenariosTab);
  expect(document.activeElement).toBe(scenariosTab);
  expect(screen.getByRole("region", { name: "Mars Orbit" })).toBeTruthy();
  expect(workspace.getAttribute("data-fullscreen")).toBe("true");
  expect(workspace.getAttribute("data-animate")).toBe("false");
  fireEvent.click(screen.getByRole("button", { name: "Close panel" }));
  fireEvent.click(screen.getByRole("button", { name: "experiments" }));
  fireEvent.click(screen.getByRole("button", { name: "scenarios" }));
  expect(screen.queryByRole("region", { name: "Mars Orbit" })).toBeNull();
});
