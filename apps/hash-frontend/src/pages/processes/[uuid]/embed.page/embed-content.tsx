/**
 * Petrinaut's stylesheet. Within HASH's pages its Panda-generated
 * atomic utilities are intentionally shadowed by `ds-components-styles.gen.css`
 * (imported in `_app.page.tsx`), which compiles Petrinaut's shipped Panda
 * build info through the app's single Panda pipeline at a strictly higher
 * polyfilled layer specificity — see `panda.config.ts` and FE-1228. This
 * import still supplies everything Panda generation does not: vendor CSS
 * (xyflow, uplot, Monaco, fonts) and the `.petrinaut-root`-scoped preflight,
 * token variables and global styles.
 */
import "@hashintel/petrinaut/dist/main.css";
import { Box } from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  canonicalizePetrinautIds,
  createJsonDocHandle,
  type ErrorTracker,
  ErrorTrackerContext,
  isSDCPNEqual,
  type PetrinautDocHandle,
  type SDCPN,
} from "@hashintel/petrinaut";

import {
  reportIframePetrinautError,
  setIframeErrorReporterMode,
} from "../../shared/iframe-error-reporter";
import {
  type HostNetMode,
  nextRequestId,
  type PetrinautHostCapabilities,
  type RevisionSummary,
  type SavedSnapshot,
} from "../../shared/messages";
import { useIframeBridge } from "../../shared/use-iframe-bridge";
import { type EmbedChrome, EmbedChromeContext } from "./embed-chrome-context";
import { EmbedPetrinaut } from "./embed-petrinaut";
import { HASHPetrinautOptimizationProvider } from "./hash-petrinaut-optimization-provider";

import type { HashSaveOutcome, SaveNetForAgent } from "./brunch-hash-save";
import type { BrunchDocumentSaveState } from "@hashintel/brunch-agent/ui";

/**
 * Errors Petrinaut catches itself, such as a failing plugin's, never reach the
 * app's error boundary, so they go to the host's Sentry from here.
 */
const embedErrorTracker: ErrorTracker = {
  captureException: reportIframePetrinautError,
};

type EditorState = {
  handle: PetrinautDocHandle;
  title: string;
  readonly: boolean;
  mode: HostNetMode;
  savedSnapshot: SavedSnapshot;
};

/**
 * The snapshot with its ids converted, as the handle holds the open net, so
 * dirty tracking compares like with like. Saved nets with legacy ids persist
 * the converted ids on their next save.
 */
const withPetrinautIds = (snapshot: SavedSnapshot): SavedSnapshot =>
  snapshot === null
    ? null
    : {
        ...snapshot,
        definition: canonicalizePetrinautIds(snapshot.definition),
      };

const computeIsDirty = (
  definition: SDCPN,
  title: string,
  savedSnapshot: SavedSnapshot,
): boolean => {
  if (!savedSnapshot) {
    return true;
  }
  return (
    title !== savedSnapshot.title ||
    !isSDCPNEqual(definition, savedSnapshot.definition)
  );
};

const abortReasonOf = (signal: AbortSignal): Error =>
  signal.reason instanceof Error
    ? signal.reason
    : new Error("The agent's save was aborted.");

/**
 * Petrinaut embed content — rendered in the process page by the host.
 *
 * Owns the doc handle, title, panels, simulation/Monte-Carlo workers,
 * Monaco, and dirty tracking. The host (`process-editor.tsx`) only handles
 * persistence and routing, communicating via the postMessage bridge.
 */
