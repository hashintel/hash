/**
 * @layerRoot commands
 * @role React adapters over the core command registry: the host-owned provider, and the hooks views and palettes consume
 *
 * The registry itself is pure and lives in `@hashintel/petrinaut-core`
 * (`createCommandRegistry`), so hosts and the headless instance can use it
 * without React. This module adds the React seam: a host renders
 * `CommandRegistryProvider` around the editor (and around its own
 * components — nothing here is Petrinaut-specific), components declare
 * commands with `useCommand`, and a palette renders from `useCommands`.
 * Petrinaut ships no palette of its own.
 */
import { createContext, use, useState, useSyncExternalStore } from "react";

import { createCommandRegistry } from "@hashintel/petrinaut-core";

import type { Command, CommandRegistry } from "@hashintel/petrinaut-core";
import type { ReactNode } from "react";

export const CommandRegistryContext = createContext<CommandRegistry | null>(
  null,
);

/**
 * Provides a command registry to everything below. Pass `registry` to share
 * a host-owned one (e.g. also handed to `createPetrinaut`); without it the
 * provider creates a registry of its own.
 */
export const CommandRegistryProvider: React.FC<{
  registry?: CommandRegistry;
  children: ReactNode;
}> = ({ registry, children }) => {
  const [ownRegistry] = useState(() => registry ?? createCommandRegistry());
  return (
    <CommandRegistryContext value={registry ?? ownRegistry}>
      {children}
    </CommandRegistryContext>
  );
};

/** The ambient registry, or `null` outside a `CommandRegistryProvider`. */
export function useCommandRegistry(): CommandRegistry | null {
  return use(CommandRegistryContext);
}

const EMPTY_COMMANDS: readonly Command[] = [];
const subscribeToNothing = () => () => {};

/**
 * The current commands, as a live snapshot for palette rendering. Updates
 * when the observable surface changes (membership, labels, shortcuts);
 * invoke entries through `registry.execute(id)` so the freshest
 * registration runs.
 */
export function useCommands(): readonly Command[] {
  const registry = use(CommandRegistryContext);
  return useSyncExternalStore(
    registry ? registry.subscribe : subscribeToNothing,
    registry ? registry.list : () => EMPTY_COMMANDS,
  );
}
