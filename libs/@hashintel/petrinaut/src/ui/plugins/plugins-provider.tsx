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

import { memo, type ReactNode, use, useLayoutEffect, useState } from "react";

import { ReadOnlyActionContext } from "../../react/read-only-action-context";
import { useUserSettings } from "../../react/state/user-settings-context";
import { pluginRuntime } from "./define-petrinaut-plugin";
import { accessApi } from "./plugin-access";
import { PluginBoundary } from "./plugin-boundary";
import { PluginCommandRegistrations } from "./plugin-commands";
import { type PluginEditorRuntime, usePluginEditor } from "./plugin-editor";
import { PluginEditorProvider } from "./plugin-editor-provider";
import { type PluginSettings, usePluginSettings } from "./plugin-settings";
import {
  type PluginStatusEntry,
  resolvePluginStatuses,
} from "./plugin-statuses";
import {
  type ContributionsStore,
  createContributionsStore,
  PluginStatusesContext,
  PublishedContext,
  useRunningPluginsSelector,
} from "./running-plugins";

import type {
  PetrinautPlugin,
  PetrinautPluginManifest,
} from "./define-petrinaut-plugin";

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
 * Gives the view the read-only notice's action of the first running plugin
 * that declares one, and the host's own where none does.
 */
const ReadOnlyActionProvider = ({ children }: { children: ReactNode }) => {
  const hostAction = use(ReadOnlyActionContext);
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
    <ReadOnlyActionContext
      value={
        label === undefined || run === undefined
          ? hostAction
          : { label, onClick: run }
      }
    >
      {children}
    </ReadOnlyActionContext>
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
  const disabledPluginIds = useUserSettings(
    (settings) => settings.disabledPluginIds,
  );
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
