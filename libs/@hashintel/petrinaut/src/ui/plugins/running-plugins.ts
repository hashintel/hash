/**
 * The running plugins as the editor reads them: the store their hosts publish
 * their contributions to, and the hooks that select from it.
 */

import { createContext, use } from "react";

import {
  createReadableStore,
  type ReadableStore,
} from "@hashintel/petrinaut-core";

import { useStoreSelector } from "../../react/use-store";

import type {
  AnyPluginContributions,
  PetrinautPluginManifest,
  PluginDefinitionRef,
  ServiceOf,
} from "./define-petrinaut-plugin";
import type { PluginSettings } from "./plugin-settings";
import type { PluginStatusEntry } from "./plugin-statuses";

/** A running plugin as the editor reads it. */
export interface RunningPlugin {
  readonly manifest: PetrinautPluginManifest;
  /**
   * New for each host, so the outlets key a plugin's contributions by it and a
   * remounted host starts them afresh, failures included.
   */
  readonly instanceKey: string;
  /** What the hook returned in its latest committed render. */
  readonly contributions: AnyPluginContributions;
  readonly settings: PluginSettings;
}

type Published = ReadonlyMap<string, RunningPlugin>;

export const createContributionsStore = () => {
  const store = createReadableStore<Published>(new Map());

  return {
    published: store,
    publish: (running: RunningPlugin) =>
      store.set(new Map(store.get()).set(running.manifest.id, running)),
    withdraw: (pluginId: string) => {
      const next = new Map(store.get());
      if (next.delete(pluginId)) {
        store.set(next);
      }
    },
  };
};

export type ContributionsStore = ReturnType<typeof createContributionsStore>;

/** Changes when a plugin switches on, off or fails. */
export const PluginStatusesContext = createContext<
  readonly PluginStatusEntry[]
>([]);

/** The contributions store, which never changes, so its readers re-render only on what they select. */
export const PublishedContext = createContext<ReadableStore<Published>>(
  createReadableStore<Published>(new Map()),
);

/** Every plugin passed to the editor with its status, in the host's order. */
export const usePluginStatuses = (): readonly PluginStatusEntry[] =>
  use(PluginStatusesContext);

/**
 * A value selected from the running plugins, in the host's order; the caller
 * re-renders only when the selected value changes.
 */
export const useRunningPluginsSelector = <T>(
  selector: (running: readonly RunningPlugin[]) => T,
): T => {
  const statuses = use(PluginStatusesContext);

  return useStoreSelector(use(PublishedContext), (map) =>
    selector(
      statuses.flatMap(({ plugin }) => map.get(plugin.manifest.id) ?? []),
    ),
  );
};

/** The running plugins with their latest contributions, in the host's order. */
export const useRunningPlugins = (): readonly RunningPlugin[] =>
  useRunningPluginsSelector((running) => running);

/**
 * One running plugin with its latest contributions, or `undefined` while it
 * does not run. The caller re-renders when that plugin publishes, and for no
 * other.
 */
export const useRunningPlugin = (pluginId: string): RunningPlugin | undefined =>
  useStoreSelector(use(PublishedContext), (running) => running.get(pluginId));

/** Whether a running plugin's root covers the editor, as a modal or a tour does. */
export const usePluginOverlay = (): boolean =>
  useStoreSelector(use(PublishedContext), (running) =>
    [...running.values()].some(
      ({ contributions }) => contributions.overlay === true,
    ),
  );

/**
 * The service a plugin provides: its hook's latest `provides`, or `undefined`
 * while that plugin is not running or before its first publish. It adds no
 * dependency, so two plugins can read each other's services. Two services
 * built each from the other change each other's identity on every publish,
 * which never settles.
 */
export const usePluginService = <D extends PluginDefinitionRef>(
  definition: D,
): ServiceOf<D["manifest"]> | undefined =>
  useStoreSelector(
    use(PublishedContext),
    (running) => running.get(definition.manifest.id)?.contributions.provides,
  ) as ServiceOf<D["manifest"]> | undefined;
