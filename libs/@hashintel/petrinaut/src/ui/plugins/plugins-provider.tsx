import {
  createContext,
  use,
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  CommandRegistryProvider,
  useCommandRegistry,
} from "../../react/commands/command-registry";
import { ErrorTrackerContext } from "../../react/error-tracker-context";
import { UserSettingsProvider } from "../../react/state/user-settings-provider";
import { PluginContributionBoundary } from "./plugin-boundary";
import {
  createPluginRuntime,
  type InstalledPlugin,
  type PluginRuntime,
} from "./plugin-runtime";

import type { PetrinautPlugin } from "./define-petrinaut-plugin";
import type { PluginSettingsStorage } from "./plugin-settings-store";

const browserStorage = (): PluginSettingsStorage | undefined =>
  typeof localStorage === "undefined" ? undefined : localStorage;

const PluginRuntimeContext = createContext<PluginRuntime | null>(null);

export type PetrinautPluginsProviderProps = {
  /** The plugins to install, each once. Keep the array's identity stable across renders. */
  plugins: readonly PetrinautPlugin[];
  /** Where plugin settings persist. Defaults to `localStorage`. */
  settingsStorage?: PluginSettingsStorage;
  children: ReactNode;
};

const emptyRuntime = createPluginRuntime({
  errorTracker: { captureException: () => {} },
  storage: undefined,
});

/** The runtime of the nearest provider; an empty one outside any provider. */
export const usePluginRuntime = (): PluginRuntime =>
  use(PluginRuntimeContext) ?? emptyRuntime;

const emptyPlugins: readonly InstalledPlugin[] = [];

export const useInstalledPlugins = (): readonly InstalledPlugin[] => {
  const runtime = use(PluginRuntimeContext);
  const store = runtime?.installed;
  return useSyncExternalStore(
    (listener) => store?.subscribe(listener) ?? (() => {}),
    () => store?.get() ?? emptyPlugins,
  );
};

/** Mounts every installed plugin's root component, each behind its own boundary. */
const PluginRoots = () => {
  const plugins = useInstalledPlugins();
  return plugins.map(({ manifest, providers }) => {
    const Root = providers.root;
    return Root ? (
      <PluginContributionBoundary
        key={manifest.id}
        pluginId={manifest.id}
        contributionId="root"
        place="root"
      >
        <Root />
      </PluginContributionBoundary>
    ) : null;
  });
};

/**
 * Installs plugins for every `<Petrinaut>` below. Plugin bodies run once here
 * and outlive the documents the editor shows; a plugin leaves when it leaves
 * the `plugins` array. Plugins need the command registry and the user
 * settings, so both are provided when the host has not mounted them above.
 */
export const PetrinautPluginsProvider = ({
  plugins,
  settingsStorage,
  children,
}: PetrinautPluginsProviderProps) => {
  const errorTracker = use(ErrorTrackerContext);
  const [runtime] = useState(() =>
    createPluginRuntime({
      errorTracker,
      storage: settingsStorage ?? browserStorage(),
    }),
  );
  // Installed before paint; the installed-plugins store re-renders the
  // chrome in the same commit. `sync` is idempotent and also re-installs
  // after StrictMode's simulated unmount disposed everything.
  useLayoutEffect(() => {
    runtime.sync(plugins);
  }, [runtime, plugins]);
  useEffect(() => () => runtime.disposeAll(), [runtime]);

  const ambientRegistry = useCommandRegistry();
  const content = (
    <PluginRuntimeContext value={runtime}>
      <UserSettingsProvider>
        {children}
        <PluginRoots />
      </UserSettingsProvider>
    </PluginRuntimeContext>
  );
  return ambientRegistry ? (
    content
  ) : (
    <CommandRegistryProvider>{content}</CommandRegistryProvider>
  );
};
