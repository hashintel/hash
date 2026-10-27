/**
 * Runs the plugins passed to an editor and carries what they return to it.
 *
 * Each running plugin gets one host, keyed by the plugin editor and its
 * `hostKey`, that calls its hook. The hosts render beside the editor view, not
 * around it: after each commit a host publishes its contributions to a store
 * the view reads, so a plugin switched on, off, failing or remounting never
 * remounts the view. A host also registers the plugin's declared commands in
 * the ambient command registry.
 */

import {
  createContext,
  memo,
  type ReactNode,
  use,
  useLayoutEffect,
  useState,
} from "react";

import {
  createReadableStore,
  type ReadableStore,
} from "@hashintel/petrinaut-core";

import { NetManagementContext } from "../../react/net-management-context";
import { UserSettingsContext } from "../../react/state/user-settings-context";
import { useStoreSelector } from "../../react/use-store";
import { pluginRuntime } from "./define-petrinaut-plugin";
import { accessApi } from "./plugin-access";
import { PluginBoundary } from "./plugin-boundary";
import { PluginCommandRegistrations } from "./plugin-commands";
import {
  type PluginEditorRuntime,
  PluginEditorProvider,
  usePluginEditor,
} from "./plugin-editor";
import { type PluginSettings, usePluginSettings } from "./plugin-settings";
import {
  type PluginStatusEntry,
  resolvePluginStatuses,
} from "./plugin-statuses";

import type {
  AnyPluginContributions,
  PetrinautPlugin,
  PetrinautPluginManifest,
  PluginDefinitionRef,
  ServiceOf,
} from "./define-petrinaut-plugin";

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

