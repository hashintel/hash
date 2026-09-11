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
    const open = vi.fn();
    const updatedOpen = vi.fn();
    const { rerender, unmount } = render(
      <CommandRegistryProvider registry={registry}>
        <EditorCommands />
      </CommandRegistryProvider>,
    );
    const aiCommand = () =>
      registry
        .list()
        .find((command) => command.id === "petrinaut.ai-assistant.open");
    expect(aiCommand()).toBeUndefined();
    rerender(
      <CommandRegistryProvider registry={registry}>
        <EditorCommands onOpenAiAssistant={open} />
      </CommandRegistryProvider>,
    );
    expect(aiCommand()).toMatchObject({
      label: "Open AI assistant",
      shortcut: "mod+shift+k",
    });
    registry.execute("petrinaut.ai-assistant.open");
    expect(open).toHaveBeenCalledOnce();
    rerender(
      <CommandRegistryProvider registry={registry}>
        <EditorCommands onOpenAiAssistant={updatedOpen} />
      </CommandRegistryProvider>,
    );
    registry.execute("petrinaut.ai-assistant.open");
    expect(updatedOpen).toHaveBeenCalledOnce();
    unmount();
    expect(aiCommand()).toBeUndefined();
  });

  it.each(["metaKey", "ctrlKey"])(
    "opens before text-field handlers with %s + Shift + K without a palette provider",
    (modifier) => {
      const open = vi.fn();
      const { getByRole, unmount } = render(
        <>
          <input aria-label="Other input" />
          <EditorCommands onOpenAiAssistant={open} />
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
      expect(open).toHaveBeenCalledOnce();
      expect(deleteLine).not.toHaveBeenCalled();
      unmount();
      fireEvent.keyDown(window, { key: "K", [modifier]: true, shiftKey: true });
      expect(open).toHaveBeenCalledOnce();
    },
  );

  it("leaves other chords, composition, and handled events alone", () => {
    const open = vi.fn();
    render(<EditorCommands onOpenAiAssistant={open} />);
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
    expect(open).not.toHaveBeenCalled();
  });
});
