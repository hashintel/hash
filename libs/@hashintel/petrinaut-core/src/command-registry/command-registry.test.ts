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

const ids = (commands: readonly Command[]): string[] =>
  commands.map((entry) => entry.id);

const labels = (commands: readonly Command[]): string[] =>
  commands.map((entry) => entry.label);

describe("createCommandRegistry", () => {
  it("registers, lists, and executes commands", () => {
    const registry = createCommandRegistry();
    const run = vi.fn();
    registry.register(command({ id: "a", run }));

    expect(ids(registry.list())).toEqual(["a"]);
    expect(registry.execute("a")).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    expect(registry.execute("missing")).toBe(false);
  });

  it("replaces a registration with the same id in place", () => {
    const registry = createCommandRegistry();
    registry.register(command({ id: "a" }));
    registry.register(command({ id: "b" }));
    registry.register(command({ id: "a", label: "Alpha" }));

    expect(labels(registry.list())).toEqual(["Alpha", "b"]);
  });

  it("notifies subscribers and keeps the snapshot stable between changes", () => {
    const registry = createCommandRegistry();
    const listener = vi.fn();
    registry.subscribe(listener);

    const dispose = registry.register(command({ id: "a" }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(registry.list()).toBe(registry.list());

    dispose();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(registry.list()).toEqual([]);
  });

  it("ignores the disposer of a replaced registration", () => {
    const registry = createCommandRegistry();
    const disposeFirst = registry.register(command({ id: "a", label: "One" }));
    registry.register(command({ id: "a", label: "Two" }));

    disposeFirst();
    expect(labels(registry.list())).toEqual(["Two"]);
  });
});

describe("combineCommandRegistries", () => {
  it("concatenates, delegates execute, and forwards notifications", () => {
    const first = createCommandRegistry();
    const second = createCommandRegistry();
    const combined = combineCommandRegistries(first, second);
    const listener = vi.fn();
    combined.subscribe(listener);

    const run = vi.fn();
    first.register(command({ id: "app.one" }));
    const dispose = second.register(command({ id: "petrinaut.two", run }));

    expect(ids(combined.list())).toEqual(["app.one", "petrinaut.two"]);
    expect(combined.list()).toBe(combined.list());
    expect(listener).toHaveBeenCalledTimes(2);
    expect(combined.execute("petrinaut.two")).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);

    dispose();
    expect(ids(combined.list())).toEqual(["app.one"]);
  });
});
