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
  type RevisionSummary,
  type SavedSnapshot,
} from "../../shared/messages";
import { useIframeBridge } from "../../shared/use-iframe-bridge";
import { createBridgeAiChatTransport } from "./create-bridge-ai-transport";
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
 *
 * This component is dynamic-imported (`ssr: false`) by `embed.page.tsx`
 * because Petrinaut needs Web Workers, Canvas, Monaco, and the TypeScript
 * compiler — all browser-only.
 */
export const EmbedContent = () => {
  const [state, setState] = useState<EditorState | null>(null);
  const [revisions, setRevisions] = useState<RevisionSummary[]>([]);
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
    onRevisionsList: (incoming) => {
      setRevisions(incoming);
    },
    onSaveResult: (payload) => {
      setPendingSaveRequestId((prev) =>
        prev === payload.requestId ? null : prev,
      );
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
        const currentDoc = state?.handle.doc();
        const currentTitle = state?.title ?? savedSnapshot.title;
        if (currentDoc) {
          setIsDirty(computeIsDirty(currentDoc, currentTitle, savedSnapshot));
        }
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

  /**
   * Title changes always recompute dirty (it's part of the comparison) and
   * always emit `titleChanged` so the host can mirror the document title.
   */
  useEffect(() => {
    if (!state) {
      return;
    }
    bridge.send({ kind: "titleChanged", title: state.title });
    const currentDoc = state.handle.doc();
    if (currentDoc) {
      const dirty = computeIsDirty(
        currentDoc,
        state.title,
        state.savedSnapshot,
      );
      setIsDirty((prev) => (prev === dirty ? prev : dirty));
    }
  }, [bridge, state]);

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
      <Petrinaut
        aiAssistant={{ transport: aiChatTransport }}
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
    </Box>
  );
};
