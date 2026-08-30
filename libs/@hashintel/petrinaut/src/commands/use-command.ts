import { use, useEffect } from "react";

import { CommandRegistryContext } from "./context";

import type { Command } from "@hashintel/petrinaut-core";

/**
 * Declares a command for as long as the component is mounted and `when`
 * holds. `when` is an ordinary render-computed boolean: the component
 * re-renders when the state behind it changes, so the command drops out of
 * the registry the moment the condition flips, with no extra wiring.
 *
 * Re-registers every render so the registry always holds the freshest `run`
 * closure — the registry treats a registration that only refreshes `run` as
 * silent, so this does not churn palette renders. Outside a
 * `CommandRegistryProvider` the hook is a no-op.
 */
export function useCommand(
  command: Command,
  options?: { when?: boolean },
): void {
  const registry = use(CommandRegistryContext);
  const active = options?.when ?? true;

  useEffect(() => {
    if (!registry) {
      return;
    }
    if (active) {
      registry.register(command);
    } else {
      registry.unregister(command.id);
    }
  });
  useEffect(
    () => () => registry?.unregister(command.id),
    [registry, command.id],
  );
}
