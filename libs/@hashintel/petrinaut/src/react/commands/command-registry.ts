/**
 * @layerRoot react.commands
 * @role React bindings over the core command registry: the host-owned provider, and the hooks that declare commands and feed a palette
 */
import { createContext, use, useEffect, useSyncExternalStore } from "react";

import { useLatest } from "../hooks/use-latest";

import type { Command, CommandRegistry } from "@hashintel/petrinaut-core";

export const CommandRegistryContext = createContext<CommandRegistry | null>(
  null,
);

/** The ambient registry, or `null` outside a `CommandRegistryProvider`. */
export function useCommandRegistry(): CommandRegistry | null {
  return use(CommandRegistryContext);
}

const NO_COMMANDS: readonly Command[] = [];
const subscribeToNothing = () => () => {};

/**
 * The registry's commands, re-rendering the caller when the set changes.
 * Run one through `useCommandRegistry()?.execute(id)`.
 */
export function useCommands(): readonly Command[] {
  const registry = use(CommandRegistryContext);
  const getSnapshot = registry ? registry.list : () => NO_COMMANDS;
  return useSyncExternalStore(
    registry ? registry.subscribe : subscribeToNothing,
    getSnapshot,
    getSnapshot,
  );
}

/**
 * Registers `command` while the component is mounted and `when` holds.
 * `run` always sees the latest render; the registration itself is replaced
 * only when the id, label, category, keywords, or shortcut change, so
 * palettes are not notified on every render. A no-op outside a provider.
 */
export function useCommand(
  command: Command,
  options?: { when?: boolean },
): void {
  const registry = use(CommandRegistryContext);
  const active = options?.when ?? true;

  const latest = useLatest(command);

  const { id, label, category, shortcut } = command;
  const keywords = command.keywords?.join("\n");
  useEffect(() => {
    if (!registry || !active) {
      return;
    }
    return registry.register({
      ...latest.current,
      run: () => latest.current.run(),
    });
  }, [registry, active, latest, id, label, category, shortcut, keywords]);
}
