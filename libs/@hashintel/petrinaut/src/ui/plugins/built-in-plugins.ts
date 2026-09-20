import { definitionsViewPlugin } from "./built-in-plugins/definitions-view-plugin";

import type { PetrinautPlugin } from "./plugin";

export { definitionsViewPlugin };

/**
 * What `<Petrinaut>` installs before the host's plugins. A host replaces the
 * set through `PetrinautPluginsProvider`'s `builtInPlugins`.
 */
export const petrinautBuiltInPlugins: readonly PetrinautPlugin[] = [
  definitionsViewPlugin,
];
