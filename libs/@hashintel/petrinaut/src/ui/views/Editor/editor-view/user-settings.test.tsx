// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isWebGpuAvailable,
  createCommandRegistry,
} from "@hashintel/petrinaut-core";

import { CommandRegistryProvider } from "../../../../react/commands/command-registry";
import { PetrinautNavigationProvider } from "../../../../react/navigation";
import { defaultUserSettings } from "../../../../react/state/user-settings-context";
import { UserSettingsProvider } from "../../../../react/state/user-settings-provider";
import { UserSettings } from "./user-settings";

import type { PetrinautNavigationState } from "../../../../react/navigation";

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
});

const renderSettings = (
  initialState: Partial<PetrinautNavigationState> = {},
) => {
  const registry = createCommandRegistry();
  const result = render(
    <CommandRegistryProvider registry={registry}>
      <UserSettingsProvider>
        <PetrinautNavigationProvider initialState={initialState}>
          <UserSettings />
        </PetrinautNavigationProvider>
      </UserSettingsProvider>
    </CommandRegistryProvider>,
  );
  return { ...result, registry };
};

describe("user settings", () => {
  it("drags from the heading, stays within the viewport, and stops on release", async () => {
    renderSettings({ overlay: { type: "user-settings" } });
    const dialog = await screen.findByRole("dialog");
    const heading = screen.getByRole("heading", { name: "General" });
    const handle = heading.parentElement!.parentElement!.parentElement!;
    handle.setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    handle.releasePointerCapture = releasePointerCapture;
    vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue({
      x: 100,
      y: 100,
      left: 100,
      top: 100,
      right: 500,
      bottom: 500,
      width: 400,
      height: 400,
      toJSON: () => ({}),
    });
    fireEvent.pointerDown(handle, { button: 0, clientX: 200, clientY: 150 });
    fireEvent.pointerMove(handle, { clientX: 250, clientY: 170 });
    expect(dialog.style.translate).toBe("50px 20px");
    fireEvent.pointerMove(handle, { clientX: -1000, clientY: -1000 });
    expect(dialog.style.translate).toBe("-92px -92px");
    fireEvent.pointerUp(handle);
    fireEvent.pointerMove(handle, { clientX: 300, clientY: 300 });
    expect(dialog.style.translate).toBe("-92px -92px");
    expect(releasePointerCapture).toHaveBeenCalledOnce();
  });

  it.each(["edit", "simulate", "actual", "notebook"] as const)(
    "opens from the shortcut and palette in %s mode",
    async (mode) => {
      const { registry } = renderSettings({ mode });
      expect(
        registry
          .list()
          .find((command) => command.id === "petrinaut.settings.open")
          ?.shortcut,
      ).toBe("mod+,");
      fireEvent.keyDown(window, { key: ",", ctrlKey: true });
      expect(
        (await screen.findByRole("tab", { name: "General" })).getAttribute(
          "aria-selected",
        ),
      ).toBe("true");
      act(() => {
        registry.execute("petrinaut.settings.open");
      });
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
    },
  );

  it("opens legacy viewport links and applies changes across tabs and remounts", async () => {
    const first = renderSettings({ overlay: { type: "viewport-settings" } });
    expect(
      (await screen.findByRole("tab", { name: "Viewport" })).getAttribute(
        "aria-selected",
      ),
    ).toBe("true");
    fireEvent.click(screen.getByRole("checkbox", { name: "Minimap" }));
    fireEvent.focus(screen.getByRole("tab", { name: "General" }));
    fireEvent.click(screen.getByRole("tab", { name: "General" }));
    await waitFor(() =>
      expect(
        screen
          .getByRole("tab", { name: "General" })
          .getAttribute("aria-selected"),
      ).toBe("true"),
    );
    fireEvent.focus(screen.getByRole("tab", { name: "Viewport" }));
    fireEvent.click(screen.getByRole("tab", { name: "Viewport" }));
    await waitFor(() =>
      expect(
        screen
          .getByRole("tab", { name: "Viewport" })
          .getAttribute("aria-selected"),
      ).toBe("true"),
    );
    expect(
      (screen.getByRole("checkbox", { name: "Minimap" }) as HTMLInputElement)
        .checked,
    ).toBe(false);
    first.unmount();
    renderSettings({ overlay: { type: "user-settings", section: "viewport" } });
    await screen.findByRole("tab", { name: "Viewport" });
    expect(
      (screen.getByRole("checkbox", { name: "Minimap" }) as HTMLInputElement)
        .checked,
    ).toBe(false);
  });

  it("opens through the palette without changing the workspace mode", async () => {
    const { registry } = renderSettings({
      mode: "simulate",
      simulateView: "experiments",
    });
    act(() => {
      registry.execute("petrinaut.settings.open");
    });
    expect(
      (await screen.findByRole("tab", { name: "General" })).getAttribute(
        "aria-selected",
      ),
    ).toBe("true");
  });

  it("disables unavailable GPU compute and omits an unavailable optimizer", async () => {
    renderSettings({
      overlay: { type: "user-settings", section: "simulation" },
    });
    await screen.findByRole("tab", { name: "Simulation" });
    expect(
      (screen.getByRole("checkbox", { name: "WebGPU" }) as HTMLInputElement)
        .disabled,
    ).toBe(true);
    expect(
      screen.queryByRole("checkbox", { name: "In-browser optimization" }),
    ).toBeNull();
    const simulation = screen.getByRole("tab", { name: "Simulation" });
    act(() => simulation.focus());
    fireEvent.keyDown(simulation, { key: "ArrowRight" });
    expect(document.activeElement).toBe(
      screen.getByRole("checkbox", { name: "Parameter sweeps" }),
    );
  });

  it("walks settings with worksheet arrows and restores focus across columns", async () => {
    renderSettings({ overlay: { type: "user-settings" } });
    const general = await screen.findByRole("tab", { name: "General" });
    act(() => general.focus());
    fireEvent.keyDown(general, { key: "ArrowRight" });
    const animations = screen.getByRole("checkbox", { name: "Animations" });
    expect(document.activeElement).toBe(animations);
    fireEvent.keyDown(animations, { key: "ArrowDown" });
    const panels = screen.getByRole("checkbox", {
      name: "Keep panels mounted",
    });
    expect(document.activeElement).toBe(panels);
    fireEvent.keyDown(panels, { key: "ArrowDown" });
    const welcome = screen.getByRole("checkbox", {
      name: "Show welcome guide",
    });
    expect(document.activeElement).toBe(welcome);
    fireEvent.keyDown(welcome, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(general);
    fireEvent.keyDown(general, { key: "ArrowRight" });
    expect(document.activeElement).toBe(welcome);
    fireEvent.keyDown(welcome, { key: "ArrowUp" });
    expect(document.activeElement).toBe(panels);
  });

  it("keeps one content panel and lets dropdowns own their open keyboard interaction", async () => {
    renderSettings({ overlay: { type: "user-settings" } });
    const viewport = await screen.findByRole("tab", { name: "Viewport" });
    screen.getByRole("tabpanel").scrollTop = 200;
    act(() => viewport.focus());
    fireEvent.click(viewport);
    await waitFor(() =>
      expect(viewport.getAttribute("aria-selected")).toBe("true"),
    );
    expect(screen.getAllByRole("tabpanel", { hidden: true })).toHaveLength(1);
    expect(screen.getByRole("tabpanel").scrollTop).toBe(0);
    fireEvent.keyDown(viewport, { key: "ArrowRight" });
    expect(document.activeElement).toBe(
      screen.getByRole("checkbox", { name: "Minimap" }),
    );
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(
      screen.getByRole("checkbox", { name: "Petricon (Experimental)" }),
    );
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(
      screen.getByRole("checkbox", {
        name: "Automatic arc connections (Experimental)",
      }),
    );
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    const arcs = screen.getByRole("combobox", { name: "Arc rendering" });
    expect(document.activeElement).toBe(arcs);
    fireEvent.keyDown(arcs, { key: "ArrowDown" });
    expect(document.activeElement).toBe(
      screen.getByRole("checkbox", { name: "Highlight on hover" }),
    );
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(arcs);
    fireEvent.keyDown(arcs, { key: "Enter" });
    await waitFor(() =>
      expect(arcs.getAttribute("aria-expanded")).toBe("true"),
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("listbox")),
    );
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(document.activeElement).not.toBe(
      screen.getByRole("checkbox", { name: "Highlight on hover" }),
    );
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await waitFor(() =>
      expect(arcs.getAttribute("aria-expanded")).toBe("false"),
    );
    expect(screen.getByRole("dialog", { name: "User settings" })).toBeTruthy();
  });

  it("ignores modified shortcuts and unregisters when unmounted", async () => {
    const { registry, unmount } = renderSettings();
    fireEvent.keyDown(window, { key: ",", metaKey: true, shiftKey: true });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(window, { key: ",", metaKey: true });
    await screen.findByRole("dialog");
    unmount();
    await waitFor(() => expect(registry.list()).toHaveLength(0));
    const event = new KeyboardEvent("keydown", {
      key: ",",
      metaKey: true,
      cancelable: true,
    });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});

describe("experimental simulation settings", () => {
  it("keep parameter sweeps and in-browser optimization off by default", () => {
    expect(defaultUserSettings.enableParameterSweeps).toBe(false);
    expect(defaultUserSettings.enableInBrowserOptimization).toBe(false);
  });

  it("offer no Ad-hoc scenarios row: the scenario form is the only scenario form", async () => {
    // The dialog body portals to document.body, which `screen` covers.
    renderSettings({ overlay: { type: "user-settings", section: "labs" } });

    await screen.findByRole("tab", { name: "Labs" });
    expect(screen.queryByText(/Ad-hoc scenarios/)).toBeNull();
    expect(
      screen.queryByText(/Define initial state and parameters inline/),
    ).toBeNull();
  });
});

describe("WebGPU setting", () => {
  it("is off by default", () => {
    // The GPU path is a restricted subset engine with a different random
    // generator, so it must never be offered — let alone used — without the user
    // turning it on.
    expect(defaultUserSettings.webGpuEnabled).toBe(false);
  });

  it("detects WebGPU support from the host, not a build flag", () => {
    // The runtime gate the control's `disabled` state is derived from.
    vi.stubGlobal("navigator", { gpu: {} });
    try {
      expect(isWebGpuAvailable()).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }

    vi.stubGlobal("navigator", {});
    try {
      expect(isWebGpuAvailable()).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("combined UX settings", () => {
  it("keeps Petricon and automatic arc settings across remounts", async () => {
    const first = renderSettings({
      overlay: { type: "user-settings", section: "viewport" },
    });
    const iconPack = await screen.findByRole("checkbox", {
      name: "Petricon (Experimental)",
    });
    await act(async () => fireEvent.click(iconPack));
    await act(async () =>
      fireEvent.click(
        screen.getByRole("checkbox", {
          name: "Automatic arc connections (Experimental)",
        }),
      ),
    );
    first.unmount();
    renderSettings({ overlay: { type: "user-settings", section: "viewport" } });
    expect(
      (
        (await screen.findByRole("checkbox", {
          name: "Petricon (Experimental)",
        })) as HTMLInputElement
      ).checked,
    ).toBe(true);
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Automatic arc connections (Experimental)",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    expect(
      screen.queryByRole("combobox", { name: "Arc rendering" }),
    ).toBeNull();
  });
});