const createContributionsStore = () => {
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

type ContributionsStore = ReturnType<typeof createContributionsStore>;

/** Changes when a plugin switches on, off or fails. */
const PluginStatusesContext = createContext<readonly PluginStatusEntry[]>([]);

/** The contributions store, which never changes, so its readers re-render only on what they select. */
const PublishedContext = createContext<ReadableStore<Published>>(
  createReadableStore<Published>(new Map()),
);

/** Every plugin passed to the editor with its status, in the host's order. */
export const usePluginStatuses = (): readonly PluginStatusEntry[] =>
  use(PluginStatusesContext);

/**
 * A value selected from the running plugins, in the host's order; the caller
 * re-renders only when the selected value changes, as `isEqual` tells.
 */
export const useRunningPluginsSelector = <T,>(
  selector: (running: readonly RunningPlugin[]) => T,
  isEqual?: (previous: T, next: T) => boolean,
): T => {
  const statuses = use(PluginStatusesContext);

  return useStoreSelector(
    use(PublishedContext),
    (map) =>
      selector(
        statuses.flatMap(({ plugin }) => map.get(plugin.manifest.id) ?? []),
      ),
    isEqual,
  );
};

/** The running plugins with their latest contributions, in the host's order. */
export const useRunningPlugins = (): readonly RunningPlugin[] =>
  useRunningPluginsSelector((running) => running);

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

/**
 * One plugin's `api`: a new object only when its settings snapshot changes.
 * Its family objects come from the host's editor, so they never change while
 * the host is mounted. The cast erases the type the manifest gives it, for the
 * hook's erased parameter.
 */
const usePluginApi = (
  manifest: PetrinautPluginManifest,
  editor: PluginEditorRuntime,
  settings: PluginSettings | undefined,
): never => {
  // It calls no hook, which `infer` mode would skip.
  "use memo";
  const errors = editor.errorsFor(manifest.id);
  const access = accessApi(editor.families, manifest.access ?? {});

  return {
    errors,
    notifications: editor.notifications,
    ...access,
    ...(settings && { settings }),
  } as never;
};

const PluginHostBody = ({
  plugin,
  editor,
  store,
}: {
  plugin: PetrinautPlugin;
  editor: PluginEditorRuntime;
  store: ContributionsStore;
}) => {
  // The hook differs per host, which the React Compiler cannot compile; a
  // host is keyed by its plugin's `hostKey`, so it calls one hook for life.
  "use no memo";
  const { manifest } = plugin;
  const settings = usePluginSettings(manifest);
  const api = usePluginApi(manifest, editor, manifest.settings && settings);
  const useHook = plugin[pluginRuntime].hook;
  const contributions = useHook(api);

  const instanceKey = `${editor.generation}:${plugin[pluginRuntime].hostKey}`;

  useLayoutEffect(
    () => store.publish({ manifest, instanceKey, contributions, settings }),
    [store, manifest, instanceKey, contributions, settings],
  );
  useLayoutEffect(
    () => () => store.withdraw(manifest.id),
    [store, manifest.id],
  );

  return (
    <PluginCommandRegistrations
      manifest={manifest}
      commands={contributions.commands}
    />
  );
};

/**
 * `memo` because the React Compiler skips the host: without it, a status
 * change re-renders every host and runs every hook. Its props stay the same
 * while the plugin runs under one plugin editor.
 */
const PluginHost = memo(PluginHostBody);

/**
 * One host per running plugin, in a boundary that records its failure. A new
 * plugin editor, as a `readonly` toggle makes, remounts them all, so a host's
 * `api` families never change.
 */
const PluginHosts = ({
  statuses,
  store,
  onFail,
}: {
  statuses: readonly PluginStatusEntry[];
  store: ContributionsStore;
  onFail: (hostKey: string) => void;
}) => {
  const editor = usePluginEditor();

  return statuses.map(({ plugin, status }) =>
    status === "on" ? (
      <PluginBoundary
        key={`${editor.generation}:${plugin[pluginRuntime].hostKey}`}
        pluginId={plugin.manifest.id}
        place="hook"
        onError={() => onFail(plugin[pluginRuntime].hostKey)}
      >
        <PluginHost plugin={plugin} editor={editor} store={store} />
      </PluginBoundary>
    ) : null,
  );
};

/** Keeps the view's place in the DOM without adding a box to the layout. */
const viewSlotStyle = { display: "contents" } as const;

/**
 * Mounts the view in its first layout effect, which runs after the hosts', so
 * its first paint shows every contribution. The wrapper exists from the first
 * commit, so the view stays in the DOM before the portals it opens while
 * mounting.
 */
const ViewAfterHosts = ({ children }: { children: ReactNode }) => {
  const [shown, setShown] = useState(false);
  // eslint-disable-next-line react/set-state-in-effect -- the second render before paint is the point: the hosts have published by now
  useLayoutEffect(() => setShown(true), []);

  return <div style={viewSlotStyle}>{shown ? children : null}</div>;
};

/**
 * Re-provides the host's net management to the view, with the read-only
 * notice's action of the first running plugin that declares one.
 */
const ReadOnlyActionProvider = ({ children }: { children: ReactNode }) => {
  const netManagement = use(NetManagementContext);
  const plugin = useRunningPluginsSelector((running) =>
    running.find(
      ({ manifest, contributions }) =>
        manifest.readOnlyAction !== undefined &&
        contributions.readOnlyAction !== undefined,
    ),
  );
  const label = plugin?.manifest.readOnlyAction?.label;
  const run = plugin?.contributions.readOnlyAction?.run;

  return (
    <NetManagementContext
      value={
        label === undefined || run === undefined
          ? netManagement
          : { ...netManagement, readOnlyAction: { label, onClick: run } }
      }
    >
      {children}
    </NetManagementContext>
  );
};

/**
 * Runs `plugins` beside the editor view passed as `children`. `<Petrinaut>`
 * mounts it inside `<PetrinautProvider>`.
 */
export const PetrinautPluginsProvider = ({
  plugins,
  children,
}: {
  plugins: readonly PetrinautPlugin[];
  children: ReactNode;
}) => {
  const { disabledPluginIds } = use(UserSettingsContext);
  const [failedHostKeys, setFailedHostKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  // A plugin the user switches off forgets its failure, so switching it back
  // on runs its hook again.
  const [previousDisabledPluginIds, setPreviousDisabledPluginIds] =
    useState(disabledPluginIds);
  if (disabledPluginIds !== previousDisabledPluginIds) {
    setPreviousDisabledPluginIds(disabledPluginIds);
    setFailedHostKeys(
      new Set(
        plugins
          .filter(({ manifest }) => !disabledPluginIds.includes(manifest.id))
          .map((plugin) => plugin[pluginRuntime].hostKey)
          .filter((hostKey) => failedHostKeys.has(hostKey)),
      ),
    );
  }
  const [store] = useState(createContributionsStore);
  const statuses = resolvePluginStatuses(
    plugins,
    disabledPluginIds,
    failedHostKeys,
  );

  return (
    <PluginStatusesContext value={statuses}>
      <PublishedContext value={store.published}>
        <PluginEditorProvider>
          <PluginHosts
            statuses={statuses}
            store={store}
            onFail={(hostKey) =>
              setFailedHostKeys((keys) => new Set(keys).add(hostKey))
            }
          />
          <ViewAfterHosts>
            <ReadOnlyActionProvider>{children}</ReadOnlyActionProvider>
          </ViewAfterHosts>
        </PluginEditorProvider>
      </PublishedContext>
    </PluginStatusesContext>
  );
};