export const EmbedContent = () => {
  const [state, setState] = useState<EditorState | null>(null);
  const [revisions, setRevisions] = useState<RevisionSummary[]>([]);
  const [hostCapabilities, setHostCapabilities] =
    useState<PetrinautHostCapabilities | null>(null);
  const [pendingSaveRequestId, setPendingSaveRequestId] = useState<
    string | null
  >(null);
  const [isDirty, setIsDirty] = useState(false);

  /**
   * Latest saved snapshot kept in a ref so the per-handle `subscribe`
   * listener can read it without re-attaching whenever the snapshot
   * changes.
   */
  const savedSnapshotRef = useRef<SavedSnapshot>(null);
  savedSnapshotRef.current = state?.savedSnapshot ?? null;

  /**
   * Same pattern for the title — read by the handle subscriber.
   */
  const titleRef = useRef<string>("");
  titleRef.current = state?.title ?? "";
  const readTitle = useCallback(() => titleRef.current, []);

  /** The agent's saves waiting for the `saveResult` of the save each started, by request id. */
  const agentSavesRef = useRef(
    new Map<string, (outcome: HashSaveOutcome) => void>(),
  );
  /**
   * An agent's save whose `saveResult` succeeded, settled once its snapshot
   * commits, so its dirty state is the one the editor then shows.
   */
  const savedForAgentRef = useRef<{
    snapshot: SavedSnapshot;
    decisionTime: string | null;
    title: string;
    settle: (outcome: HashSaveOutcome) => void;
  } | null>(null);

  /**
   * Every `init` and `load` creates a new handle, even when the content is
   * unchanged (a revision of the same net), and with no `id`, so each gets a
   * fresh one. A new handle starts a new editor, which remounts Petrinaut's
   * assistant panel: runs started against the previous handle abort, and
   * Brunch stops the turn that editor sent. An assistant action is never
   * carried into an editor that didn't send it.
   */
  const bridge = useIframeBridge({
    onInit: (payload) => {
      const handle = createJsonDocHandle({
        initial: payload.initialDefinition,
      });
      const savedSnapshot = withPetrinautIds(payload.savedSnapshot);
      setState({
        handle,
        title: payload.initialTitle,
        readonly: payload.readonly,
        mode: payload.mode,
        savedSnapshot,
      });
      setRevisions(payload.revisions);
      setIsDirty(
        computeIsDirty(
          handle.doc() ?? payload.initialDefinition,
          payload.initialTitle,
          savedSnapshot,
        ),
      );
      setIframeErrorReporterMode(payload.mode);
      /**
       * Reset any in-flight save state. A re-init means the host has
       * decided to throw away whatever the editor was doing (e.g. user
       * navigated to a different net via URL while a save was pending).
       */
      setPendingSaveRequestId(null);
      savedForAgentRef.current = null;
    },
    onLoad: (payload) => {
      const handle = createJsonDocHandle({ initial: payload.definition });
      const savedSnapshot = withPetrinautIds(payload.savedSnapshot);
      setState({
        handle,
        title: payload.title,
        readonly:
          payload.mode.kind === "saved" ? !payload.mode.userEditable : false,
        mode: payload.mode,
        savedSnapshot,
      });
      setRevisions(payload.revisions);
      setIsDirty(
        computeIsDirty(
          handle.doc() ?? payload.definition,
          payload.title,
          savedSnapshot,
        ),
      );
      setIframeErrorReporterMode(payload.mode);
      setPendingSaveRequestId(null);
      savedForAgentRef.current = null;
    },
    onSetReadonly: (readonly) => {
      setState((prev) => (prev ? { ...prev, readonly } : prev));
    },
    onSetCapabilities: setHostCapabilities,
    onRevisionsList: (incoming) => {
      setRevisions(incoming);
    },
    onSaveResult: (payload) => {
      /**
       * Ignore results that don't match the save we're currently waiting on.
       * A `load`/`init` (net switch) resets `pendingSaveRequestId` to `null`,
       * so a late `saveResult` from a previous net would otherwise apply that
       * net's `mode`/`savedSnapshot` on top of the now-active net and corrupt
       * its dirty-tracking + version picker.
       */
      if (payload.requestId !== pendingSaveRequestId) {
        return;
      }
      setPendingSaveRequestId(null);
      const settleAgentSave = agentSavesRef.current.get(payload.requestId);
      agentSavesRef.current.delete(payload.requestId);
      if (payload.result.ok) {
        // The revision list comes only from `revisionsList`, which the host
        // sends again once its history refetch includes this save.
        const { savedSnapshot, mode } = payload.result;
        const nextSnapshot = withPetrinautIds(savedSnapshot);
        if (settleAgentSave) {
          savedForAgentRef.current = {
            snapshot: nextSnapshot,
            decisionTime: savedSnapshot.decisionTime,
            title: savedSnapshot.title,
            settle: settleAgentSave,
          };
        }
        setState((prev) =>
          prev
            ? {
                ...prev,
                mode,
                savedSnapshot: nextSnapshot,
              }
            : prev,
        );
        setIframeErrorReporterMode(mode);
      } else {
        settleAgentSave?.({ saved: false, error: payload.result.error });
      }
    },
  });

  /**
   * Subscribe to handle mutations to keep `isDirty` in sync. Re-attaches
   * whenever the handle is replaced (e.g. after `load` / `init`).
   */
  useEffect(() => {
    const handle = state?.handle;
    if (!handle) {
      return;
    }
    return handle.subscribe((event) => {
      const dirty = computeIsDirty(
        event.next,
        titleRef.current,
        savedSnapshotRef.current,
      );
      setIsDirty((prev) => (prev === dirty ? prev : dirty));
    });
  }, [state?.handle]);

  const handle = state?.handle;
  const currentTitle = state?.title ?? "";
  const savedSnapshot = state?.savedSnapshot ?? null;

  /**
   * Title changes always emit `titleChanged` so the host can mirror the
   * document title.
   */
  useEffect(() => {
    if (!handle) {
      return;
    }
    bridge.send({ kind: "titleChanged", title: currentTitle });
  }, [bridge, currentTitle, handle]);

  /**
   * Dirty tracking is derived after editor state commits so batched updates
   * (for example, title edits racing a save result) are compared together.
   */
  useEffect(() => {
    if (!handle) {
      return;
    }
    const currentDoc = handle.doc();
    if (currentDoc) {
      const dirty = computeIsDirty(currentDoc, currentTitle, savedSnapshot);
      setIsDirty((prev) => (prev === dirty ? prev : dirty));
      const savedForAgent = savedForAgentRef.current;
      if (savedForAgent?.snapshot === savedSnapshot) {
        savedForAgentRef.current = null;
        savedForAgent.settle({
          saved: true,
          decisionTime: savedForAgent.decisionTime,
          title: savedForAgent.title,
          stillDirty: dirty,
        });
      }
    }
  }, [currentTitle, handle, savedSnapshot]);

  /**
   * Mirror dirty state to the host. The host caches it for the discard-
   * changes modal and the `beforeunload` guard.
   */
  useEffect(() => {
    if (!state) {
      return;
    }
    bridge.send({ kind: "dirtyChanged", isDirty });
  }, [bridge, isDirty, state]);

  const handleSetTitle = useCallback((title: string) => {
    setState((prev) => (prev ? { ...prev, title } : prev));
  }, []);

  /** Sends the open net to the host to save; returns its request id, or `null` when it sent none. */
  const handleSaveClick = useCallback((): string | null => {
    if (!state || pendingSaveRequestId) {
      return null;
    }
    const definition = state.handle.doc();
    if (!definition) {
      return null;
    }
    const requestId = nextRequestId();
    setPendingSaveRequestId(requestId);
    bridge.send({
      kind: "requestSave",
      requestId,
      definition,
      title: state.title,
    });
    return requestId;
  }, [bridge, pendingSaveRequestId, state]);

  /** What the agent's save reads when it runs, which may be after this render. */
  const agentSaveSourceRef = useRef({
    state,
    pendingSaveRequestId,
    handleSaveClick,
  });
  agentSaveSourceRef.current = { state, pendingSaveRequestId, handleSaveClick };

  const readAgentSaveState = useCallback(
    (documentId: string): BrunchDocumentSaveState => {
      const { state: current, pendingSaveRequestId: pending } =
        agentSaveSourceRef.current;
      const refusal =
        current?.mode.kind !== "saved"
          ? "The net is an unsaved draft, which the user creates with the editor's Create."
          : documentId !== current.mode.entityId
            ? "That isn't the net open in the editor."
            : current.readonly
              ? "The user can't edit this net, so they can't save it."
              : pending !== null
                ? "A save of this net is already in progress."
                : null;
      return {
        title: current?.title ?? "",
        lastSavedTime: current?.savedSnapshot?.decisionTime ?? null,
        refusal,
      };
    },
    [],
  );

  /**
   * The Save button's save, for the agent once the user has approved it: it
   * settles with that save's `saveResult`. A `load` or `init` before then
   * leaves it waiting until the remounted assistant aborts it.
   */
  const saveNetForAgent = useCallback<SaveNetForAgent>(
    (documentId, signal) => {
      if (signal.aborted) {
        return Promise.reject(abortReasonOf(signal));
      }
      const { refusal } = readAgentSaveState(documentId);
      if (refusal !== null) {
        return Promise.resolve<HashSaveOutcome>({
          applied: false,
          reason: refusal,
        });
      }
      const requestId = agentSaveSourceRef.current.handleSaveClick();
      if (requestId === null) {
        return Promise.reject(new Error("The editor did not start the save."));
      }
      return new Promise<HashSaveOutcome>((resolve, reject) => {
        const onAbort = () => {
          agentSavesRef.current.delete(requestId);
          reject(abortReasonOf(signal));
        };
        signal.addEventListener("abort", onAbort, { once: true });
        agentSavesRef.current.set(requestId, (outcome) => {
          signal.removeEventListener("abort", onAbort);
          resolve(outcome);
        });
      });
    },
    [readAgentSaveState],
  );

  const handleNavigateBack = useCallback(() => {
    bridge.send({ kind: "requestNavigateBack" });
  }, [bridge]);

  const handleLoadRevision = useCallback(
    (revision: RevisionSummary) => {
      bridge.send({
        kind: "requestRevision",
        decisionTime: revision.decisionTime,
      });
    },
    [bridge],
  );

  const persistPending = pendingSaveRequestId !== null;

  if (!state) {
    /**
     * Host is expected to send `init` immediately after the editor's
     * `ready`. A blank box is fine for that brief window — anything more
     * elaborate (spinner, etc.) tends to flash visibly on every load.
     */
    return <Box sx={{ height: "100%" }} />;
  }

  const chrome: EmbedChrome = {
    title: state.title,
    onTitleChange: handleSetTitle,
    readonly: state.readonly,
    isDirty,
    persistPending,
    saveLabel:
      state.mode.kind === "saved" ? (isDirty ? "Save" : "Saved") : "Create",
    revisions,
    loadedRevisionTime: state.savedSnapshot?.decisionTime ?? null,
    onNavigateBack: handleNavigateBack,
    onSave: handleSaveClick,
    onLoadRevision: handleLoadRevision,
  };

  return (
    <Box sx={{ height: "100%", overflow: "hidden" }}>
      <HASHPetrinautOptimizationProvider
        enabled={hostCapabilities?.optimization === true}
      >
        <EmbedChromeContext value={chrome}>
          <ErrorTrackerContext value={embedErrorTracker}>
            <EmbedPetrinaut
              handle={state.handle}
              savedEntityId={
                state.mode.kind === "saved" ? state.mode.entityId : null
              }
              readTitle={readTitle}
              readSaveState={readAgentSaveState}
              saveNetForAgent={saveNetForAgent}
              readonly={state.readonly}
              setTitle={handleSetTitle}
              title={state.title}
            />
          </ErrorTrackerContext>
        </EmbedChromeContext>
      </HASHPetrinautOptimizationProvider>
    </Box>
  );
};
