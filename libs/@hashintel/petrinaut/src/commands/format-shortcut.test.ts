import { describe, expect, it } from "vitest";

import { formatShortcutKeys } from "./format-shortcut";

describe("formatShortcutKeys", () => {
  it("renders Apple symbols on Apple platforms", () => {
    expect(formatShortcutKeys("mod+shift+z", { apple: true })).toEqual([
      "⌘",
      "⇧",
      "Z",
    ]);
    expect(formatShortcutKeys("alt+enter", { apple: true })).toEqual([
      "⌥",
      "↩",
    ]);
  });

  it("renders key words elsewhere", () => {
    expect(formatShortcutKeys("mod+shift+z", { apple: false })).toEqual([
      "Ctrl",
      "Shift",
      "Z",
    ]);
    expect(formatShortcutKeys("mod+f", { apple: false })).toEqual([
      "Ctrl",
      "F",
    ]);
  });

  it("uppercases single keys and capitalizes unknown named keys", () => {
    expect(formatShortcutKeys("v", { apple: true })).toEqual(["V"]);
    expect(formatShortcutKeys("escape", { apple: false })).toEqual(["Esc"]);
    expect(formatShortcutKeys("f2", { apple: true })).toEqual(["F2"]);
  });
});
