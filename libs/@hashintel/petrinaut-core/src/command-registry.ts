/**
 * A registry of user-invocable commands, built for host applications to
 * render a command palette over. Views and the headless instance register
 * commands; hosts read them through `list`/`subscribe` and invoke them with
 * `execute`.
 *
 * Distinct from `instance.commands` (the composite, schema-validated host
 * operations): a registry entry is a labelled, argument-less action a person
 * picks from a list. The two meet when an entry's `run` calls into
 * `instance.commands` or `instance.mutations`.
 */

export interface Command {
  /** Stable, namespaced identifier, e.g. `petrinaut.mode.select`. */
  id: string;
  /** The text a palette shows, e.g. "Switch to the Select tool". */
  label: string;
  /** Palette grouping, e.g. "Canvas". */
  category?: string;
  /** Extra fuzzy-search terms beyond the label. */
  keywords?: string[];
  /**
   * Display metadata for the command's keyboard chord, e.g. `mod+shift+k`.
   * The registry does not bind keys; a dispatcher reading the registry does.
   */
  shortcut?: string;
  run: () => void;
}

/** The read side of a registry — all a palette needs. */
export interface CommandRegistryView {
  list: () => readonly Command[];
  find: (id: string) => Command | undefined;
  /** Run the current registration for `id`. Returns whether one existed. */
  execute: (id: string) => boolean;
  /**
   * Notified when the observable surface changes: membership, labels,
   * categories, keywords, or shortcuts. A re-registration that only
   * refreshes `run` is silent.
   */
  subscribe: (listener: () => void) => () => void;
}

export interface CommandRegistry extends CommandRegistryView {
  /**
   * Add or replace the command with this id. Returns a disposer removing
   * this registration (a later replacement survives its stale disposer).
   */
  register: (command: Command) => () => void;
  unregister: (id: string) => void;
}

const sameStringArray = (
  a: readonly string[] | undefined,
  b: readonly string[] | undefined,
): boolean =>
  a === b ||
  (a !== undefined &&
    b !== undefined &&
    a.length === b.length &&
    a.every((value, index) => value === b[index]));

/** Whether two registrations look the same to a palette. */
const sameObservableSurface = (a: Command, b: Command): boolean =>
  a.label === b.label &&
  a.category === b.category &&
  a.shortcut === b.shortcut &&
  sameStringArray(a.keywords, b.keywords);

// The core targets no particular runtime, so `console` is looked up rather
// than assumed.
const warn = (message: string): void => {
  (globalThis as { console?: { warn: (text: string) => void } }).console?.warn(
    message,
  );
};

const warnOnShortcutCollision = (
  commands: Map<string, Command>,
  next: Command,
): void => {
  if (!next.shortcut) {
    return;
  }
  for (const existing of commands.values()) {
    if (existing.id !== next.id && existing.shortcut === next.shortcut) {
      warn(
        `[petrinaut] commands "${existing.id}" and "${next.id}" both declare the shortcut "${next.shortcut}".`,
      );
      return;
    }
  }
};

export function createCommandRegistry(): CommandRegistry {
  const commands = new Map<string, Command>();
  const listeners = new Set<() => void>();
  // Snapshot identity only changes when the observable surface does, so a
  // subscribed palette is not re-rendered by every silent `run` refresh.
  // Silent refreshes splice the fresh command into the existing snapshot.
  let snapshot: Command[] = [];

  const notify = () => {
    snapshot = [...commands.values()];
    for (const listener of listeners) {
      listener();
    }
  };

  const registry: CommandRegistry = {
    register: (command) => {
      const previous = commands.get(command.id);
      warnOnShortcutCollision(commands, command);
      commands.set(command.id, command);
      if (previous && sameObservableSurface(previous, command)) {
        const index = snapshot.indexOf(previous);
        if (index !== -1) {
          snapshot[index] = command;
        }
      } else {
        notify();
      }
      return () => {
        if (commands.get(command.id) === command) {
          registry.unregister(command.id);
        }
      };
    },
    unregister: (id) => {
      if (commands.delete(id)) {
        notify();
      }
    },
    list: () => snapshot,
    find: (id) => commands.get(id),
    execute: (id) => {
      const command = commands.get(id);
      if (!command) {
        return false;
      }
      command.run();
      return true;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return registry;
}

/**
 * A read-only union over several registries, for a palette fed by more than
 * one source (a host registry plus one per embedded component). Writes stay
 * on each source registry.
 */
export function combineCommandRegistries(
  ...registries: CommandRegistryView[]
): CommandRegistryView {
  let snapshot: Command[] | null = null;
  return {
    list: () => {
      snapshot ??= registries.flatMap((registry) => registry.list());
      return snapshot;
    },
    find: (id) => {
      for (const registry of registries) {
        const command = registry.find(id);
        if (command) {
          return command;
        }
      }
      return undefined;
    },
    execute: (id) => registries.some((registry) => registry.execute(id)),
    subscribe: (listener) => {
      const forward = () => {
        snapshot = null;
        listener();
      };
      const disposers = registries.map((registry) =>
        registry.subscribe(forward),
      );
      return () => {
        for (const dispose of disposers) {
          dispose();
        }
      };
    },
  };
}
