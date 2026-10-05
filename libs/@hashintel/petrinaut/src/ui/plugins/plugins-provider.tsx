/**
 * Runs the plugins passed to an editor and carries what they return to it.
 *
 * Each plugin gets one host component, keyed by its id, that calls the
 * plugin's body as a hook. The hosts render beside the editor view, not
 * around it: after each commit a host publishes what its body returned to a
 * store the view reads, so a plugin switched off, switched on or failing
 * never remounts the view. Plugins that `requires` connects nest instead,
 * providers around their dependents, so a dependent reads its providers'
 * values during the same render through context, and switching a provider
 * off remounts exactly the plugins that require it. A plugin the user
 * switched off in User settings gets no host, and neither do those plugins.
 */

import {
  Component,
  type ContextType,
  createContext,
  type ReactNode,
  use,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from "react";

import { ErrorTrackerContext } from "../../react/error-tracker-context";
import { UserSettingsContext } from "../../react/state/user-settings-context";
import {
  isAssistantShownFor,
  resolveActiveAssistantId,
} from "./active-assistant";
import {
  createPluginContributionStore,
  type PetrinautPluginContribution,
  type PluginContributions,
  type PluginContributionStore,
} from "./plugin-contribution-store";
import {
  assertUniquePluginIds,
  groupPluginsByDependencies,
  type PetrinautPluginStatus,
  pluginTokenEntries,
  resolvePluginStatuses,
} from "./plugin-dependencies";
import {
  type PluginSettings,
  readPluginSetting,
  usePluginSettings,
} from "./plugin-settings";

import type {
  PetrinautPlugin,
  PetrinautPluginApi,
  PetrinautPluginDocument,
  PetrinautPluginProvidersErased,
} from "./define-petrinaut-plugin";
import type { PetrinautPluginManifest } from "./plugin-manifest";

export type { PetrinautPluginContribution } from "./plugin-contribution-store";

const noStatuses: readonly PetrinautPluginStatus[] = [];
const PluginStatusesContext =
  createContext<readonly PetrinautPluginStatus[]>(noStatuses);

/** The store the hosts of the nearest editor publish to; none outside one. */
const PluginContributionStoreContext =
  createContext<PluginContributionStore | null>(null);

/** The services provided so far, by token id, for the hosts nested further in. */
const noServices: ReadonlyMap<string, unknown> = new Map();
const PluginServicesContext = createContext(noServices);

/** Whether the shown assistant has a chat for this document. */
export const AssistantPresenceContext = createContext(false);

const noContributions: PluginContributions = new Map();
const getNoContributions = () => noContributions;
const subscribeToNothing = () => () => {};

/** The contributions of the plugins that run, in dependency order, once their hosts have published. */
const runningContributions = (
  statuses: readonly PetrinautPluginStatus[],
  contributions: PluginContributions,
): readonly PetrinautPluginContribution[] =>
  statuses.flatMap(({ plugin, enabled }) => {
    const contribution = enabled
      ? contributions.get(plugin.manifest.id)
      : undefined;

    return contribution === undefined ? [] : [contribution];
  });

/** The running plugins of the nearest editor, in dependency order; none outside one. */
export const usePetrinautPlugins =
  (): readonly PetrinautPluginContribution[] => {
    const store = use(PluginContributionStoreContext);
    const statuses = use(PluginStatusesContext);
    const contributions = useSyncExternalStore(
      store?.subscribe ?? subscribeToNothing,
      store?.getSnapshot ?? getNoContributions,
      getNoContributions,
    );

    return runningContributions(statuses, contributions);
  };

/** Every plugin passed to the nearest editor, running or switched off, in dependency order. */
export const usePetrinautPluginList = (): readonly PetrinautPluginStatus[] =>
  use(PluginStatusesContext);

/**
 * One plugin's api for this render. A compiled hook, so the object keeps its
 * identity while its inputs do, and a compiled body returns the same
 * providers for it.
 */
const usePluginApi = (
  manifest: PetrinautPluginManifest,
  document: PetrinautPluginDocument,
  activeAssistantId: string | undefined,
  settings: PluginSettings,
  errorTracker: ContextType<typeof ErrorTrackerContext>,
  services: ReadonlyMap<string, unknown>,
): PetrinautPluginApi<PetrinautPluginManifest> => {
  const settingsApi = {
    get: (key: string) => readPluginSetting(settings, manifest.id, key),
    set: settings.set,
  };

  return {
    id: manifest.id,
    document,
    assistant: { isActive: isAssistantShownFor(manifest, activeAssistantId) },
    // Typed by the manifest at the plugin; here every key is a string.
    settings: settingsApi as never,
    flags: settingsApi as never,
    errors: {
      capture: (error, context) =>
        errorTracker.captureException(error, {
          source: context?.source ?? `plugin.${manifest.id}`,
          tags: { ...context?.tags, pluginId: manifest.id },
        }),
    },
    deps: Object.fromEntries(
      pluginTokenEntries(manifest.requires).map(([key, token]) => [
        key,
        services.get(token.id),
      ]),
    ) as never,
  };
};

/** The services for the hosts nested in this one: those it received, plus what its body provides. */
const useProvidedServices = (
  services: ReadonlyMap<string, unknown>,
  manifest: PetrinautPluginManifest,
  provides: PetrinautPluginProvidersErased["provides"],
): ReadonlyMap<string, unknown> =>
  manifest.provides === undefined
    ? services
    : new Map([
        ...services,
        ...pluginTokenEntries(manifest.provides).map(
          ([key, token]) => [token.id, provides?.[key]] as const,
        ),
      ]);

/**
 * Publishes the contribution of each commit after it, and withdraws it when
 * the host leaves. The store ignores a publish whose values it already holds.
 */
const usePublishedContribution = (
  store: PluginContributionStore,
  manifest: PetrinautPluginManifest,
  providers: PetrinautPluginProvidersErased,
  settings: PluginSettings,
) => {
  useLayoutEffect(() => {
    store.publish({ manifest, providers, settings });
  }, [store, manifest, providers, settings]);
  useLayoutEffect(
    () => () => {
      store.withdraw(manifest.id);
    },
    [store, manifest],
  );
};

type HostProps = {
  plugin: PetrinautPlugin;
  store: PluginContributionStore;
  document: PetrinautPluginDocument;
  activeAssistantId: string | undefined;
  /** The hosts of the plugins that require this one. */
  children: ReactNode;
};

const PluginHost = ({
  plugin,
  store,
  document,
  activeAssistantId,
  children,
}: HostProps) => {
  // The body is a hook chosen per host, which the React Compiler refuses to
  // compile ("hooks must be the same function on every render"); each host is
  // keyed by its plugin, so the body it calls never changes. The helper hooks
  // above, the bodies and the editor are compiled as usual.
  "use no memo";
  const { manifest } = plugin;
  const services = use(PluginServicesContext);
  const errorTracker = use(ErrorTrackerContext);
  const settings = usePluginSettings(manifest);
  const api = usePluginApi(
    manifest,
    document,
    activeAssistantId,
    settings,
    errorTracker,
    services,
  );

  // The body is a hook; the name says so to the rules of hooks. It is typed by
  // its own manifest.
  const useBody = plugin.body;
  const providers = useBody(api as never);
  usePublishedContribution(store, manifest, providers, settings);
  const provided = useProvidedServices(services, manifest, providers.provides);

  return (
    <PluginServicesContext value={provided}>{children}</PluginServicesContext>
  );
};

/**
 * Keeps a plugin whose body throws from taking the editor with it: the
 * failure reaches the host's error tracker, the plugin's contribution leaves
 * the store as its host unmounts, and the plugins requiring it leave with it.
 */
class PluginHostBoundary extends Component<HostProps, { failed: boolean }> {
  static contextType = ErrorTrackerContext;
  declare context: ContextType<typeof ErrorTrackerContext>;

  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    this.context.captureException(error, {
      source: "plugin.body",
      tags: { pluginId: this.props.plugin.manifest.id },
    });
  }

  render(): ReactNode {
    return this.state.failed ? null : <PluginHost {...this.props} />;
  }
}

