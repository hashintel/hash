/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, renderHook } from "@testing-library/react";
import { type ReactNode, use } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCommandRegistry } from "@hashintel/petrinaut-core";

import { CommandRegistryProvider } from "../../../react/commands/command-registry";
import { EditorContext } from "../../../react/state/editor-context";
import { SDCPNContext } from "../../../react/state/sdcpn-context";
import { InstalledPluginsProvider } from "../../plugins/installed-plugins";
import { definePetrinautPlugin } from "../../plugins/plugin";
import { EditorCommands } from "./use-editor-commands";

vi.mock("../../../react", () => ({
  usePetrinautCommands: () => ({ applyAutoLayout: vi.fn() }),
}));

const EditableNet = ({ children }: { children: ReactNode }) => {
  const sdcpn = use(SDCPNContext);
  return (
    <SDCPNContext value={{ ...sdcpn, readonly: false }}>
      {children}
    </SDCPNContext>
  );
};

afterEach(cleanup);

describe("auto-layout shortcut", () => {
  it.each(["metaKey", "ctrlKey"])(
    "shows the binding in the palette and runs the same layout-and-fit action with %s",
    (modifier) => {
      const registry = createCommandRegistry();
      const layout = vi.fn(async () => {});
      render(
        <CommandRegistryProvider registry={registry}>
          <EditorCommands applyAutoLayoutAndFrame={layout} />
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
    const layout = vi.fn(async () => {});
    const { getByRole } = render(
      <>
        <input aria-label="Name" />
        <EditorCommands applyAutoLayoutAndFrame={layout} />
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
    const layout = vi.fn(async () => {});
    const { rerender } = render(
      <SDCPNContext value={{ ...defaults.sdcpn, readonly: true }}>
        <EditorCommands applyAutoLayoutAndFrame={layout} />
      </SDCPNContext>,
      { wrapper: EditableNet },
    );
    fireEvent.keyDown(window, { key: "l", ctrlKey: true, shiftKey: true });
    rerender(
      <EditorContext value={{ ...defaults.editor, globalMode: "simulate" }}>
        <EditorCommands applyAutoLayoutAndFrame={layout} />
      </EditorContext>,
    );
    fireEvent.keyDown(window, { key: "l", ctrlKey: true, shiftKey: true });
    expect(layout).not.toHaveBeenCalled();
  });

  it("follows the Canvas when the location names an edit view nothing provides", () => {
    const editor = renderHook(() => use(EditorContext)).result.current;
    const layout = vi.fn(async () => {});
    const plugin = definePetrinautPlugin({
      id: "test.views",
      editViews: [
        { id: "test-view", label: "Test view", component: () => null },
      ],
    });
    const renderIn = (editViewMode: string) => (
      <InstalledPluginsProvider plugins={[plugin]}>
        <EditorContext value={{ ...editor, editViewMode }}>
          <EditorCommands applyAutoLayoutAndFrame={layout} />
        </EditorContext>
      </InstalledPluginsProvider>
    );
    const { rerender } = render(renderIn("stale-view"), {
      wrapper: EditableNet,
    });
    fireEvent.keyDown(window, { key: "l", ctrlKey: true, shiftKey: true });
    expect(layout).toHaveBeenCalledOnce();

    rerender(renderIn("test-view"));
    fireEvent.keyDown(window, { key: "l", ctrlKey: true, shiftKey: true });
    expect(layout).toHaveBeenCalledOnce();
  });
});

describe("AI assistant command", () => {
  it("registers only when an assistant is available and uses the latest action", () => {
    const registry = createCommandRegistry();
    const toggle = vi.fn();
    const updatedToggle = vi.fn();
    const { rerender, unmount } = render(
      <CommandRegistryProvider registry={registry}>
        <EditorCommands />
      </CommandRegistryProvider>,
    );
    const aiCommand = () =>
      registry
        .list()
        .find((command) => command.id === "petrinaut.ai-assistant.toggle");
    expect(aiCommand()).toBeUndefined();
    rerender(
      <CommandRegistryProvider registry={registry}>
        <EditorCommands onToggleAiAssistant={toggle} />
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
        <EditorCommands onToggleAiAssistant={updatedToggle} />
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
          <EditorCommands onToggleAiAssistant={toggle} />
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
    render(<EditorCommands onToggleAiAssistant={toggle} />);
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
