/**
 * @layerRoot core.command-registry
 * @role User-invocable commands, registered by views and instances and rendered by the host as a palette
 *
 * A command is a labelled, argument-free action a person picks from a list.
 * The registry holds the current set and notifies subscribers when it
 * changes; the host renders it and runs entries by id. Petrinaut ships no
 * palette.
 *
 * Distinct from `instance.commands`, the schema-validated host operations:
 * a registry entry's `run` typically calls one of those.
 */

export interface Command {
  /** Stable, namespaced id, e.g. `petrinaut.edit.undo`. */
  id: string;
  /** What a palette shows, e.g. "Undo". */
  label: string;
  /** Palette grouping, e.g. "Edit". */
  category?: string;
  /** Extra search terms beyond the label. */
  keywords?: readonly string[];
  /** The chord to display, e.g. `mod+shift+z`. The registry binds no keys. */
  shortcut?: string;
  run: () => void;
}

/** The read side: everything a palette needs. */
export interface CommandRegistryView {
  /**
   * The commands in registration order. The same array is returned until
   * the set changes, so `useSyncExternalStore` can snapshot it.
   */
  list: () => readonly Command[];
  /** Runs the command with this id. Returns whether one was registered. */
  execute: (id: string) => boolean;
  subscribe: (listener: () => void) => () => void;
}

export interface CommandRegistry extends CommandRegistryView {
  /**
   * Adds the command, replacing a registration with the same id in place.
   * Returns a disposer that removes this registration; once the id has been
   * re-registered the disposer does nothing.
   */
  register: (command: Command) => () => void;
}

export function createCommandRegistry(): CommandRegistry {
  const commands = new Map<string, Command>();
  const listeners = new Set<() => void>();
  let snapshot: readonly Command[] = [];

  const notify = () => {
    snapshot = [...commands.values()];
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    register: (command) => {
      commands.set(command.id, command);
      notify();
      return () => {
        if (commands.get(command.id) === command) {
          commands.delete(command.id);
          notify();
        }
      };
    },
    list: () => snapshot,
    execute: (id) => {
      const command = commands.get(id);
      command?.run();
      return command !== undefined;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * One read view over several registries, for a palette fed by more than one
 * source (the host's own registry plus one per embedded component). Writes
 * stay on the sources.
 */
export function combineCommandRegistries(
  ...registries: readonly CommandRegistryView[]
): CommandRegistryView {
  let sources: readonly (readonly Command[])[] = [];
  let snapshot: readonly Command[] = [];
  return {
    list: () => {
      const current = registries.map((registry) => registry.list());
      if (current.some((commands, index) => commands !== sources[index])) {
        sources = current;
        snapshot = current.flat();
      }
      return snapshot;
    },
    execute: (id) => registries.some((registry) => registry.execute(id)),
    subscribe: (listener) => {
      const disposers = registries.map((registry) =>
        registry.subscribe(listener),
      );
      return () => {
        for (const dispose of disposers) {
          dispose();
        }
      };
    },
  };
}
