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
import { PetrinautOptimizationContext } from "../../../../react/optimization-context";
import { UserSettingsProvider } from "../../../../react/state/user-settings-provider";
import { UserSettings } from "./user-settings";

import type { PetrinautNavigationState } from "../../../../react/navigation";
import type { PetrinautOptimizationSource } from "../../../../react/optimization-context";
import type { ReactNode } from "react";

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
  optimization: PetrinautOptimizationSource | null = null,
  settingsLabs?: ReactNode,
) => {
  const registry = createCommandRegistry();
  const result = render(
    <CommandRegistryProvider registry={registry}>
      <UserSettingsProvider>
        <PetrinautNavigationProvider initialState={initialState}>
          <PetrinautOptimizationContext value={optimization}>
            <UserSettings settingsLabs={settingsLabs} />
          </PetrinautOptimizationContext>
        </PetrinautNavigationProvider>
      </UserSettingsProvider>
    </CommandRegistryProvider>,
  );
  return { ...result, registry };
};

describe("user settings", () => {
  it.each(["heading", "top padding"])(
    "drags from %s, stays within the viewport, and stops on release",
    async (dragSource) => {
      renderSettings({ overlay: { type: "user-settings" } });
      const dialog = await screen.findByRole("dialog");
      const heading = screen.getByRole("heading", { name: "General" });
      const handle = dialog.querySelector<HTMLElement>(
        '[data-scope="tabs"][data-part="root"]',
      )!;
      vi.spyOn(
        heading.closest("header")!,
        "getBoundingClientRect",
      ).mockReturnValue(new DOMRect(100, 100, 400, 80));
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
      vi.spyOn(dialog.parentElement!, "getBoundingClientRect").mockReturnValue(
        new DOMRect(0, 0, 1024, 768),
      );
      fireEvent.pointerDown(dragSource === "heading" ? heading : handle, {
        button: 0,
        clientX: 200,
        clientY: 150,
      });
      fireEvent.pointerMove(handle, { clientX: 250, clientY: 170 });
      expect(dialog.style.getPropertyValue("--floating-panel-right")).toContain(
        "474px",
      );
      expect(dialog.style.getPropertyValue("--floating-panel-top")).toContain(
        "120px",
      );
      fireEvent.pointerMove(handle, { clientX: -1000, clientY: -1000 });
      expect(dialog.style.getPropertyValue("--floating-panel-right")).toContain(
        "604px",
      );
      expect(dialog.style.getPropertyValue("--floating-panel-top")).toContain(
        "20px",
      );
      fireEvent.pointerUp(handle);
      fireEvent.pointerMove(handle, { clientX: 300, clientY: 300 });
      expect(dialog.style.getPropertyValue("--floating-panel-right")).toContain(
        "604px",
      );
      expect(dialog.style.getPropertyValue("--floating-panel-top")).toContain(
        "20px",
      );
      expect(releasePointerCapture).toHaveBeenCalledOnce();
    },
  );

  it("keeps tabs and scrolled settings outside the drag area", async () => {
    renderSettings({ overlay: { type: "user-settings", section: "viewport" } });
    const dialog = await screen.findByRole("dialog");
    const heading = screen.getByRole("heading", { name: "Viewport" });
    const handle = dialog.querySelector<HTMLElement>(
      '[data-scope="tabs"][data-part="root"]',
    )!;
    const setPointerCapture = vi.fn();
    handle.setPointerCapture = setPointerCapture;
    vi.spyOn(
      heading.closest("header")!,
      "getBoundingClientRect",
    ).mockReturnValue(new DOMRect(100, 100, 400, 80));
    const initialPosition = dialog.style.cssText;
    fireEvent.pointerDown(screen.getByRole("tab", { name: "General" }), {
      button: 0,
      clientX: 150,
      clientY: 150,
    });
    const panel = screen.getByRole("tabpanel");
    panel.scrollTop = 200;
    fireEvent.scroll(panel);
    fireEvent.pointerDown(screen.getByText("Minimap"), {
      button: 0,
      clientX: 300,
      clientY: 250,
    });
    fireEvent.pointerMove(handle, { clientX: 320, clientY: 270 });
    expect(setPointerCapture).not.toHaveBeenCalled();
    expect(dialog.style.cssText).toBe(initialPosition);
  });

  it.each([
    ["top", 760, 440, 140, 320],
    ["right", 820, 480, 100, 260],
    ["bottom", 760, 520, 100, 320],
    ["left", 700, 480, 100, 320],
    ["top-left", 700, 440, 140, 320],
    ["top-right", 820, 440, 140, 260],
    ["bottom-left", 700, 520, 100, 320],
    ["bottom-right", 820, 520, 100, 260],
  ] as const)(
    "resizes from %s and preserves size when changing sections",
    async (direction, width, height, top, right) => {
      renderSettings({ overlay: { type: "user-settings" } });
      const dialog = await screen.findByRole("dialog");
      vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue(
        new DOMRect(200, 100, 760, 480),
      );
      vi.spyOn(dialog.parentElement!, "getBoundingClientRect").mockReturnValue(
        new DOMRect(0, 0, 1280, 900),
      );
      const handle = screen.getByRole("button", {
        name: `Resize User settings from ${direction}`,
      });
      handle.setPointerCapture = vi.fn();
      handle.releasePointerCapture = vi.fn();
      fireEvent.pointerDown(handle, { button: 0, clientX: 200, clientY: 100 });
      fireEvent.pointerMove(handle, { clientX: 260, clientY: 140 });
      fireEvent.pointerUp(handle);
      expect(dialog.style.getPropertyValue("--floating-panel-width")).toContain(
        `${width}px`,
      );
      expect(
        dialog.style.getPropertyValue("--floating-panel-height"),
      ).toContain(`${height}px`);
      expect(dialog.style.getPropertyValue("--floating-panel-top")).toContain(
        `${top}px`,
      );
      expect(dialog.style.getPropertyValue("--floating-panel-right")).toContain(
        `${right}px`,
      );
      const sizeProperties = [
        "--floating-panel-width",
        "--floating-panel-height",
        "--floating-panel-top",
        "--floating-panel-right",
      ];
      const resizedStyle = sizeProperties.map((property) =>
        dialog.style.getPropertyValue(property),
      );
      fireEvent.click(screen.getByRole("tab", { name: "Viewport" }));
      await screen.findByRole("heading", { name: "Viewport" });
      expect(
        sizeProperties.map((property) =>
          dialog.style.getPropertyValue(property),
        ),
      ).toEqual(resizedStyle);
    },
  );

  it.each(["edit", "simulate", "actual"] as const)(
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

  it("offers settings without simulation feature flags", async () => {
    renderSettings(
      { overlay: { type: "user-settings" } },
      { kind: "connected", connect: vi.fn() },
    );
    await screen.findByRole("heading", { name: "General" });
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "General",
      "Viewport",
      "Labs",
    ]);
    for (const name of [
      "WebGPU",
      "Parameter sweeps",
      "In-browser optimization",
    ]) {
      expect(screen.queryByRole("checkbox", { name })).toBeNull();
    }
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
      screen.getByRole("checkbox", { name: "Petricon" }),
    );
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(
      screen.getByRole("checkbox", {
        name: "Automatic arc connections",
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

describe("Labs settings", () => {
  it("offers Notebook directly in Edit without a Labs setting", async () => {
    renderSettings({ overlay: { type: "user-settings", section: "labs" } });
    await screen.findByRole("heading", { name: "Labs" });
    expect(screen.queryByText("Notebook view")).toBeNull();
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

  it("renders host Labs content after the built-in groups", async () => {
    const withoutHost = renderSettings({
      overlay: { type: "user-settings", section: "labs" },
    });
    await screen.findByRole("heading", { name: "Labs" });
    expect(
      screen.queryByRole("region", { name: "Host AI settings" }),
    ).toBeNull();
    withoutHost.unmount();

    renderSettings(
      { overlay: { type: "user-settings", section: "labs" } },
      null,
      <section aria-label="Host AI settings">
        <button type="button">Use Brunch</button>
      </section>,
    );
    await screen.findByRole("heading", { name: "Labs" });
    expect(
      screen.getByRole("region", { name: "Host AI settings" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Use Brunch" })).toBeTruthy();
  });
});

describe("WebGPU availability", () => {
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
      name: "Petricon",
    });
    expect((iconPack as HTMLInputElement).checked).toBe(true);
    expect(
      screen.getByText("Petricon", { exact: true }).parentElement?.textContent,
    ).toBe("Petricon");
    expect(
      screen.getByText("Automatic arc connections", { exact: true })
        .parentElement?.textContent,
    ).toBe("Automatic arc connections");
    await act(async () => fireEvent.click(iconPack));
    await act(async () =>
      fireEvent.click(
        screen.getByRole("checkbox", {
          name: "Automatic arc connections",
        }),
      ),
    );
    first.unmount();
    renderSettings({ overlay: { type: "user-settings", section: "viewport" } });
    expect(
      (
        (await screen.findByRole("checkbox", {
          name: "Petricon",
        })) as HTMLInputElement
      ).checked,
    ).toBe(false);
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Automatic arc connections",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    expect(
      screen.queryByRole("combobox", { name: "Arc rendering" }),
    ).toBeNull();
  });
});
