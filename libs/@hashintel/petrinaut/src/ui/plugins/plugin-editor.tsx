/**
 * The editor as plugins see it, one per core instance: the access families,
 * `errors` and `notifications`, built once from that instance. Their
 * actions read render-scoped editor state from stores that `PluginEditorSync`
 * updates in the layout phase of every commit, before the plugin hosts' and
 * the view's layout effects run.
 */

import {
  createContext,
  type ReactNode,
  use,
  useLayoutEffect,
  useState,
} from "react";

import { createReadableStore, type Petrinaut } from "@hashintel/petrinaut-core";

import { ErrorTrackerContext } from "../../react/error-tracker-context";
import { ExperimentHostContext } from "../../react/experiment-host/context";
import { ExperimentsContext } from "../../react/experiments/context";
import { useRevealInEditor } from "../../react/hooks/use-reveal-in-editor";
import { PetrinautInstanceContext } from "../../react/instance-context";
import { LanguageClientContext } from "../../react/lsp/context";
import { NetManagementContext } from "../../react/net-management-context";
import { NotificationsContext } from "../../react/notifications/context";
import { OptimizationsContext } from "../../react/optimizations/context";
import { ActiveNetContext } from "../../react/state/active-net-context";
import { useReadOnlyReason } from "../../react/state/use-read-only-reason";
import { createAccessFamilies } from "./plugin-access";
import { useCanvasControllerRegistration } from "./plugin-editor/use-canvas-controller-registration";

import type { ExperimentRecord } from "../../react/experiments/context";
import type {
  AccessFamilies,
  PluginEditorState,
  PluginErrors,
  PluginNotifications,
} from "./plugin-access";

type CanvasRegistration = ReturnType<typeof useCanvasControllerRegistration>;

/** Editor state from the editor's providers, as one render sees it. */
interface PluginEditorSnapshot {
  readonly state: PluginEditorState;
  readonly title: string;
  readonly records: readonly ExperimentRecord[];
  readonly optimizationUnavailableReason: string | null;
}

export interface PluginEditor {
  /** Counts the editors a provider has built; hosts key by it, so they remount with a new one. */
  readonly generation: number;
  readonly instance: Petrinaut;
  readonly families: AccessFamilies;
  readonly notifications: PluginNotifications;
  readonly errorsFor: (pluginId: string) => PluginErrors;
  /** Where the canvas registers its controller, so layouts can frame the net once drawn. */
  readonly canvas: CanvasRegistration;
  readonly sync: (snapshot: PluginEditorSnapshot) => void;
}

const createPluginEditor = (
  generation: number,
  instance: Petrinaut,
  canvas: CanvasRegistration,
  snapshot: PluginEditorSnapshot,
): PluginEditor => {
  const latest = createReadableStore(snapshot.state);
  const title = createReadableStore(snapshot.title);
  const records = createReadableStore(snapshot.records);
  const optimizationUnavailableReason = createReadableStore(
    snapshot.optimizationUnavailableReason,
  );

  return {
    generation,
    instance,
    canvas,
    families: createAccessFamilies({
      instance,
      latest,
      title,
      records,
      optimizationUnavailableReason,
      frameSceneAfterRender: canvas.frameSceneAfterRender,
    }),
    notifications: { add: (input) => latest.get().addNotification(input) },
    errorsFor: (pluginId) => ({
      capture: (error, context) =>
        latest.get().captureException(error, {
          source: context?.source ?? `plugin.${pluginId}`,
          tags: { ...context?.tags, pluginId },
        }),
    }),
    sync: (next) => {
      latest.set(next.state);
      title.set(next.title);
      records.set(next.records);
      optimizationUnavailableReason.set(next.optimizationUnavailableReason);
    },
  };
};

const usePluginEditorSnapshot = (): PluginEditorSnapshot => {
  const { title, setTitle } = use(NetManagementContext);
  const { activeSubnetId } = use(ActiveNetContext);
  const { experiments } = use(ExperimentsContext);
  const { optimizationUnavailableReason = null } = use(OptimizationsContext);
  const { runExperiment } = use(ExperimentHostContext);
  const { requestDiagnostics } = use(LanguageClientContext);
  const { addNotification } = use(NotificationsContext);
  const { captureException } = use(ErrorTrackerContext);
  const readOnlyReason = useReadOnlyReason();
  const reveal = useRevealInEditor();

  return {
    state: {
      readOnlyReason,
      activeSubnetId,
      setTitle,
      reveal,
      requestDiagnostics,
      runExperiment,
      addNotification,
      captureException,
    },
    title,
    records: experiments,
    optimizationUnavailableReason,
  };
};

const useCoreInstance = (): Petrinaut => {
  const instance = use(PetrinautInstanceContext);
  if (!instance) {
    throw new Error(
      "Petrinaut plugins must run inside <PetrinautProvider> (or <Petrinaut>).",
    );
  }

  return instance;
};

const PluginEditorContext = createContext<PluginEditor | null>(null);

/** The current plugin editor; only the plugin hosts read it. */
export const usePluginEditor = (): PluginEditor => {
  const editor = use(PluginEditorContext);
  if (!editor) {
    throw new Error("Plugin hosts must run inside PluginEditorProvider.");
  }

  return editor;
};

const detachedCanvas: CanvasRegistration = {
  frameSceneAfterRender: () => Promise.resolve("no-renderer"),
  registerController: () => {},
  requestFrameOnNextRegistration: () => {},
};

/** Where the canvas registers its controller; a no-op outside the editor. */
export const useCanvasRegistration = (): CanvasRegistration =>
  use(PluginEditorContext)?.canvas ?? detachedCanvas;

/** Copies the snapshot into the editor's stores, first in each commit's layout phase. */
const PluginEditorSync = ({
  editor,
  snapshot,
}: {
  editor: PluginEditor;
  snapshot: PluginEditorSnapshot;
}) => {
  useLayoutEffect(() => editor.sync(snapshot), [editor, snapshot]);

  return null;
};

/**
 * Builds a plugin editor for each core instance and keeps its stores current.
 * Reading the editor's providers re-renders this component and the sync, not
 * `children`.
 */
export const PluginEditorProvider = ({ children }: { children: ReactNode }) => {
  const instance = useCoreInstance();
  const canvas = useCanvasControllerRegistration();
  const snapshot = usePluginEditorSnapshot();
  const [editor, setEditor] = useState(() =>
    createPluginEditor(0, instance, canvas, snapshot),
  );
  // A new instance for the same document (the host toggled `readonly`).
  if (editor.instance !== instance) {
    setEditor(
      createPluginEditor(editor.generation + 1, instance, canvas, snapshot),
    );
  }

  return (
    <PluginEditorContext value={editor}>
      <PluginEditorSync editor={editor} snapshot={snapshot} />
      {children}
    </PluginEditorContext>
  );
};
