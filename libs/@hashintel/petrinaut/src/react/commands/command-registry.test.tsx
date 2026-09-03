/**
 * @vitest-environment jsdom
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCommandRegistry } from "@hashintel/petrinaut-core";

import {
  CommandRegistryProvider,
  useCommand,
  useCommands,
} from "./command-registry";

import type { CommandRegistry } from "@hashintel/petrinaut-core";

afterEach(cleanup);

const Declares: React.FC<{
  id: string;
  label?: string;
  when?: boolean;
  onRun?: () => void;
}> = ({ id, label = id, when, onRun }) => {
  useCommand({ id, label, run: onRun ?? (() => {}) }, { when });
  return null;
};

const ids = (registry: CommandRegistry): string[] =>
  registry.list().map((command) => command.id);

describe("useCommand", () => {
  it("registers while mounted and unregisters on unmount", () => {
    const registry = createCommandRegistry();
    const view = render(
      <CommandRegistryProvider registry={registry}>
        <Declares id="a" />
      </CommandRegistryProvider>,
    );
    expect(ids(registry)).toEqual(["a"]);

    view.unmount();
    expect(ids(registry)).toEqual([]);
  });

  it("follows the `when` predicate across re-renders", () => {
    const registry = createCommandRegistry();
    const view = render(
      <CommandRegistryProvider registry={registry}>
        <Declares id="a" when />
      </CommandRegistryProvider>,
    );
    expect(ids(registry)).toEqual(["a"]);

    view.rerender(
      <CommandRegistryProvider registry={registry}>
        <Declares id="a" when={false} />
      </CommandRegistryProvider>,
    );
    expect(ids(registry)).toEqual([]);

    view.rerender(
      <CommandRegistryProvider registry={registry}>
        <Declares id="a" when />
      </CommandRegistryProvider>,
    );
    expect(ids(registry)).toEqual(["a"]);
  });

  it("runs the latest closure without re-registering on every render", () => {
    const registry = createCommandRegistry();
    const listener = vi.fn();
    registry.subscribe(listener);
    const first = vi.fn();
    const second = vi.fn();
    const view = render(
      <CommandRegistryProvider registry={registry}>
        <Declares id="a" onRun={first} />
      </CommandRegistryProvider>,
    );
    view.rerender(
      <CommandRegistryProvider registry={registry}>
        <Declares id="a" onRun={second} />
      </CommandRegistryProvider>,
    );

    registry.execute("a");
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("is a no-op without a provider", () => {
    expect(() => render(<Declares id="a" />)).not.toThrow();
  });
});

describe("useCommands", () => {
  it("renders the live snapshot for palette consumers", () => {
    const registry = createCommandRegistry();
    const seen: string[][] = [];
    const Palette: React.FC = () => {
      seen.push(useCommands().map((command) => command.label));
      return null;
    };
    const view = render(
      <CommandRegistryProvider registry={registry}>
        <Declares id="a" label="Alpha" />
        <Palette />
      </CommandRegistryProvider>,
    );
    expect(seen.at(-1)).toEqual(["Alpha"]);

    view.rerender(
      <CommandRegistryProvider registry={registry}>
        <Declares id="a" label="Alpha!" />
        <Palette />
      </CommandRegistryProvider>,
    );
    expect(seen.at(-1)).toEqual(["Alpha!"]);
  });
});
