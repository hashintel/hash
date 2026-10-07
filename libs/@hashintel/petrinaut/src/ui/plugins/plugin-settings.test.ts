/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { usePluginSettings } from "./plugin-settings";

const manifest = {
  id: "test.settings",
  name: "Settings",
  settings: {
    captions: { type: "boolean", default: true, label: "Captions" },
    speed: {
      type: "enum",
      options: ["slow", "fast"],
      default: "slow",
      label: "Speed",
    },
  },
} as const;

const storageKey = "petrinaut:plugin:test.settings";

beforeEach(() => {
  localStorage.clear();
});

describe("usePluginSettings", () => {
  it("drops unknown stored keys and reads a rejected value as the default", () => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ captions: "yes", speed: "fast", retired: true }),
    );

    expect(
      renderHook(() => usePluginSettings(manifest)).result.current.values,
    ).toEqual({ captions: true, speed: "fast" });
  });

  it("gives a new snapshot per change, persists it and throws on a rejected value", () => {
    const { result } = renderHook(() => usePluginSettings(manifest));
    const first = result.current;

    act(() => first.set("speed", "fast"));
    expect(result.current).not.toBe(first);
    expect(first.get("speed")).toBe("fast");
    expect(JSON.parse(localStorage.getItem(storageKey) ?? "")).toEqual({
      captions: true,
      speed: "fast",
    });
    expect(() => first.set("speed", "warp")).toThrow(
      'Plugin "test.settings" setting "speed" rejects "warp".',
    );
  });
});
