/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { SideDockColumn, SideDockProvider } from "../shared/side-dock";
import {
  ReactiveModulesPanel,
  type ReactiveModulesPanelPlacement,
} from "./reactive-modules-panel";

const hir = vi.hoisted(() => ({ status: "error" as "error" | "stale" }));

vi.mock("./reactive-modules-panel/use-lambda-hir", () => ({
  useLambdaHir: () => ({
    status: hir.status,
    lambdaHir: null,
    netHir: null,
    error: hir.status === "error" ? "no language server" : null,
  }),
}));
vi.mock("./reactive-modules-panel/monaco-languages", () => ({
  loadExportLanguages: () => Promise.resolve(),
}));

afterEach(() => {
  cleanup();
  hir.status = "error";
});

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

const dockSpace = () => {
  const spacer = document.querySelector<HTMLElement>("[data-dock-space]");
  if (spacer === null) {
    throw new Error("The dock spacer is not rendered.");
  }
  return spacer;
};

/** A docked panel in a dock, owning its placement like the plugin does. */
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

  test("explains lines on hover only once the header option is on", () => {
    renderPanel("floating");
    const option = screen.getByRole("button", {
      name: "Explain lines on hover",
    });
    expect(option.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(option);
    const pressed = screen.getByRole("button", {
      name: "Stop explaining lines on hover",
    });
    expect(pressed).toBe(option);
    expect(pressed.getAttribute("aria-pressed")).toBe("true");
  });

  test("shows a recompiling status beside the title, not beside the tabs", () => {
    hir.status = "stale";
    renderPanel("floating");
    // The tabs header owns a live region of its own, so the text finds ours.
    const status = screen.getByText("Recompiling…");
    expect(status.getAttribute("role")).toBe("status");
    const titleArea = status.parentElement!;
    expect(
      titleArea.contains(
        screen.getByRole("button", { name: "Move Zeroth Reactive Modules" }),
      ),
    ).toBe(true);
    expect(titleArea.nextElementSibling).toBe(screen.getByRole("tablist"));
  });

  test("narrows a wide window to the docked cap when it docks", () => {
    const { onWidthChange } = renderPanel("floating", { width: 1000 });
    fireEvent.click(
      screen.getByRole("button", { name: "Dock Zeroth Reactive Modules" }),
    );
    expect(onWidthChange).toHaveBeenCalledWith(720);
  });

  test("reserves the docked width with a spacer and none while floating", () => {
    render(<Toggling />);
    const spacer = dockSpace();
    expect(spacer.style.getPropertyValue("--dock-width")).toBe("560px");
    expect(spacer.nextElementSibling).toBe(
      screen.getByLabelText("Zeroth Reactive Modules"),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Float Zeroth Reactive Modules" }),
    );
    expect(spacer.style.getPropertyValue("--dock-width")).toBe("0px");
  });

  test("moves the window between placements and settles the transition", () => {
    const listeners = new Map<string, () => void>();
    const animation = {
      addEventListener: (type: string, listener: () => void) => {
        listeners.set(type, listener);
      },
      removeEventListener: (type: string) => {
        listeners.delete(type);
      },
      cancel: vi.fn(),
    };
    const animate = vi.fn(() => animation);
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      value: animate,
    });
    try {
      render(<Toggling />);
      const panel = screen.getByLabelText("Zeroth Reactive Modules");
      const spacer = dockSpace();
      fireEvent.click(
        screen.getByRole("button", { name: "Float Zeroth Reactive Modules" }),
      );
      expect(animate).toHaveBeenCalledTimes(1);
      const [keyframes, options] = animate.mock.calls[0] as unknown as [
        Keyframe[],
        KeyframeAnimationOptions,
      ];
      expect(keyframes).toHaveLength(2);
      expect(keyframes[1]?.transform).toBe("none");
      expect(options).toEqual({ duration: 150, easing: "ease-in-out" });
      expect(panel.getAttribute("data-animating")).toBe("true");
      expect(spacer.getAttribute("data-animating")).toBe("true");
      act(() => listeners.get("finish")?.());
      expect(panel.hasAttribute("data-animating")).toBe(false);
      expect(spacer.hasAttribute("data-animating")).toBe(false);

      // A second move while the first still runs cancels it and detaches its
      // listener, so the stale animation cannot settle the new move.
      fireEvent.click(
        screen.getByRole("button", { name: "Dock Zeroth Reactive Modules" }),
      );
      const settleFirst = listeners.get("finish");
      const cancelsBefore = animation.cancel.mock.calls.length;
      fireEvent.click(
        screen.getByRole("button", { name: "Float Zeroth Reactive Modules" }),
      );
      expect(animation.cancel.mock.calls.length).toBe(cancelsBefore + 1);
      expect(listeners.get("finish")).not.toBe(settleFirst);
      expect(panel.getAttribute("data-animating")).toBe("true");
    } finally {
      Reflect.deleteProperty(HTMLElement.prototype, "animate");
    }
  });

  test("keeps the same element across a placement toggle", () => {
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
