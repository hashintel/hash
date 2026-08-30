import { describe, expect, it, vi } from "vitest";

import {
  combineCommandRegistries,
  createCommandRegistry,
} from "./command-registry";

import type { Command } from "./command-registry";

const command = (overrides: Partial<Command> & { id: string }): Command => ({
  label: overrides.id,
  run: () => {},
  ...overrides,
});

describe("createCommandRegistry", () => {
  it("registers, lists, finds, and executes commands", () => {
    const registry = createCommandRegistry();
    const run = vi.fn();
    registry.register(command({ id: "a", label: "Alpha", run }));

    expect(registry.list().map((entry) => entry.id)).toEqual(["a"]);
    expect(registry.find("a")?.label).toBe("Alpha");
    expect(registry.execute("a")).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    expect(registry.execute("missing")).toBe(false);
  });

  it("notifies on membership and observable changes, silently on run refreshes", () => {
    const registry = createCommandRegistry();
    const listener = vi.fn();
    registry.subscribe(listener);

    registry.register(command({ id: "a", label: "Alpha" }));
    expect(listener).toHaveBeenCalledTimes(1);

    const before = registry.list();
    const freshRun = vi.fn();
    registry.register(command({ id: "a", label: "Alpha", run: freshRun }));
    expect(listener).toHaveBeenCalledTimes(1);
    // Same snapshot identity, but executing runs the fresh closure.
    expect(registry.list()).toBe(before);
    registry.execute("a");
    expect(freshRun).toHaveBeenCalledTimes(1);

    registry.register(command({ id: "a", label: "Alpha!" }));
    expect(listener).toHaveBeenCalledTimes(2);
    expect(registry.list()).not.toBe(before);
  });

  it("removes on unregister and via the registration disposer", () => {
    const registry = createCommandRegistry();
    const dispose = registry.register(command({ id: "a" }));
    registry.register(command({ id: "b" }));

    registry.unregister("b");
    expect(registry.list().map((entry) => entry.id)).toEqual(["a"]);

    dispose();
    expect(registry.list()).toEqual([]);
  });

  it("lets a replacement survive the stale registration's disposer", () => {
    const registry = createCommandRegistry();
    const disposeFirst = registry.register(command({ id: "a", label: "One" }));
    registry.register(command({ id: "a", label: "Two" }));

    disposeFirst();
    expect(registry.find("a")?.label).toBe("Two");
  });

  it("warns when two commands declare the same shortcut", () => {
    const consoleRef = (
      globalThis as unknown as { console: { warn: (text: string) => void } }
    ).console;
    const warn = vi.spyOn(consoleRef, "warn").mockImplementation(() => {});
    const registry = createCommandRegistry();
    registry.register(command({ id: "a", shortcut: "mod+k" }));
    registry.register(command({ id: "b", shortcut: "mod+k" }));
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe("combineCommandRegistries", () => {
  it("unions reads, delegates execute, and forwards notifications", () => {
    const first = createCommandRegistry();
    const second = createCommandRegistry();
    const combined = combineCommandRegistries(first, second);
    const listener = vi.fn();
    combined.subscribe(listener);

    const run = vi.fn();
    first.register(command({ id: "app.one" }));
    second.register(command({ id: "petrinaut.two", run }));

    expect(combined.list().map((entry) => entry.id)).toEqual([
      "app.one",
      "petrinaut.two",
    ]);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(combined.find("petrinaut.two")).toBeDefined();
    expect(combined.execute("petrinaut.two")).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);

    second.unregister("petrinaut.two");
    expect(combined.list().map((entry) => entry.id)).toEqual(["app.one"]);
  });
});
