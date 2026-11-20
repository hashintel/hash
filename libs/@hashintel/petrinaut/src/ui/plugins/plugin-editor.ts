/**
 * The editor as plugins see it, one per core instance: the access families,
 * `errors` and `notifications`, built once from that instance. Their
 * actions read render-scoped editor state from stores that `PluginEditorSync`
 * updates in the layout phase of every commit, before the plugin hosts' and
 * the view's layout effects run.
 */

import { createContext, use } from "react";

import {
  createReadableStore,
  type DiagnosticsSnapshot,
  type Petrinaut,
} from "@hashintel/petrinaut-core";

import { petrinautNavigationStatesMatch } from "../../react/navigation";
import { createAccessFamilies } from "./plugin-access";

import type { ExperimentRecord } from "../../react/experiments/context";
import type { PetrinautNavigationState } from "../../react/navigation";
import type {
  AccessFamilies,
  PluginEditorState,
  PluginErrors,
  PluginNotifications,
} from "./plugin-access";
import type { CanvasRegistration } from "./plugin-editor/canvas-registration";

/** Editor state from the editor's providers, as one render sees it. */
export interface PluginEditorSnapshot {
  readonly state: PluginEditorState;
  readonly title: string;
  readonly diagnostics: DiagnosticsSnapshot;
  readonly records: readonly ExperimentRecord[];
  readonly optimizationUnavailableReason: string | null;
  readonly navigation: PetrinautNavigationState;
}

/** The editor as plugins see it, one per core instance. */
export interface PluginEditorRuntime {
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

export const createPluginEditor = (
  generation: number,
  instance: Petrinaut,
  canvas: CanvasRegistration,
  snapshot: PluginEditorSnapshot,
): PluginEditorRuntime => {
  const latest = createReadableStore(snapshot.state);
  const title = createReadableStore(snapshot.title);
  const diagnostics = createReadableStore(snapshot.diagnostics);
  const records = createReadableStore(snapshot.records);
  const optimizationUnavailableReason = createReadableStore(
    snapshot.optimizationUnavailableReason,
  );
  const navigation = createReadableStore(snapshot.navigation);

  return {
    generation,
    instance,
    canvas,
    families: createAccessFamilies({
      instance,
      latest,
      title,
      diagnostics,
      records,
      optimizationUnavailableReason,
      navigation,
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
      diagnostics.set(next.diagnostics);
      records.set(next.records);
      optimizationUnavailableReason.set(next.optimizationUnavailableReason);
      // The provider's state object is new on every render in a controlled
      // host; subscribers wake only when the location changed.
      if (!petrinautNavigationStatesMatch(navigation.get(), next.navigation)) {
        navigation.set(next.navigation);
      }
    },
  };
};

export const PluginEditorContext = createContext<PluginEditorRuntime | null>(
  null,
);

/** The current plugin editor; only the plugin hosts read it. */
export const usePluginEditor = (): PluginEditorRuntime => {
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
