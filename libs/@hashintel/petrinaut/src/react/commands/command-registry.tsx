/**
 * @layerRoot react.commands
 * @role React bindings over the core command registry: the host-owned provider, and the hooks that declare commands and feed a palette
 */
import {
  createContext,
  use,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { createCommandRegistry } from "@hashintel/petrinaut-core";

import type { Command, CommandRegistry } from "@hashintel/petrinaut-core";
import type { ReactNode } from "react";

const CommandRegistryContext = createContext<CommandRegistry | null>(null);

/**
 * Provides a registry to the tree below. Pass `registry` to share one the
 * host also gives to `createPetrinaut` or to other components; without it
 * the provider creates its own.
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

const NO_COMMANDS: readonly Command[] = [];
const subscribeToNothing = () => () => {};

/**
 * The registry's commands, re-rendering the caller when the set changes.
 * Run one through `useCommandRegistry()?.execute(id)`.
 */
export function useCommands(): readonly Command[] {
  const registry = use(CommandRegistryContext);
  return useSyncExternalStore(
    registry ? registry.subscribe : subscribeToNothing,
    registry ? registry.list : () => NO_COMMANDS,
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

  const latest = useRef(command);
  useEffect(() => {
    latest.current = command;
  });

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
  }, [registry, active, id, label, category, shortcut, keywords]);
}
