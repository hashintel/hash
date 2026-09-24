/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { SideDockColumn, SideDockProvider } from "../shared/side-dock";
import {
  ReactiveModulesPanel,
  type ReactiveModulesPanelPlacement,
} from "./reactive-modules-panel";

vi.mock("./reactive-modules-panel/use-lambda-hir", () => ({
  useLambdaHir: () => ({
    status: "error",
    lambdaHir: null,
    error: "no language server",
  }),
}));
vi.mock("./reactive-modules-panel/monaco-languages", () => ({
  loadExportLanguages: () => Promise.resolve(),
}));

afterEach(cleanup);

const renderPanel = (
  placement: ReactiveModulesPanelPlacement,
  { docked = false, width = 560 } = {},
) => {
  const onPlacementChange = vi.fn();
  const onWidthChange = vi.fn();
  const panel = (
    <ReactiveModulesPanel
      onClose={() => {}}
      placement={placement}
      onPlacementChange={onPlacementChange}
      width={width}
      onWidthChange={onWidthChange}
    />
  );
  render(
    docked ? (
      <SideDockProvider>
        <main>Workspace</main>
        <SideDockColumn />
        {panel}
      </SideDockProvider>
    ) : (
      panel
    ),
  );
  return { onPlacementChange, onWidthChange };
};

describe("ReactiveModulesPanel", () => {
  test("floats as a movable dialog that docks from its title bar", () => {
    const { onPlacementChange } = renderPanel("floating");
    const dialog = screen.getByRole("dialog", {
      name: "Zeroth Reactive Modules",
    });
    expect(dialog.getAttribute("data-placement")).toBe("floating");
    expect(
      screen.getByRole("button", { name: "Move Zeroth Reactive Modules" }),
    ).not.toBeNull();
    expect(
      screen.queryByRole("button", { name: "Resize Zeroth Reactive Modules" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Dock Zeroth Reactive Modules" }),
    );
    expect(onPlacementChange).toHaveBeenCalledWith("docked");
  });

  test("narrows a wide window to the docked cap when it docks", () => {
    const { onWidthChange } = renderPanel("floating", { width: 1000 });
    fireEvent.click(
      screen.getByRole("button", { name: "Dock Zeroth Reactive Modules" }),
    );
    expect(onWidthChange).toHaveBeenCalledWith(720);
  });

  test("keeps the same element across a placement toggle", () => {
    const Toggling = () => {
      const [placement, setPlacement] =
        useState<ReactiveModulesPanelPlacement>("docked");
      return (
        <SideDockProvider>
          <main>Workspace</main>
          <SideDockColumn />
          <ReactiveModulesPanel
            onClose={() => {}}
            placement={placement}
            onPlacementChange={setPlacement}
            width={560}
            onWidthChange={() => {}}
          />
        </SideDockProvider>
      );
    };
    render(<Toggling />);
    const docked = screen.getByLabelText("Zeroth Reactive Modules");
    fireEvent.click(
      screen.getByRole("button", { name: "Float Zeroth Reactive Modules" }),
    );
    const floating = screen.getByRole("dialog", {
      name: "Zeroth Reactive Modules",
    });
    expect(floating).toBe(docked);
    expect(floating.getAttribute("data-placement")).toBe("floating");
  });

  test("docks as a column resized from its left edge that floats again", () => {
    const { onPlacementChange, onWidthChange } = renderPanel("docked");
    expect(screen.queryByRole("dialog")).toBeNull();
    const panel = screen.getByRole("complementary", {
      name: "Zeroth Reactive Modules",
    });
    expect(panel.getAttribute("data-placement")).toBe("docked");
    expect(
      screen.queryByRole("button", { name: "Move Zeroth Reactive Modules" }),
    ).toBeNull();
    fireEvent.mouseDown(
      screen.getByRole("button", { name: "Resize Zeroth Reactive Modules" }),
      { clientX: 400 },
    );
    fireEvent.mouseMove(document, { clientX: 300 });
    fireEvent.mouseUp(document);
    expect(onWidthChange).toHaveBeenLastCalledWith(660);
    fireEvent.click(
      screen.getByRole("button", { name: "Float Zeroth Reactive Modules" }),
    );
    expect(onPlacementChange).toHaveBeenCalledWith("floating");
  });

  test.each(["docked", "floating"] as const)(
    "renders into the side dock column while %s",
    (placement) => {
      renderPanel(placement, { docked: true });
      const panel = screen.getByLabelText("Zeroth Reactive Modules");
      const column = panel.parentElement!;
      expect(column.hasAttribute("data-side-dock")).toBe(true);
      expect(column.previousElementSibling).toBe(screen.getByRole("main"));
    },
  );
});
