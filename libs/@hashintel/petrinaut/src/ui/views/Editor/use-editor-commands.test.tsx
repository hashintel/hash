/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, renderHook } from "@testing-library/react";
import { type ReactNode, use } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createCommandRegistry,
  type PetrinautRules,
} from "@hashintel/petrinaut-core";

import { CommandRegistryProvider } from "../../../react/commands/command-registry";
import { NetManagementContext } from "../../../react/net-management-context";
import { CompositionContext } from "../../../react/state/composition-context";
import { EditorContext } from "../../../react/state/editor-context";
import { SDCPNContext } from "../../../react/state/sdcpn-context";
import { EditorCommands } from "./use-editor-commands";

/** The layout the commands run: the auto-layout, then the fit of the canvas. */
const layout = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("../../../react", () => ({
  usePetrinautCommands: () => ({ applyAutoLayout: layout }),
}));

const EditableNet = ({ children }: { children: ReactNode }) => {
  const sdcpn = use(SDCPNContext);
  return (
    <SDCPNContext value={{ ...sdcpn, readonly: false }}>
      {children}
    </SDCPNContext>
  );
};

afterEach(() => {
  cleanup();
  layout.mockClear();
});

describe("new net command", () => {
  it("is listed only when the host can start a net, and starts one", () => {
    const registry = createCommandRegistry();
    const createNewNet = vi.fn();
    const loadPetriNet = vi.fn();
    const view = render(
      <CommandRegistryProvider registry={registry}>
        <EditorCommands canStartNet={false} />
      </CommandRegistryProvider>,
      { wrapper: EditableNet },
    );
    const isListed = () =>
      registry.list().some((command) => command.id === "petrinaut.net.new");
    expect(isListed()).toBe(false);

    view.rerender(
      <NetManagementContext
        value={{ title: "", existingNets: [], createNewNet, loadPetriNet }}
      >
        <CommandRegistryProvider registry={registry}>
          <EditorCommands canStartNet />
        </CommandRegistryProvider>
      </NetManagementContext>,
    );
    expect(isListed()).toBe(true);
    registry.execute("petrinaut.net.new");
    expect(createNewNet).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ title: "Untitled" }),
    );
  });
});

describe("drawing commands", () => {
  it("are not listed in an editor that only composes, where auto-layout stays", () => {
    const ids = (rules: PetrinautRules) => {
      const registry = createCommandRegistry();
      const Composing = ({ children }: { children: ReactNode }) => (
        <CompositionContext value={{ ...use(CompositionContext), rules }}>
          <EditableNet>{children}</EditableNet>
        </CompositionContext>
      );
      render(
        <CommandRegistryProvider registry={registry}>
          <EditorCommands canStartNet={false} />
        </CommandRegistryProvider>,
        { wrapper: Composing },
      );
      const listed = registry.list().map((command) => command.id);
      cleanup();
      return listed;
    };

    expect(ids({})).toEqual(
      expect.arrayContaining([
        "petrinaut.tool.add-place",
        "petrinaut.tool.add-transition",
        "petrinaut.net.auto-layout",
      ]),
    );
    const composing = ids({ edit: "compose" });
    expect(composing).toContain("petrinaut.net.auto-layout");
    expect(composing).not.toContain("petrinaut.tool.add-place");
    expect(composing).not.toContain("petrinaut.tool.add-transition");
  });
});

