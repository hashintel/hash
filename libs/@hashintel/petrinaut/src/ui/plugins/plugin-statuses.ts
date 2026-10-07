import type {
  PetrinautPlugin,
  PetrinautPluginManifest,
} from "./define-petrinaut-plugin";

/**
 * - `on`: the plugin runs.
 * - `off`: the user switched it off in User settings.
 * - `needs-parent`: it extends an assistant whose plugin is not running.
 * - `failed`: its hook threw; it stays off until its module is replaced or another document opens.
 */
export type PluginStatus = "on" | "off" | "needs-parent" | "failed";

export interface PluginStatusEntry {
  readonly plugin: PetrinautPlugin;
  readonly status: PluginStatus;
}

/** The manifest of the plugin whose assistant `manifest` extends, if any. */
export const parentOf = (
  manifest: PetrinautPluginManifest,
): PetrinautPluginManifest | undefined => manifest.assistant?.extends?.manifest;

/**
 * Each plugin with its status, in the host's order. A plugin that extends an
 * assistant runs only while that assistant's plugin runs, matched by id.
 * Throws when two plugins share an id.
 */
export const resolvePluginStatuses = (
  plugins: readonly PetrinautPlugin[],
  disabledPluginIds: readonly string[],
  failedHostKeys: ReadonlySet<string>,
): readonly PluginStatusEntry[] => {
  const byId = new Map<string, PetrinautPlugin>();
  for (const plugin of plugins) {
    const { id } = plugin.manifest;
    if (byId.has(id)) {
      throw new Error(
        `Petrinaut plugin "${id}" is passed twice. Pass each plugin once.`,
      );
    }
    byId.set(id, plugin);
  }

  const statusOf = (plugin: PetrinautPlugin): PluginStatus => {
    if (disabledPluginIds.includes(plugin.manifest.id)) {
      return "off";
    }
    if (failedHostKeys.has(plugin.hostKey)) {
      return "failed";
    }
    const parentId = parentOf(plugin.manifest)?.id;
    const parent = parentId === undefined ? undefined : byId.get(parentId);

    return parentId === undefined ||
      (parent !== undefined && statusOf(parent) === "on")
      ? "on"
      : "needs-parent";
  };

  return plugins.map((plugin) => ({ plugin, status: statusOf(plugin) }));
};

/**
 * The plugin id of the assistant the editor shows: the user's choice while
 * its plugin runs, otherwise the first running assistant. A stale choice is
 * kept, so it applies again once its plugin is back.
 */
export const resolveActiveAssistantId = (
  statuses: readonly PluginStatusEntry[],
  chosenPluginId: string | null,
): string | undefined => {
  const assistants = statuses.flatMap(({ plugin, status }) =>
    status === "on" && plugin.manifest.assistant?.label !== undefined
      ? [plugin.manifest.id]
      : [],
  );

  return assistants.find((id) => id === chosenPluginId) ?? assistants[0];
};

/** Whether the editor shows the assistant `manifest` provides or extends. */
export const isAssistantActiveFor = (
  manifest: PetrinautPluginManifest,
  activeAssistantId: string | undefined,
): boolean =>
  activeAssistantId !== undefined &&
  (manifest.id === activeAssistantId ||
    parentOf(manifest)?.id === activeAssistantId);
