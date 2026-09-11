/** @vitest-environment jsdom */
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCommandRegistry } from "@hashintel/petrinaut-core";

import { CommandRegistryProvider } from "../../../react/commands/command-registry";
import { EditorCommands } from "./use-editor-commands";

vi.mock("../../../react", () => ({
  usePetrinautCommands: () => ({ applyAutoLayout: vi.fn() }),
}));

afterEach(cleanup);

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
