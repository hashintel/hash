/**
 * Host content rendered at a named location in the editor. The top-bar
 * locations moved to plugins; only the Labs settings content remains, until
 * its host moves to a plugin too.
 *
 * @deprecated Install a plugin with a `settingsGroups` entry for the Labs
 * section through `PetrinautPluginsProvider` instead.
 */
export type PetrinautSlots = {
  /** Rendered after Petrinaut's built-in groups in the Labs settings section. */
  settingsLabs?: React.ReactNode;
};
