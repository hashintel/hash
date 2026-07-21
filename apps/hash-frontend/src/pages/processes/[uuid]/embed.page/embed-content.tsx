import "@hashintel/petrinaut/dist/main.css";
import { Box } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@hashintel/ds-components";
import {
  createJsonDocHandle,
  isSDCPNEqual,
  Petrinaut,
  type PetrinautDocHandle,
  type PetrinautSlots,
  type SDCPN,
} from "@hashintel/petrinaut";

import { setIframeErrorReporterMode } from "../../shared/iframe-error-reporter";
import {
  type HostNetMode,
  nextRequestId,
  type PetrinautAiMessage,
  type PetrinautHostCapabilities,
  type RevisionSummary,
  type SavedSnapshot,
} from "../../shared/messages";
import { useIframeBridge } from "../../shared/use-iframe-bridge";
import { createBridgeAiChatTransport } from "./create-bridge-ai-transport";
import { HASHPetrinautOptimizationProvider } from "./hash-petrinaut-optimization-provider";
import { VersionPicker } from "./version-picker";

/**
 * Chat transport for the AI assistant. Created once at module scope: it's
 * stateless beyond the per-request bookkeeping it owns internally, so a single
 * instance is shared across renders (and is safe even though the editor never
 * remounts when switching nets).
 */
const aiChatTransport = createBridgeAiChatTransport();

const noNetSwitchingError = () => {
  throw new Error(
    "Net switching from inside the Petrinaut iframe is not supported; " +
      "the host (process-editor) drives all net loads via the bridge.",
  );
};

type EditorState = {
  handle: PetrinautDocHandle;
  title: string;
  readonly: boolean;
  mode: HostNetMode;
  savedSnapshot: SavedSnapshot;
  /**
   * Conversation the host restored for this net (empty for drafts / nets
   * with no saved conversation). Seeds the assistant panel's initial
   * messages; the panel is keyed by the doc handle id (replaced on every
   * `init`/`load`), so it remounts and re-reads these on each net change.
   */
  aiMessages: PetrinautAiMessage[];
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

/**
 * Petrinaut embed content — runs inside a sandboxed null-origin iframe.
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

  const bridge = useIframeBridge({
    onInit: (payload) => {
      const handle = createJsonDocHandle({
        initial: payload.initialDefinition,
      });
      setState({
        handle,
        title: payload.initialTitle,
        readonly: payload.readonly,
        mode: payload.mode,
        savedSnapshot: payload.savedSnapshot,
        aiMessages: payload.aiMessages,
      });
      setRevisions(payload.revisions);
      setIsDirty(
        computeIsDirty(
          payload.initialDefinition,
          payload.initialTitle,
          payload.savedSnapshot,
        ),
      );
      setIframeErrorReporterMode(payload.mode);
      /**
       * Reset any in-flight save state. A re-init means the host has
       * decided to throw away whatever the iframe was doing (e.g. user
       * navigated to a different net via URL while a save was pending).
       */
      setPendingSaveRequestId(null);
    },
    onLoad: (payload) => {
      const handle = createJsonDocHandle({ initial: payload.definition });
      setState({
        handle,
        title: payload.title,
        readonly:
          payload.mode.kind === "saved" ? !payload.mode.userEditable : false,
        mode: payload.mode,
        savedSnapshot: payload.savedSnapshot,
        aiMessages: payload.aiMessages,
      });
      setRevisions(payload.revisions);
      setIsDirty(
        computeIsDirty(
          payload.definition,
          payload.title,
          payload.savedSnapshot,
        ),
      );
      setIframeErrorReporterMode(payload.mode);
      setPendingSaveRequestId(null);
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
      if (payload.result.ok) {
        const {
          savedSnapshot,
          mode,
          revisions: updatedRevisions,
        } = payload.result;
        setRevisions(updatedRevisions);
        setState((prev) =>
          prev
            ? {
                ...prev,
                mode,
                savedSnapshot,
              }
            : prev,
        );
        setIframeErrorReporterMode(mode);
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

  /**
   * Relay conversation changes up to the host, which owns persistence — the
   * sandboxed iframe's opaque origin has no usable `localStorage`. Fired by
   * the assistant whenever a turn finishes or the conversation is cleared.
   */
  const handleAiMessages = useCallback(
    (messages: PetrinautAiMessage[]) => {
      bridge.send({ kind: "aiMessagesChanged", messages });
    },
    [bridge],
  );

  const handleClearAiMessages = useCallback(() => {
    bridge.send({ kind: "aiMessagesCleared" });
  }, [bridge]);

  const handleSaveClick = useCallback(() => {
    if (!state || pendingSaveRequestId) {
      return;
    }
    const definition = state.handle.doc();
    if (!definition) {
      return;
    }
    const requestId = nextRequestId();
    setPendingSaveRequestId(requestId);
    bridge.send({
      kind: "requestSave",
      requestId,
      definition,
      title: state.title,
    });
  }, [bridge, pendingSaveRequestId, state]);

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

  const slots = useMemo<PetrinautSlots>(() => {
    const backButton = (
      <Button
        size="sm"
        variant="ghost"
        iconName="arrowLeft"
        aria-label="Back to processes"
        tooltip="Back to processes"
        onClick={handleNavigateBack}
      />
    );

    if (!state || state.readonly) {
      return { topBarStart: backButton };
    }

    const isSaved = state.mode.kind === "saved";
    const saveLabel = isSaved ? (isDirty ? "Save" : "Saved") : "Create";

    return {
      topBarStart: backButton,
      topBarEnd: (
        <>
          <VersionPicker
            revisions={revisions}
            loadedRevisionTime={state.savedSnapshot?.decisionTime ?? null}
            isDirty={isDirty && !persistPending}
            onLoadRevision={handleLoadRevision}
          />
          <Button
            size="sm"
            onClick={handleSaveClick}
            disabled={!isDirty || persistPending}
            loading={persistPending}
            tooltip={
              !isDirty && !persistPending ? "No changes to save" : undefined
            }
          >
            {saveLabel}
          </Button>
        </>
      ),
    };
  }, [
    handleLoadRevision,
    handleNavigateBack,
    handleSaveClick,
    isDirty,
    persistPending,
    revisions,
    state,
  ]);

  if (!state) {
    /**
     * Host is expected to send `init` immediately after the iframe's
     * `ready`. A blank box is fine for that brief window — anything more
     * elaborate (spinner, etc.) tends to flash visibly on every load.
     */
    return <Box sx={{ height: "100vh" }} />;
  }

  return (
    <Box sx={{ height: "100vh", overflow: "hidden" }}>
      <HASHPetrinautOptimizationProvider
        enabled={hostCapabilities?.optimization === true}
      >
        <Petrinaut
          aiAssistant={{
            transport: aiChatTransport,
            messages: state.aiMessages,
            onMessages: handleAiMessages,
            onClearMessages: handleClearAiMessages,
          }}
          handle={state.handle}
          createNewNet={noNetSwitchingError}
          existingNets={[]}
          hideNetManagementControls="except-title"
          loadPetriNet={noNetSwitchingError}
          readonly={state.readonly}
          setTitle={handleSetTitle}
          slots={slots}
          title={state.title}
        />
      </HASHPetrinautOptimizationProvider>
    </Box>
  );
};
