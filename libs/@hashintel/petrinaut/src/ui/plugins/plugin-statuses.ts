import type { PetrinautPlugin } from "./define-petrinaut-plugin";

/**
 * - `on`: the plugin runs.
 * - `off`: the user switched it off in User settings.
 * - `failed`: its hook threw; it stays off until its module is replaced or another document opens.
 */
export type PluginStatus = "on" | "off" | "failed";

export interface PluginStatusEntry {
  readonly plugin: PetrinautPlugin;
  readonly status: PluginStatus;
}

/** Each plugin with its status, in the host's order. Throws when two plugins share an id. */
export const resolvePluginStatuses = (
  plugins: readonly PetrinautPlugin[],
  disabledPluginIds: readonly string[],
  failedHostKeys: ReadonlySet<string>,
): readonly PluginStatusEntry[] => {
  const seen = new Set<string>();

  return plugins.map((plugin) => {
    const { id } = plugin.manifest;
    if (seen.has(id)) {
      throw new Error(
        `Petrinaut plugin "${id}" is passed twice. Pass each plugin once.`,
      );
    }
    seen.add(id);

    return {
      plugin,
      status: disabledPluginIds.includes(id)
        ? "off"
        : failedHostKeys.has(plugin.hostKey)
          ? "failed"
          : "on",
    };
  });
};
