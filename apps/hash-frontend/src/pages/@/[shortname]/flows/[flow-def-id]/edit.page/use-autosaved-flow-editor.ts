import { useCallback, useEffect, useRef, useState } from "react";

import { createFlowEditor } from "@local/hash-isomorphic-utils/flows/flow-editor";

import type { FlowDefinitionToEdit } from "../../../../../shared/use-flow-definitions";
import type { EntityEditionId } from "@blockprotocol/type-system";
import type { FlowEditor } from "@local/hash-isomorphic-utils/flows/flow-editor";
import type { FlowDefinition } from "@local/hash-isomorphic-utils/flows/types";

/** Thrown by a save when the flow has been saved since the edition the save was made from. */
export class FlowChangedElsewhereError extends Error {
  override readonly name = "FlowChangedElsewhereError";
}

/** Thrown by a save the API refused, with why as its message. The same definition is refused again until it changes. */
export class FlowSaveRefusedError extends Error {
  override readonly name = "FlowSaveRefusedError";
}

export type FlowSaveStatus = "saving" | "saved" | "failed";

/** How long after an edit the flow is saved, so that a burst of edits is saved once. */
export const autosaveDelayMs = 800;

/**
 * An editor for a flow that saves each edit shortly after it's made. Saves happen one at a time, each against the
 * edition the previous one created. If the flow was saved elsewhere meanwhile, the editor is replaced by one holding
 * the flow as it is now, and `changedElsewhere` is set.
 *
 * A failed save is tried again with the next edit, or by calling `flush`. If the API refused it, `saveRefusedReason`
 * says why until a save succeeds.
 */
export const useAutosavedFlowEditor = ({
  flow,
  saveFlowDefinition,
  reloadFlow,
}: {
  /** The flow as loaded. */
  flow: FlowDefinitionToEdit;
  /**
   * Saves a definition made from `expectedEditionId`, returning the edition it created. Throws a
   * `FlowChangedElsewhereError` if the flow has been saved since that edition, and a `FlowSaveRefusedError` if the API
   * refused the definition.
   */
  saveFlowDefinition: (
    flowDefinition: FlowDefinition<string>,
    expectedEditionId: EntityEditionId,
  ) => Promise<EntityEditionId>;
  /** Loads the flow as it is now. */
  reloadFlow: () => Promise<FlowDefinitionToEdit | null>;
}): {
  editor: FlowEditor;
  status: FlowSaveStatus;
  /** Why the API refused the last save, if it did. */
  saveRefusedReason: string | null;
  changedElsewhere: boolean;
  dismissChangedElsewhere: () => void;
  /** Saves any edits not saved yet, after the save in flight, if any. Resolves to whether every edit is saved. */
  flush: () => Promise<boolean>;
} => {
  const [editor, setEditor] = useState(() =>
    createFlowEditor(flow.flowDefinition),
  );
  const [status, setStatus] = useState<FlowSaveStatus>("saved");
  const [saveRefusedReason, setSaveRefusedReason] = useState<string | null>(
    null,
  );
  const [changedElsewhere, setChangedElsewhere] = useState(false);

  const editorRef = useRef(editor);
  const editionIdRef = useRef(flow.editionId);
  /** Whether there are edits no save has sent yet. */
  const unsavedRef = useRef(false);
  const saveInFlightRef = useRef<Promise<void> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const saveFlowDefinitionRef = useRef(saveFlowDefinition);
  const reloadFlowRef = useRef(reloadFlow);
  saveFlowDefinitionRef.current = saveFlowDefinition;
  reloadFlowRef.current = reloadFlow;

  const save = useCallback(async () => {
    unsavedRef.current = false;
    setStatus("saving");

    try {
      editionIdRef.current = await saveFlowDefinitionRef.current(
        editorRef.current.getState().flowDefinition,
        editionIdRef.current,
      );

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- edits made while the save was in flight set it
      setStatus(unsavedRef.current ? "saving" : "saved");
      setSaveRefusedReason(null);
    } catch (error) {
      if (!(error instanceof FlowChangedElsewhereError)) {
        unsavedRef.current = true;
        setStatus("failed");
        setSaveRefusedReason(
          error instanceof FlowSaveRefusedError ? error.message : null,
        );
        return;
      }

      const latest = await reloadFlowRef.current().catch(() => null);

      if (!latest) {
        /* Trying again saves, gets refused again, and so reloads again. */
        unsavedRef.current = true;
        setStatus("failed");
        return;
      }

      const reloadedEditor = createFlowEditor(latest.flowDefinition);

      editorRef.current = reloadedEditor;
      editionIdRef.current = latest.editionId;
      unsavedRef.current = false;

      setEditor(reloadedEditor);
      setChangedElsewhere(true);
      setStatus("saved");
      setSaveRefusedReason(null);
    }
  }, []);

  const flush = useCallback(async () => {
    clearTimeout(timerRef.current);

    while (saveInFlightRef.current) {
      await saveInFlightRef.current;
    }

    if (!unsavedRef.current) {
      return true;
    }

    const saveInFlight = save();
    saveInFlightRef.current = saveInFlight;

    try {
      await saveInFlight;
    } finally {
      saveInFlightRef.current = null;
    }

    return !unsavedRef.current;
  }, [save]);

  useEffect(
    () =>
      editor.subscribe(() => {
        unsavedRef.current = true;
        setStatus("saving");

        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          void flush();
        }, autosaveDelayMs);
      }),
    [editor, flush],
  );

  /* Edits made just before leaving the page are still saved. */
  useEffect(
    () => () => {
      if (unsavedRef.current) {
        void flush();
      }
    },
    [flush],
  );

  /* Closing or reloading the tab doesn't unmount the page, so the browser asks before edits not saved yet are lost. */
  useEffect(() => {
    if (status === "saved") {
      return;
    }

    const confirmLeaving = (event: BeforeUnloadEvent) => event.preventDefault();

    window.addEventListener("beforeunload", confirmLeaving);
    return () => window.removeEventListener("beforeunload", confirmLeaving);
  }, [status]);

  const dismissChangedElsewhere = useCallback(
    () => setChangedElsewhere(false),
    [],
  );

  return {
    editor,
    status,
    saveRefusedReason,
    changedElsewhere,
    dismissChangedElsewhere,
    flush,
  };
};
