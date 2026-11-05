/** @vitest-environment jsdom */
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { PluginCommandRegistrations } from "./plugin-commands";

import type { PluginCommand } from "./define-petrinaut-plugin";

afterEach(cleanup);

const register = (shortcut: string, run = vi.fn()) => {
  const manifest = {
    id: "test.shortcuts",
    name: "Shortcuts",
    commands: { toggle: { label: "Toggle", shortcut } },
  };
  const view = (commands: { toggle?: PluginCommand } = { toggle: { run } }) => (
    <PluginCommandRegistrations manifest={manifest} commands={commands} />
  );
  return { ...render(view()), run, view };
};

it.each<[string, KeyboardEventInit]>([
  ["mod+shift+f", { key: "F", metaKey: true, shiftKey: true }],
  ["mod+shift+f", { key: "F", ctrlKey: true, shiftKey: true }],
  [" CTRL + Alt + K ", { key: "k", ctrlKey: true, altKey: true }],
  ["meta+enter", { key: "Enter", metaKey: true }],
  ["shift+arrowup", { key: "ArrowUp", shiftKey: true }],
  ["f2", { key: "F2" }],
  ["space", { key: " " }],
])(
  "binds %s through the plugin manifest without a registry",
  (shortcut, keys) => {
    const { run } = register(shortcut);
    expect(fireEvent.keyDown(window, keys)).toBe(false);
    expect(run).toHaveBeenCalledOnce();
  },
);

it.each<KeyboardEventInit>([
  { key: "g", ctrlKey: true, shiftKey: true },
  { key: "f", shiftKey: true },
  { key: "f", ctrlKey: true },
  { key: "f", ctrlKey: true, shiftKey: true, altKey: true },
  { key: "f", ctrlKey: true, metaKey: true, shiftKey: true },
  { key: "f", ctrlKey: true, shiftKey: true, repeat: true },
  { key: "f", ctrlKey: true, shiftKey: true, isComposing: true },
])("leaves unmatched or repeated keys alone: %j", (keys) => {
  const { run } = register("mod+shift+f");
  expect(fireEvent.keyDown(window, keys)).toBe(true);
  expect(run).not.toHaveBeenCalled();
});

it.each<[string, KeyboardEventInit]>([
  ["", { key: "" }],
  ["mod+", { key: "", ctrlKey: true }],
  ["mod++f", { key: "f", ctrlKey: true }],
  ["mod+ctrl+f", { key: "f", ctrlKey: true }],
  ["shift+shift+f", { key: "f", shiftKey: true }],
  ["unknown+f", { key: "f" }],
])("ignores malformed shortcuts: %s", (shortcut, keys) => {
  const { run } = register(shortcut);
  expect(fireEvent.keyDown(window, keys)).toBe(true);
  expect(run).not.toHaveBeenCalled();
});

it("uses the latest handler and releases the shortcut when withheld, removed, or unmounted", () => {
  const { run, rerender, unmount, view } = register("mod+k");
  const updatedRun = vi.fn();
  rerender(view({ toggle: { run: updatedRun, when: true } }));
  fireEvent.keyDown(window, { key: "k", metaKey: true });
  expect(run).not.toHaveBeenCalled();
  expect(updatedRun).toHaveBeenCalledOnce();

  rerender(view({ toggle: { run: updatedRun, when: false } }));
  expect(fireEvent.keyDown(window, { key: "k", metaKey: true })).toBe(true);
  expect(updatedRun).toHaveBeenCalledOnce();

  rerender(view({}));
  expect(fireEvent.keyDown(window, { key: "k", metaKey: true })).toBe(true);

  rerender(view());
  unmount();
  expect(fireEvent.keyDown(window, { key: "k", metaKey: true })).toBe(true);
  expect(run).not.toHaveBeenCalled();
});

it("runs one matching command and respects events already handled elsewhere", () => {
  const first = register("mod+k");
  const second = register("mod+k");
  const handled = new KeyboardEvent("keydown", {
    key: "k",
    ctrlKey: true,
    cancelable: true,
  });
  handled.preventDefault();
  fireEvent(window, handled);
  expect(first.run).not.toHaveBeenCalled();
  expect(second.run).not.toHaveBeenCalled();
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  expect(first.run).toHaveBeenCalledOnce();
  expect(second.run).not.toHaveBeenCalled();
});

it("preserves typing in editable fields while allowing modified shortcuts", () => {
  const plain = register("f");
  const modified = register("mod+shift+f");
  const { getByRole, getByText } = render(
    <>
      <input aria-label="Name" />
      <div contentEditable suppressContentEditableWarning>
        <span>Text</span>
      </div>
    </>,
  );
  for (const target of [
    getByRole("textbox", { name: "Name" }),
    getByText("Text"),
  ]) {
    expect(fireEvent.keyDown(target, { key: "f" })).toBe(true);
    fireEvent.keyDown(target, { key: "F", metaKey: true, shiftKey: true });
  }
  expect(plain.run).not.toHaveBeenCalled();
  expect(modified.run).toHaveBeenCalledTimes(2);
});
