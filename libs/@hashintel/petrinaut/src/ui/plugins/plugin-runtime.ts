/**
 * The plugin runtime: installs plugins, runs their bodies, holds their
 * providers, and disposes them when they leave. One runtime per
 * `PetrinautPluginsProvider`; it outlives the documents the editor shows.
 */

import {
  createReadableStore,
  type ReadableStore,
} from "@hashintel/petrinaut-core";

import {
  createPluginSettingsStore,
  type PluginSettingsStorage,
  type PluginSettingsStore,
} from "./plugin-settings-store";

import type { ErrorTracker } from "../../react/error-tracker-context";
import type {
  PetrinautPlugin,
  PetrinautPluginApi,
  PetrinautPluginDocument,
  PetrinautPluginProvidersErased,
} from "./define-petrinaut-plugin";
import type { PetrinautPluginManifest } from "./plugin-manifest";

/** A plugin the runtime has installed: its manifest and what its body returned. */
export interface InstalledPlugin {
  readonly manifest: PetrinautPluginManifest;
  readonly providers: PetrinautPluginProvidersErased;
  /** The plugin's persisted settings and flags, for the settings dialog rows. */
  readonly settingsStore: PluginSettingsStore;
}

interface Installation extends InstalledPlugin {
  readonly plugin: PetrinautPlugin;
  readonly controller: AbortController;
  readonly cleanups: (() => void)[];
}

/** The assistant window's state, as Petrinaut reports it to plugins. */
export interface AssistantWindowState {
  readonly isOpen: boolean;
  readonly activeTab: string;
}

export interface PluginRuntime {
  readonly installed: ReadableStore<readonly InstalledPlugin[]>;
  readonly document: ReadableStore<PetrinautPluginDocument | null>;
  /** The plugin id whose assistant the editor shows, or `null`. */
  readonly activeAssistant: ReadableStore<string | null>;
  readonly window: ReadableStore<AssistantWindowState>;
  /** Installs the plugins not yet installed and disposes the ones no longer listed. */
  sync(plugins: readonly PetrinautPlugin[]): void;
  disposeAll(): void;
  setDocument(document: PetrinautPluginDocument | null): void;
  setActiveAssistant(pluginId: string | null): void;
  setWindow(state: AssistantWindowState): void;
}

/** A store whose value is a function of another store's value. */
const deriveStore = <T, U>(
  source: ReadableStore<T>,
  derive: (value: T) => U,
): ReadableStore<U> => ({
  get: () => derive(source.get()),
  subscribe(listener) {
    let previous = derive(source.get());
    return source.subscribe((value) => {
      const next = derive(value);
      if (Object.is(next, previous)) return;
      previous = next;
      listener(next);
    });
  },
});

const withoutUndefinedTokens = (
  tokens: PetrinautPluginManifest["requires"],
): [string, NonNullable<PetrinautPluginManifest["requires"]>[string]][] =>
  Object.entries(tokens ?? {});

/**
 * Orders plugins so that every provider of a required token comes before its
 * dependents. Throws on a missing required provider or a cycle, naming the
 * plugin ids, because both are configuration errors of the host.
 */
