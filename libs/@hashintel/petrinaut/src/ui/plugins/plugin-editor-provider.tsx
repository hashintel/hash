import { type ReactNode, use, useLayoutEffect, useState } from "react";

import { ErrorTrackerContext } from "../../react/error-tracker-context";
import { ExperimentHostContext } from "../../react/experiment-host/context";
import { ExperimentsContext } from "../../react/experiments/context";
import { useRevealInEditor } from "../../react/hooks/use-reveal-in-editor";
import { PetrinautInstanceContext } from "../../react/instance-context";
import { LanguageClientContext } from "../../react/lsp/context";
import { usePetrinautNavigation } from "../../react/navigation";
import { NetManagementContext } from "../../react/net-management-context";
import { NotificationsContext } from "../../react/notifications/context";
import { OptimizationsContext } from "../../react/optimizations/context";
import { ActiveNetContext } from "../../react/state/active-net-context";
import { useReadOnlyReason } from "../../react/state/use-read-only-reason";
import {
  createPluginEditor,
  PluginEditorContext,
  type PluginEditorRuntime,
  type PluginEditorSnapshot,
} from "./plugin-editor";
import { createCanvasRegistration } from "./plugin-editor/canvas-registration";

import type { Petrinaut } from "@hashintel/petrinaut-core";

const usePluginEditorSnapshot = (): PluginEditorSnapshot => {
  const { title, setTitle } = use(NetManagementContext);
  const { activeComponentId } = use(ActiveNetContext);
  const { experiments } = use(ExperimentsContext);
  const { optimizationUnavailableReason = null } = use(OptimizationsContext);
  const { runExperiment } = use(ExperimentHostContext);
  const { diagnostics, requestDiagnostics } = use(LanguageClientContext);
  const { addNotification } = use(NotificationsContext);
  const { captureException } = use(ErrorTrackerContext);
  const readOnlyReason = useReadOnlyReason();
  const reveal = useRevealInEditor();
  const navigation = usePetrinautNavigation();

  return {
    state: {
      readOnlyReason,
      activeComponentId,
      setTitle,
      navigate: navigation.navigate,
      reveal,
      requestDiagnostics,
      runExperiment,
      addNotification,
      captureException,
    },
    title,
    diagnostics,
    records: experiments,
    optimizationUnavailableReason,
    navigation: navigation.state,
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

/** Copies the snapshot into the editor's stores, first in each commit's layout phase. */
const PluginEditorSync = ({
  editor,
  snapshot,
}: {
  editor: PluginEditorRuntime;
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
  const [canvas] = useState(createCanvasRegistration);
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
