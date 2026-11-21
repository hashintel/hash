// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { usePetrinautNavigation } from "../../../../react/navigation/navigation";
import { PetrinautNavigationProvider } from "../../../../react/navigation/navigation-provider";
import { CompositionContext } from "../../../../react/state/composition-context";
import { nextFrame } from "../../../lib/readings.test-helpers";
import { SimulationPanel } from "../panels/SimulateView/shared/simulation-panel";
import { SimulationWorkspace } from "./simulation-workspace";

import type { PetrinautRules } from "@hashintel/petrinaut-core";
import type { MotionValue } from "motion";

let workspaceWidth = 1200;
vi.mock("./simulation-workspace/use-element-width", () => ({
  useElementWidth: () => workspaceWidth,
}));

// jsdom lays nothing out, so the library has no separator to drag. In its
// place stands a field that does what a drag to the typed width does: it
// keeps the width within the limits, sets the panel's size and commits it.
vi.mock("../../../resize/panel-resizer", () => ({
  PanelResizer: ({
    label,
    size,
    minSize,
    maxSize,
    onCommit,
  }: {
    label: string;
    size: MotionValue<number>;
    minSize: number;
    maxSize: number;
    onCommit: (pixels: number) => void;
  }) => (
    <input
      type="number"
      aria-label={label}
      min={minSize}
      max={maxSize}
      onChange={(event) => {
        const pixels = Math.max(
          minSize,
          Math.min(maxSize, Number(event.target.value)),
        );
        size.set(pixels);
        onCommit(pixels);
      }}
    />
  ),
}));

afterEach(() => {
  cleanup();
  workspaceWidth = 1200;
});

const scenarioWorkspace = () => (
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

const queryResizer = () =>
  screen.queryByRole("spinbutton", { name: "Resize simulation panel" });
const findResizer = () =>
  screen.findByRole<HTMLInputElement>("spinbutton", {
    name: "Resize simulation panel",
  });

/** The width of the panels' container, a frame on. The room beside the content has the same. */
const panelWidth = async (container: HTMLElement) => {
  await nextFrame();
  const panelContainer = container.querySelector<HTMLElement>(
    "[data-simulation-panel-container]",
  )!;
  const sizer = container.querySelector<HTMLElement>(
    "[data-simulation-panel-room] > div > div",
  )!;
  expect(sizer.style.width).toBe(panelContainer.style.width);
  return panelContainer.style.width;
};

it("keeps the width its resizer commits through fullscreen, and fits it beside the list", async () => {
  const view = render(scenarioWorkspace());
  const width = () => panelWidth(view.container);
  const resizeTo = async (pixels: number) =>
    fireEvent.change(await findResizer(), {
      target: { value: String(pixels) },
    });

  expect(await width()).toBe("720px");
  expect((await findResizer()).min).toBe("440");
  expect((await findResizer()).max).toBe("920");
  await resizeTo(820);
  expect(await width()).toBe("820px");
  const input = screen.getByRole("textbox", { name: "Name" });
  fireEvent.change(input, { target: { value: "Earth" } });
  fireEvent.click(screen.getByRole("button", { name: "Expand to fullscreen" }));
  expect(queryResizer()).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Show as panel" }));
  expect(await width()).toBe("820px");
  expect(screen.getByRole("textbox", { name: "Name" })).toBe(input);
  expect(input).toHaveProperty("value", "Earth");
  workspaceWidth = 900;
  view.rerender(scenarioWorkspace());
  expect(await width()).toBe("620px");
  expect((await findResizer()).max).toBe("620");
  workspaceWidth = 1200;
  view.rerender(scenarioWorkspace());
  expect(await width()).toBe("820px");
  await resizeTo(2000);
  expect(await width()).toBe("920px");
  await resizeTo(100);
  expect(await width()).toBe("440px");
});

it("follows the workspace until a width is chosen, and a press that moves nothing chooses none", async () => {
  const view = render(scenarioWorkspace());
  const width = () => panelWidth(view.container);

  expect(await width()).toBe("720px");
  fireEvent.change(await findResizer(), { target: { value: "720" } });
  workspaceWidth = 1000;
  view.rerender(scenarioWorkspace());
  expect(await width()).toBe("600px");
});

it("has room and a resizer for an open panel, and neither without one", async () => {
  const view = render(
    <PetrinautNavigationProvider>
      <SimulationWorkspace>
        <p>Resource list</p>
      </SimulationWorkspace>
    </PetrinautNavigationProvider>,
  );
  const isRoomOpen = (container: HTMLElement) =>
    container
      .querySelector("[data-simulation-workspace]")!
      .getAttribute("data-panel-open");
  await nextFrame();
  expect(isRoomOpen(view.container)).toBe("false");
  expect(queryResizer()).toBeNull();
  cleanup();

  const withPanel = render(scenarioWorkspace());
  await findResizer();
  expect(isRoomOpen(withPanel.container)).toBe("true");
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

it("leaves an editor that only composes usable when its navigation says fullscreen Simulate", () => {
  const view = (rules: PetrinautRules) =>
    render(
      <CompositionContext
        value={{
          imports: new Map(),
          libraries: new Map(),
          offered: [],
          rules,
        }}
      >
        <PetrinautNavigationProvider
          initialState={{
            mode: "simulate",
            simulatePresentation: "fullscreen",
          }}
        >
          <SimulationWorkspace>
            <p>Canvas</p>
          </SimulationWorkspace>
        </PetrinautNavigationProvider>
      </CompositionContext>,
    );
  const inert = () => screen.getByText("Canvas").closest("[inert]") !== null;

  view({});
  expect(inert()).toBe(true);
  cleanup();

  view({ edit: "compose" });
  expect(inert()).toBe(false);
});

it("clips its overflow, so the browser cannot scroll it to a panel still out of view", () => {
  const view = render(
    <PetrinautNavigationProvider>
      <SimulationWorkspace>
        <p>Resource list</p>
      </SimulationWorkspace>
    </PetrinautNavigationProvider>,
  );
  const workspace = view.container.querySelector<HTMLElement>(
    "[data-simulation-workspace]",
  )!;

  for (const box of [workspace, workspace.firstElementChild!]) {
    expect(box.className).toContain("ov_clip");
    expect(box.className).not.toContain("ov_hidden");
  }
});