export const orderPluginsByDependencies = (
  plugins: readonly PetrinautPlugin[],
): readonly PetrinautPlugin[] => {
  const providerOf = new Map<string, PetrinautPlugin>();
  for (const plugin of plugins) {
    for (const [, token] of withoutUndefinedTokens(plugin.manifest.provides)) {
      const other = providerOf.get(token.id);
      if (other && other !== plugin) {
        throw new Error(
          `Petrinaut plugins "${other.manifest.id}" and "${plugin.manifest.id}" both provide "${token.id}". Install one of them.`,
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
    for (const [, token] of withoutUndefinedTokens(plugin.manifest.requires)) {
      const provider = providerOf.get(token.id);
      if (provider) {
        visit(provider, [...path, plugin.manifest.id]);
      } else if (token.required) {
        throw new Error(
          `Petrinaut plugin "${plugin.manifest.id}" requires "${token.id}", which no installed plugin provides.`,
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

/** Two plugins may not share an id, and two buttons or items may not share a place and key. */
const assertUniqueIds = (plugins: readonly PetrinautPlugin[]): void => {
  const ids = new Set<string>();
  for (const plugin of plugins) {
    if (ids.has(plugin.manifest.id)) {
      throw new Error(
        `Petrinaut plugin "${plugin.manifest.id}" is installed twice. Pass each plugin once.`,
      );
    }
    ids.add(plugin.manifest.id);
  }
};

export const createPluginRuntime = (input: {
  errorTracker: ErrorTracker;
  storage: PluginSettingsStorage | undefined;
}): PluginRuntime => {
  const installations = new Map<PetrinautPlugin, Installation>();
  const provided = new Map<string, unknown>();
  const installed = createReadableStore<readonly InstalledPlugin[]>([]);
  const document = createReadableStore<PetrinautPluginDocument | null>(null);
  const activeAssistant = createReadableStore<string | null>(null);
  const windowState = createReadableStore<AssistantWindowState>({
    isOpen: false,
    activeTab: "chat",
  });

  const publish = () => {
    installed.set(
      [...installations.values()].map(
        ({ manifest, providers, settingsStore }) => ({
          manifest,
          providers,
          settingsStore,
        }),
      ),
    );
  };

  const install = (plugin: PetrinautPlugin) => {
    const { manifest } = plugin;
    const controller = new AbortController();
    const cleanups: (() => void)[] = [];
    const settings = createPluginSettingsStore({
      pluginId: manifest.id,
      settings: manifest.settings,
      flags: manifest.flags,
      storage: input.storage,
    });
    const deps: Record<string, unknown> = {};
    for (const [key, token] of withoutUndefinedTokens(manifest.requires)) {
      deps[key] = provided.get(token.id);
    }
    const api: PetrinautPluginApi<PetrinautPluginManifest> = {
      id: manifest.id,
      signal: controller.signal,
      document,
      assistant: {
        isActive: deriveStore(activeAssistant, (id) => id === manifest.id),
        window: {
          isOpen: deriveStore(windowState, (state) => state.isOpen),
          activeTab: deriveStore(windowState, (state) => state.activeTab),
        },
      },
      // The store is typed by the manifest at the call site; here every key is a string.
      settings: settings as never,
      flags: settings as never,
      errors: {
        capture: (error, context) =>
          input.errorTracker.captureException(error, {
            source: context?.source ?? `plugin.${manifest.id}`,
            tags: { ...context?.tags, pluginId: manifest.id },
          }),
      },
      deps: deps as never,
      defer: (cleanup) => cleanups.push(cleanup),
    };
    // The body is typed by its own manifest; the runtime holds it erased.
    const providers = plugin.body(api as never);
    for (const [key, token] of withoutUndefinedTokens(manifest.provides)) {
      provided.set(token.id, providers.provides?.[key]);
    }
    installations.set(plugin, {
      plugin,
      manifest,
      providers,
      settingsStore: settings,
      controller,
      cleanups,
    });
  };

  const dispose = (installation: Installation) => {
    installations.delete(installation.plugin);
    for (const [, token] of withoutUndefinedTokens(
      installation.manifest.provides,
    )) {
      provided.delete(token.id);
    }
    installation.controller.abort();
    // Last registered, first released, as a disposable stack does.
    for (const cleanup of installation.cleanups.toReversed()) {
      try {
        cleanup();
      } catch (error) {
        input.errorTracker.captureException(error, {
          source: "plugin.dispose",
          tags: { pluginId: installation.manifest.id },
        });
      }
    }
  };

  return {
    installed,
    document,
    activeAssistant,
    window: windowState,
    sync(plugins) {
      assertUniqueIds(plugins);
      const wanted = new Set(plugins);
      // Dependents go before their providers, so a provider never outlives
      // the plugins that hold its value.
      const ordered = orderPluginsByDependencies(plugins);
      for (const installation of [...installations.values()].toReversed()) {
        if (!wanted.has(installation.plugin)) dispose(installation);
      }
      for (const plugin of ordered) {
        if (!installations.has(plugin)) install(plugin);
      }
      publish();
    },
    disposeAll() {
      for (const installation of [...installations.values()].toReversed()) {
        dispose(installation);
      }
      publish();
    },
    setDocument: (next) => document.set(next),
    setActiveAssistant: (pluginId) => activeAssistant.set(pluginId),
    setWindow(state) {
      const current = windowState.get();
      if (
        current.isOpen !== state.isOpen ||
        current.activeTab !== state.activeTab
      ) {
        windowState.set(state);
      }
    },
  };
};