describe("auto-layout shortcut", () => {
  it.each(["metaKey", "ctrlKey"])(
    "shows the binding in the palette and runs the same layout-and-fit action with %s",
    (modifier) => {
      const registry = createCommandRegistry();
      render(
        <CommandRegistryProvider registry={registry}>
          <EditorCommands canStartNet={false} />
        </CommandRegistryProvider>,
        { wrapper: EditableNet },
      );
      expect(
        registry
          .list()
          .find((command) => command.id === "petrinaut.net.auto-layout"),
      ).toMatchObject({ shortcut: "mod+shift+l" });
      expect(
        fireEvent.keyDown(window, {
          key: "L",
          [modifier]: true,
          shiftKey: true,
        }),
      ).toBe(false);
      expect(layout).toHaveBeenCalledOnce();
      registry.execute("petrinaut.net.auto-layout");
      expect(layout).toHaveBeenCalledTimes(2);
    },
  );

  it("ignores typing, other modifiers, repeats, composition, and handled events", () => {
    const { getByRole } = render(
      <>
        <input aria-label="Name" />
        <EditorCommands canStartNet={false} />
      </>,
      { wrapper: EditableNet },
    );
    fireEvent.keyDown(getByRole("textbox"), {
      key: "L",
      ctrlKey: true,
      shiftKey: true,
    });
    for (const modifiers of [
      { ctrlKey: true },
      { metaKey: true },
      { ctrlKey: true, shiftKey: true, altKey: true },
      { ctrlKey: true, shiftKey: true, repeat: true },
      { ctrlKey: true, shiftKey: true, isComposing: true },
    ]) {
      expect(fireEvent.keyDown(window, { key: "l", ...modifiers })).toBe(true);
    }
    const handled = new KeyboardEvent("keydown", {
      key: "l",
      ctrlKey: true,
      shiftKey: true,
      cancelable: true,
    });
    handled.preventDefault();
    window.dispatchEvent(handled);
    expect(layout).not.toHaveBeenCalled();
  });

  it("respects read-only nets and simulation mode", () => {
    const defaults = renderHook(() => ({
      editor: use(EditorContext),
      sdcpn: use(SDCPNContext),
    })).result.current;
    const { rerender } = render(
      <SDCPNContext value={{ ...defaults.sdcpn, readonly: true }}>
        <EditorCommands canStartNet={false} />
      </SDCPNContext>,
      { wrapper: EditableNet },
    );
    fireEvent.keyDown(window, { key: "l", ctrlKey: true, shiftKey: true });
    rerender(
      <EditorContext value={{ ...defaults.editor, globalMode: "simulate" }}>
        <EditorCommands canStartNet={false} />
      </EditorContext>,
    );
    fireEvent.keyDown(window, { key: "l", ctrlKey: true, shiftKey: true });
    expect(layout).not.toHaveBeenCalled();
  });
});

describe("AI assistant command", () => {
  it("registers only when an assistant is available and uses the latest action", () => {
    const registry = createCommandRegistry();
    const toggle = vi.fn();
    const updatedToggle = vi.fn();
    const { rerender, unmount } = render(
      <CommandRegistryProvider registry={registry}>
        <EditorCommands canStartNet={false} />
      </CommandRegistryProvider>,
    );
    const aiCommand = () =>
      registry
        .list()
        .find((command) => command.id === "petrinaut.ai-assistant.toggle");
    expect(aiCommand()).toBeUndefined();
    rerender(
      <CommandRegistryProvider registry={registry}>
        <EditorCommands canStartNet={false} onToggleAiAssistant={toggle} />
      </CommandRegistryProvider>,
    );
    expect(aiCommand()).toMatchObject({
      label: "Toggle AI assistant",
      shortcut: "mod+shift+k",
    });
    registry.execute("petrinaut.ai-assistant.toggle");
    expect(toggle).toHaveBeenCalledOnce();
    rerender(
      <CommandRegistryProvider registry={registry}>
        <EditorCommands
          canStartNet={false}
          onToggleAiAssistant={updatedToggle}
        />
      </CommandRegistryProvider>,
    );
    registry.execute("petrinaut.ai-assistant.toggle");
    expect(updatedToggle).toHaveBeenCalledOnce();
    unmount();
    expect(aiCommand()).toBeUndefined();
  });

  it.each(["metaKey", "ctrlKey"])(
    "toggles before text-field handlers with %s + Shift + K without a palette provider",
    (modifier) => {
      const toggle = vi.fn();
      const { getByRole, unmount } = render(
        <>
          <input aria-label="Other input" />
          <EditorCommands canStartNet={false} onToggleAiAssistant={toggle} />
        </>,
      );
      const input = getByRole("textbox");
      const deleteLine = vi.fn((event: Event) => event.preventDefault());
      input.addEventListener("keydown", deleteLine);
      input.focus();
      expect(
        fireEvent.keyDown(input, {
          key: "K",
          [modifier]: true,
          shiftKey: true,
        }),
      ).toBe(false);
      expect(toggle).toHaveBeenCalledOnce();
      expect(deleteLine).not.toHaveBeenCalled();
      unmount();
      fireEvent.keyDown(window, { key: "K", [modifier]: true, shiftKey: true });
      expect(toggle).toHaveBeenCalledOnce();
    },
  );

  it("leaves other chords, composition, and handled events alone", () => {
    const toggle = vi.fn();
    render(<EditorCommands canStartNet={false} onToggleAiAssistant={toggle} />);
    for (const modifiers of [
      { metaKey: true },
      { shiftKey: true },
      { metaKey: true, shiftKey: true, altKey: true },
      { metaKey: true, shiftKey: true, isComposing: true },
      { metaKey: true, shiftKey: true, repeat: true },
    ]) {
      expect(fireEvent.keyDown(window, { key: "k", ...modifiers })).toBe(true);
    }
    const event = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      shiftKey: true,
      cancelable: true,
    });
    event.preventDefault();
    window.dispatchEvent(event);
    expect(toggle).not.toHaveBeenCalled();
  });
});
