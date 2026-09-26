import type { PetrinautPlugin } from "./plugin";

/**
 * What `<Petrinaut>` installs before the host's plugins. Empty until the
 * editor's own features move onto the plugin API; a host replaces the set
 * through `PetrinautPluginsProvider`'s `builtInPlugins`.
 */
export const petrinautBuiltInPlugins: readonly PetrinautPlugin[] = [];
