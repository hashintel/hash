/**
 * Checks and ordering over a host's plugin list. Pure functions: they run
 * during render, and a failure is a configuration error of the host.
 */

import type { PetrinautPlugin } from "./define-petrinaut-plugin";
import type { PetrinautPluginManifest } from "./plugin-manifest";

/** The `[key, token]` pairs of a manifest's `provides` or `requires`. */
export const pluginTokenEntries = (
  tokens: PetrinautPluginManifest["requires"],
): [string, NonNullable<PetrinautPluginManifest["requires"]>[string]][] =>
  Object.entries(tokens ?? {});

/** Two plugins may not share an id. */
export const assertUniquePluginIds = (
  plugins: readonly PetrinautPlugin[],
): void => {
  const ids = new Set<string>();
  for (const plugin of plugins) {
    if (ids.has(plugin.manifest.id)) {
      throw new Error(
        `Petrinaut plugin "${plugin.manifest.id}" is passed twice. Pass each plugin once.`,
      );
    }
    ids.add(plugin.manifest.id);
  }
};

/**
 * Orders plugins so that the provider of every token a plugin requires,
 * optional or not, comes before it, keeping the host's order otherwise. Throws
 * on a missing required provider, two providers of one token, or a cycle,
 * naming the plugin ids.
 */
export const orderPluginsByDependencies = (
  plugins: readonly PetrinautPlugin[],
): readonly PetrinautPlugin[] => {
  const providerOf = new Map<string, PetrinautPlugin>();
  for (const plugin of plugins) {
    for (const [, token] of pluginTokenEntries(plugin.manifest.provides)) {
      const other = providerOf.get(token.id);
      if (other && other !== plugin) {
        throw new Error(
          `Petrinaut plugins "${other.manifest.id}" and "${plugin.manifest.id}" both provide "${token.id}". Pass one of them.`,
        );
      }
      providerOf.set(token.id, plugin);
    }
  }
  const ordered: PetrinautPlugin[] = [];
  const visiting = new Set<PetrinautPlugin>();
  const done = new Set<PetrinautPlugin>();
  const visit = (plugin: PetrinautPlugin, path: readonly string[]) => {
    if (done.has(plugin)) return;
    if (visiting.has(plugin)) {
      throw new Error(
        `Petrinaut plugins depend on each other in a cycle: ${[...path, plugin.manifest.id].join(" -> ")}.`,
      );
    }
    visiting.add(plugin);
    for (const [, token] of pluginTokenEntries(plugin.manifest.requires)) {
      const provider = providerOf.get(token.id);
      if (provider) {
        visit(provider, [...path, plugin.manifest.id]);
      } else if (token.required) {
        throw new Error(
          `Petrinaut plugin "${plugin.manifest.id}" requires "${token.id}", which no plugin passed to the editor provides.`,
        );
      }
    }
    visiting.delete(plugin);
    done.add(plugin);
    ordered.push(plugin);
  };
  for (const plugin of plugins) visit(plugin, []);

  return ordered;
};

/**
 * Splits plugins, given in dependency order, into the groups `requires`
 * connects: a plugin shares a group with the providers of its tokens, required
 * or optional, and with their other dependents. Each group keeps the given
 * order, so providers come before dependents; the groups follow their first
 * plugin. The editor nests the hosts of one group and renders the groups as
 * siblings, so a plugin leaving touches only its group.
 */
export const groupPluginsByDependencies = (
  plugins: readonly PetrinautPlugin[],
): readonly (readonly PetrinautPlugin[])[] => {
  const providerOf = new Map<string, PetrinautPlugin>();
  for (const plugin of plugins) {
    for (const [, token] of pluginTokenEntries(plugin.manifest.provides)) {
      providerOf.set(token.id, plugin);
    }
  }
  const neighbours = new Map<PetrinautPlugin, Set<PetrinautPlugin>>(
    plugins.map((plugin) => [plugin, new Set()]),
  );
  for (const plugin of plugins) {
    for (const [, token] of pluginTokenEntries(plugin.manifest.requires)) {
      const provider = providerOf.get(token.id);
      if (provider !== undefined && provider !== plugin) {
        neighbours.get(plugin)?.add(provider);
        neighbours.get(provider)?.add(plugin);
      }
    }
  }
  const groupOf = new Map<PetrinautPlugin, number>();
  const groups: PetrinautPlugin[][] = [];
  for (const plugin of plugins) {
    if (groupOf.has(plugin)) continue;
    const group = groups.length;
    groups.push([]);
    const pending = [plugin];
    groupOf.set(plugin, group);
    for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
      for (const neighbour of neighbours.get(next) ?? []) {
        if (!groupOf.has(neighbour)) {
          groupOf.set(neighbour, group);
          pending.push(neighbour);
        }
      }
    }
  }
  for (const plugin of plugins) {
    groups[groupOf.get(plugin) ?? 0]?.push(plugin);
  }

  return groups;
};

/**
 * One plugin passed to the editor, and whether it is switched on.
 * `usePetrinautPluginList` returns one per plugin, in dependency order.
 */
export interface PetrinautPluginStatus {
  /** The plugin as the host passed it. */
  readonly plugin: PetrinautPlugin;
  /**
   * Whether the plugin is switched on, along with every provider it requires.
   * Optional requirements do not count. A body that throws leaves it `true`.
   */
  readonly enabled: boolean;
  /**
   * Id of the plugin that keeps this one off; `null` while enabled. Its own id
   * when the user switched it off, otherwise a required provider that is off.
   */
  readonly disabledBy: string | null;
}

/**
 * The status of every plugin, in dependency order: a plugin is off when the
 * user switched it off, or when a plugin it requires is off. An optional
 * dependency that is off leaves the dependent running without it.
 */
export const resolvePluginStatuses = (
  plugins: readonly PetrinautPlugin[],
  disabledPluginIds: readonly string[],
): readonly PetrinautPluginStatus[] => {
  const ordered = orderPluginsByDependencies(plugins);
  const providerOf = new Map<string, PetrinautPlugin>();
  for (const plugin of ordered) {
    for (const [, token] of pluginTokenEntries(plugin.manifest.provides)) {
      providerOf.set(token.id, plugin);
    }
  }
  const disabledBy = new Map<string, string | null>();
  for (const plugin of ordered) {
    const { id } = plugin.manifest;
    const offProvider = pluginTokenEntries(plugin.manifest.requires)
      .filter(([, token]) => token.required)
      .map(([, token]) => providerOf.get(token.id))
      .find(
        (provider) =>
          provider !== undefined &&
          disabledBy.get(provider.manifest.id) !== null,
      );
    disabledBy.set(
      id,
      disabledPluginIds.includes(id) ? id : (offProvider?.manifest.id ?? null),
    );
  }

  return ordered.map((plugin) => {
    const off = disabledBy.get(plugin.manifest.id) ?? null;

    return { plugin, enabled: off === null, disabledBy: off };
  });
};