/**
 * Rendered after the hosts and the view gate, so its layout effect runs once
 * the hosts have published and the gate listens: it records the hosts' first
 * commit.
 */
const HostsCommitted = ({ store }: { store: PluginContributionStore }) => {
  useLayoutEffect(() => {
    store.markCommitted();
  }, [store]);

  return null;
};

/** Keeps the view's place in the DOM without adding a box to the layout. */
const viewSlotStyle = { display: "contents" } as const;

/**
 * Mounts the view once the hosts have committed, so its first read of the
 * store is complete and its first paint shows every contribution.
 * `useSyncExternalStore` subscribes in a passive effect, too late for the
 * marker that fires in the layout phase of the same commit; this gate
 * subscribes in its own layout effect, which runs after the hosts' and before
 * `HostsCommitted`'s because of their order, and the state change re-renders
 * before the browser paints.
 *
 * The slot element exists from the first commit. Without it the view would be
 * inserted into its parent after the portals it opens while mounting, such as
 * a settings dialog restored from the URL, and would paint above them.
 */
const ViewAfterHosts = ({
  store,
  children,
}: {
  store: PluginContributionStore;
  children: ReactNode;
}) => {
  const [committed, setCommitted] = useState(store.hasCommitted);
  useLayoutEffect(
    () =>
      store.subscribe(() => {
        if (store.hasCommitted()) setCommitted(true);
      }),
    [store],
  );

  return <div style={viewSlotStyle}>{committed ? children : null}</div>;
};

