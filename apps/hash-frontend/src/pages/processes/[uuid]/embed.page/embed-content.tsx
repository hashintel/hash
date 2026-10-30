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
        // The revision list comes only from `revisionsList`, which the host
        // sends again once its history refetch includes this save.
        const { savedSnapshot, mode } = payload.result;
        setState((prev) =>
          prev
            ? {
                ...prev,
                mode,
                savedSnapshot: withPetrinautIds(savedSnapshot),
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
