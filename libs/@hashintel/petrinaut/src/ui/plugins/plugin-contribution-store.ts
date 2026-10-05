/**
 * Where the running plugins meet the editor. Each plugin's host publishes the
 * contribution of its latest commit here, and the editor reads the store
 * through `useSyncExternalStore`. This is the one upward channel of the plugin
 * system: the hosts render beside the editor view rather than around it, so a
 * plugin joining, leaving or failing never remounts the view.
 */

import type { PetrinautPluginProvidersErased } from "./define-petrinaut-plugin";
import type { PetrinautPluginManifest } from "./plugin-manifest";
import type { PluginSettings } from "./plugin-settings";

/** A running plugin as the editor reads it: its manifest, its latest providers and its settings. */
export interface PetrinautPluginContribution {
  readonly manifest: PetrinautPluginManifest;
  readonly providers: PetrinautPluginProvidersErased;
  readonly settings: PluginSettings;
}

/** The published contributions by plugin id; a new map on every change. */
export type PluginContributions = ReadonlyMap<
  string,
  PetrinautPluginContribution
>;

export interface PluginContributionStore {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => PluginContributions;
  /**
   * Records a plugin's contribution. One whose manifest, providers and
   * settings are the recorded ones changes nothing, so a host re-rendering
   * with the same values does not re-render the editor.
   */
  readonly publish: (contribution: PetrinautPluginContribution) => void;
  /** Forgets a plugin whose host left. */
  readonly withdraw: (pluginId: string) => void;
  /**
   * Whether the hosts have committed once. The view mounts after that, so its
   * first paint shows every contribution instead of catching up a frame later.
   */
  readonly hasCommitted: () => boolean;
  /** Records the hosts' first commit; one way, notifying once. */
  readonly markCommitted: () => void;
}

export const createPluginContributionStore = (): PluginContributionStore => {
  let contributions: PluginContributions = new Map();
  let committed = false;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of listeners) listener();
  };

  return {
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => contributions,
    publish: (contribution) => {
      const { id } = contribution.manifest;
      const recorded = contributions.get(id);
      if (
        recorded !== undefined &&
        recorded.manifest === contribution.manifest &&
        recorded.providers === contribution.providers &&
        recorded.settings === contribution.settings
      ) {
        return;
      }
      contributions = new Map(contributions).set(id, contribution);
      emit();
    },
    withdraw: (pluginId) => {
      if (!contributions.has(pluginId)) return;
      const next = new Map(contributions);
      next.delete(pluginId);
      contributions = next;
      emit();
    },
    hasCommitted: () => committed,
    markCommitted: () => {
      if (committed) return;
      committed = true;
      emit();
    },
  };
};