/** Provides whether the shown assistant has a chat, as one boolean the canvas can read cheaply. */
const AssistantPresence = ({ children }: { children: ReactNode }) => {
  const contributions = usePetrinautPlugins();
  const { aiAssistantId } = use(UserSettingsContext);
  const activeId = resolveActiveAssistantId(
    contributions.map(({ manifest }) => manifest),
    aiAssistantId,
  );
  const active = contributions.find(({ manifest }) => manifest.id === activeId);
  const hasChat =
    active?.providers.assistant?.chat !== undefined &&
    active.providers.assistant.chat !== null;

  return (
    <AssistantPresenceContext value={hasChat}>
      {children}
    </AssistantPresenceContext>
  );
};

export type PetrinautPluginsProviderProps = {
  /** The plugins to run, each once; the first assistant provider is the default assistant. */
  plugins: readonly PetrinautPlugin[];
  /** The document the editor shows, as `api.document`. */
  document: PetrinautPluginDocument;
  children: ReactNode;
};

/**
 * Runs `plugins` beside the editor view rendered as `children`. `<Petrinaut>`
 * mounts this from its `plugins` prop, under the document's providers; a host
 * that renders the editor's parts itself mounts it where the user settings
 * are available.
 */
export const PetrinautPluginsProvider = ({
  plugins,
  document,
  children,
}: PetrinautPluginsProviderProps) => {
  assertUniquePluginIds(plugins);
  const { aiAssistantId, disabledPluginIds } = use(UserSettingsContext);
  const [store] = useState(createPluginContributionStore);
  const statuses = resolvePluginStatuses(plugins, disabledPluginIds);
  const running = statuses
    .filter(({ enabled }) => enabled)
    .map(({ plugin }) => plugin);
  const activeAssistantId = resolveActiveAssistantId(
    running.map(({ manifest }) => manifest),
    aiAssistantId,
  );
  // One nested chain per group of plugins `requires` connects, providers
  // outermost; the groups are siblings, so one plugin leaving touches no other
  // group. Each chain's outer host carries the key React matches it by.
  const hosts = groupPluginsByDependencies(running).map((group) =>
    group.reduceRight<ReactNode>(
      (inner, plugin) => (
        <PluginHostBoundary
          key={plugin.manifest.id}
          plugin={plugin}
          store={store}
          document={document}
          activeAssistantId={activeAssistantId}
        >
          {inner}
        </PluginHostBoundary>
      ),
      null,
    ),
  );

  return (
    <PluginStatusesContext value={statuses}>
      <PluginContributionStoreContext value={store}>
        {hosts}
        <ViewAfterHosts store={store}>
          <AssistantPresence>{children}</AssistantPresence>
        </ViewAfterHosts>
        <HostsCommitted store={store} />
      </PluginContributionStoreContext>
    </PluginStatusesContext>
  );
};
