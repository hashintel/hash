import { afterEach, describe, expect, it, vi } from "vitest";

import { detectPlatform, resolveKeys } from "./kbd-util";

const labels = (
  keys: string | readonly string[],
  platform: "apple" | "pc",
): string[] => resolveKeys(keys, platform).map((key) => key.label);

const names = (
  keys: string | readonly string[],
  platform: "apple" | "pc",
): string[] => resolveKeys(keys, platform).map((key) => key.name);

describe("resolveKeys", () => {
  it("labels modifiers with glyphs on Apple platforms", () => {
    expect(labels("shift+mod+z", "apple")).toEqual(["⇧", "⌘", "Z"]);
    expect(labels("ctrl+alt+enter", "apple")).toEqual(["⌃", "⌥", "↩"]);
  });

  it("labels modifiers with words on PC", () => {
    expect(labels("mod+shift+z", "pc")).toEqual(["Ctrl", "Shift", "Z"]);
    expect(labels("ctrl+alt+enter", "pc")).toEqual(["Ctrl", "Alt", "Enter"]);
  });

  it("orders modifiers Control, Option, Shift, Command on Apple platforms", () => {
    expect(labels("mod+shift+alt+ctrl+k", "apple")).toEqual([
      "⌃",
      "⌥",
      "⇧",
      "⌘",
      "K",
    ]);
    expect(labels("mod+shift+z", "apple")).toEqual(["⇧", "⌘", "Z"]);
  });

  it("orders modifiers Windows, Ctrl, Alt, Shift on PC", () => {
    expect(labels("shift+alt+ctrl+meta+k", "pc")).toEqual([
      "Win",
      "Ctrl",
      "Alt",
      "Shift",
      "K",
    ]);
    expect(labels("shift+mod+z", "pc")).toEqual(["Ctrl", "Shift", "Z"]);
  });

  it("moves modifiers ahead of other keys, which keep their written order", () => {
    expect(labels("k+mod", "apple")).toEqual(["⌘", "K"]);
    expect(labels(["g", "i"], "pc")).toEqual(["G", "I"]);
    expect(labels("up+shift+down", "pc")).toEqual(["Shift", "↑", "↓"]);
  });

  it("names every key for assistive technology", () => {
    expect(names("mod+shift+,", "apple")).toEqual([
      "Shift",
      "Command",
      "Comma",
    ]);
    expect(names("mod+backspace", "pc")).toEqual(["Control", "Backspace"]);
  });

  it("matches key names case-insensitively, including KeyboardEvent.key values", () => {
    expect(labels(["Meta", "ArrowUp"], "apple")).toEqual(["⌘", "↑"]);
    expect(labels(["Control", "Escape", " "], "pc")).toEqual([
      "Ctrl",
      "Esc",
      "Space",
    ]);
  });

  it("uppercases unknown characters and capitalises unknown names", () => {
    expect(labels("k", "apple")).toEqual(["K"]);
    expect(labels("f2", "pc")).toEqual(["F2"]);
    expect(labels("CapsLock", "pc")).toEqual(["CapsLock"]);
  });

  it("shortens the long navigation and editing keys on both platforms", () => {
    for (const platform of ["apple", "pc"] as const) {
      expect(
        labels(["pageup", "pagedown", "insert", "printscreen"], platform),
      ).toEqual(["PgUp", "PgDn", "Ins", "PrtScn"]);
      expect(labels(["PageUp", "PgDn", "ins", "PrtScn"], platform)).toEqual([
        "PgUp",
        "PgDn",
        "Ins",
        "PrtScn",
      ]);
    }
    expect(names("ctrl+pageup", "pc")).toEqual(["Control", "Page Up"]);
    expect(names("printscreen", "pc")).toEqual(["Print Screen"]);
  });

  it("does not resolve inherited object properties as keys", () => {
    expect(labels("constructor", "pc")).toEqual(["Constructor"]);
  });

  it("renders a literal plus key by name or in the array form", () => {
    expect(labels("mod+plus", "apple")).toEqual(["⌘", "+"]);
    expect(labels(["mod", "+"], "apple")).toEqual(["⌘", "+"]);
  });

  it("ignores empty segments and surrounding whitespace", () => {
    expect(labels(" mod + k ", "apple")).toEqual(["⌘", "K"]);
    expect(labels("", "apple")).toEqual([]);
    expect(labels([], "apple")).toEqual([]);
  });
});

describe("detectPlatform", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads the platform from the browser's user agent", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh)" });
    expect(detectPlatform()).toBe("apple");

    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (X11; Linux)" });
    expect(detectPlatform()).toBe("pc");
  });

  it("falls back to PC where there is no browser", () => {
    vi.stubGlobal("navigator", undefined);
    expect(detectPlatform()).toBe("pc");
  });
});
