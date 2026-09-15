// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { PetrinautNavigationProvider } from "../../../../react/navigation";
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
    "[data-simulation-panel-slot]",
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
