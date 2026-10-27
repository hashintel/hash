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
import * as Sentry from "@sentry/nextjs";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  createJsonDocHandle,
  type ErrorTracker,
  ErrorTrackerContext,
  isSDCPNEqual,
  normalizeSDCPN,
  type PetrinautDocHandle,
  type SDCPN,
} from "@hashintel/petrinaut";

import { ProcessPetrinaut } from "./petrinaut-editor/process-petrinaut";
import {
  type TopBarState,
  TopBarContext,
} from "./petrinaut-editor/top-bar-context";

import type {
  HashSaveOutcome,
  SaveNetForAgent,
} from "./petrinaut-editor/brunch-hash-save";
import type { EntityId } from "@blockprotocol/type-system";
import type {
  ReadBrunchDocumentSaveState,
  VersionLoad,
} from "@hashintel/brunch-agent/ui";

/**
 * Which net the editor holds: an unsaved draft (with the example it was
 * seeded from, if any) or a saved net entity.
 */
export type NetMode =
  | { kind: "draft"; seedKey: string | null }
  | { kind: "saved"; entityId: EntityId };

export type RevisionSummary = {
  decisionTime: string;
  title: string;
};

/**
 * The editor's canonical "last-saved" state for dirty tracking: the live net
 * and title are dirty when they differ from it. `null` means there is no
 * saved state to compare against (a new draft), so the net is always dirty.
 */
export type SavedSnapshot = {
  definition: SDCPN;
  title: string;
  /** Decision-time of the snapshot, used to drive the version picker. */
  decisionTime: string | null;
} | null;

/**
 * One deliberate load of a net into the editor. Each value is one load: the
 * editor opens a fresh document handle whenever it receives a different
 * value, even with identical content, and never otherwise. Keep a value for
 * as long as the load stands rather than rebuilding it on render.
 */
export type PetrinautEditorLoad = {
  definition: SDCPN;
  title: string;
  mode: NetMode;
  savedSnapshot: SavedSnapshot;
  /**
   * Why the host loads it: opening a net, or the user picking one of the
   * open net's saved revisions in the version picker.
   */
  reason: "open" | "revision";
};

/**
 * What the editor submits on Save: the net and title as they were when Save
 * was pressed, and the net they are saved to, or `null` to create one.
 */
export type PetrinautEditorSave = {
  definition: SDCPN;
  title: string;
  entityId: EntityId | null;
};

/** The persisted net and the decision-time of the revision a save wrote. */
export type PetrinautEditorSaved = {
  entityId: EntityId;
  decisionTime: string;
};

/**
 * The editor's state for one load. A save's completion applies to it only
 * while its `handle` is still the one open.
 */
type EditorSession = {
  load: PetrinautEditorLoad;
  handle: PetrinautDocHandle;
  /** The handle's latest net, mirrored for dirty tracking. */
  definition: SDCPN;
  title: string;
  mode: NetMode;
  savedSnapshot: SavedSnapshot;
  savePending: boolean;
  /**
   * The latest load of another saved version of the open net, which the open
   * net builds on, until the host opens a net. Saves leave it as it is: they
   * build on the loaded version.
   */
  versionLoad: VersionLoad | undefined;
};

/**
 * The snapshot as the handle holds the open net, with the conversions a load
 * applies, so dirty tracking compares like with like. A saved net in an
 * older shape persists the converted one on its next save.
 */
const asLoaded = (snapshot: SavedSnapshot): SavedSnapshot =>
  snapshot === null
    ? null
    : { ...snapshot, definition: normalizeSDCPN(snapshot.definition) };

/**
 * The version load `load` makes after `previous`: a new one, with a fresh id,
 * when the user picks a revision of the open saved net other than the version
 * it holds, so Brunch tells its agent about each pick once however many turns
 * carry it; the previous one when the pick is of the version it holds; none
 * once the host opens a net.
 */
const versionLoadAfter = (
  load: PetrinautEditorLoad,
  previous: EditorSession | null,
): VersionLoad | undefined => {
  if (
    load.reason !== "revision" ||
    load.mode.kind !== "saved" ||
    previous?.mode.kind !== "saved" ||
    previous.mode.entityId !== load.mode.entityId
  ) {
    return undefined;
  }
  const decisionTime = load.savedSnapshot?.decisionTime ?? null;
  if (
    decisionTime === null ||
    decisionTime === (previous.savedSnapshot?.decisionTime ?? null)
  ) {
    return previous.versionLoad;
  }
  return { id: crypto.randomUUID(), decisionTime };
};

/**
 * A new handle, with no `id`, so each load gets a fresh one. A new handle
 * starts a new editor, which remounts Petrinaut's assistant panel: runs
 * started against the previous handle abort, and Brunch stops the turn that
 * editor sent. An assistant action is never carried into an editor that
 * didn't send it.
 */
const openSession = (
  load: PetrinautEditorLoad,
  previous: EditorSession | null,
): EditorSession => {
  const handle = createJsonDocHandle({ initial: load.definition });
  return {
    load,
    handle,
    definition: handle.doc() ?? load.definition,
    title: load.title,
    mode: load.mode,
    savedSnapshot: asLoaded(load.savedSnapshot),
    savePending: false,
    versionLoad: versionLoadAfter(load, previous),
  };
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
 * A save the editor started, as its load committed it: what it saved, and
 * whether edits made meanwhile leave the committed load dirty.
 */
type CompletedSave = {
  decisionTime: string | null;
  title: string;
  stillDirty: boolean;
};

/**
 * A save whose host save resolved and whose snapshot `handle`'s session holds
 * but React may not yet have committed. `snapshot` is compared by identity.
 */
type SaveAwaitingCommit = {
  handle: PetrinautDocHandle;
  snapshot: NonNullable<SavedSnapshot>;
  committed: (save: CompletedSave) => void;
};

const abortReasonOf = (signal: AbortSignal): Error =>
  signal.reason instanceof Error
    ? signal.reason
    : new Error("The agent's save was aborted.");

/**
 * The Petrinaut editor for the process page, mounted once for the page's
 * lifetime and driven by its props.
 *
 * Owns the doc handle, title, the canonical saved snapshot and dirty
 * tracking. The host (`process-editor.tsx`) owns routing, persistence and
 * revision history: it supplies each `load`, the readonly state and the
 * revision list, and performs `onSave`.
 */
export const PetrinautEditor = ({
  load,
  readonly,
  revisions,
  onDirtyChange,
  onNavigateBack,
  onSelectRevision,
  onSave,
}: {
  /** The net to show, or `null` until the host has one. */
  load: PetrinautEditorLoad | null;
  /** The user may not edit or save the net. */
  readonly: boolean;
  /** The open net's saved revisions for the version picker, newest first. */
  revisions: RevisionSummary[];
  /** Called with the dirty state after every change to it and every load. */
  onDirtyChange: (isDirty: boolean) => void;
  onNavigateBack: () => void;
  /** The user picked this revision in the version picker. */
  onSelectRevision: (decisionTime: string) => void;
  /**
   * Persist a submitted net. Resolves after persistence and the host's
   * refetches; rejects if either failed. History arrives through `revisions`
   * separately, including the first history query after Create.
   */
  onSave: (save: PetrinautEditorSave) => Promise<PetrinautEditorSaved>;
}) => {
  const [session, setSession] = useState<EditorSession | null>(null);

  if (load !== (session?.load ?? null)) {
    setSession(load === null ? null : openSession(load, session));
  }

  const handle = session?.handle;

  /**
   * The session as of the latest change, ahead of the render that shows it,
   * so a save reads the title and identity current when it is called, and
   * its pending state admits no second save before that render. Every
   * change below writes it first; a commit sets it only when it opens
   * another load, so it never steps back to an older render's session.
   */
  const liveSessionRef = useRef(session);
  useLayoutEffect(() => {
    if (liveSessionRef.current?.handle !== session?.handle) {
      liveSessionRef.current = session;
    }
  }, [session]);

  /**
   * Updates the session only while `sessionHandle` is still open, so nothing
   * started for an earlier load applies to a later one.
   */
  const updateSession = useCallback(
    (
      sessionHandle: PetrinautDocHandle,
      update: (current: EditorSession) => EditorSession,
    ) => {
      const live = liveSessionRef.current;
      if (live?.handle !== sessionHandle) {
        return;
      }
      const next = update(live);
      liveSessionRef.current = next;
      setSession((current) =>
        current?.handle === sessionHandle ? next : current,
      );
    },
    [],
  );

  useEffect(() => {
    if (!handle) {
      return;
    }
    const mirror = (definition: SDCPN) =>
      updateSession(handle, (current) =>
        current.definition === definition
          ? current
          : { ...current, definition },
      );
    const current = handle.doc();
    if (current) {
      mirror(current);
    }
    return handle.subscribe((event) => mirror(event.next));
  }, [handle, updateSession]);

  const isDirty = useMemo(
    () =>
      session !== null &&
      computeIsDirty(session.definition, session.title, session.savedSnapshot),
    [session],
  );

  useEffect(() => {
    if (handle) {
      onDirtyChange(isDirty);
    }
  }, [handle, isDirty, onDirtyChange]);

  /**
   * The one save waiting for its snapshot to commit. It belongs to the load
   * whose handle it names: a commit of another load drops it, leaving the
   * agent's save to Brunch's abort, as does closing the editor.
   */
  const saveAwaitingCommitRef = useRef<SaveAwaitingCommit | null>(null);
  useLayoutEffect(() => {
    const awaiting = saveAwaitingCommitRef.current;
    if (!awaiting) {
      return;
    }
    if (awaiting.handle !== session?.handle) {
      saveAwaitingCommitRef.current = null;
      return;
    }
    if (session.savedSnapshot !== awaiting.snapshot) {
      return;
    }
    saveAwaitingCommitRef.current = null;
    awaiting.committed({
      decisionTime: awaiting.snapshot.decisionTime,
      title: awaiting.snapshot.title,
      stillDirty: isDirty,
    });
  }, [isDirty, session]);

  /** Read by Brunch's tools when they need the title. */
  const readTitle = useCallback(() => liveSessionRef.current?.title ?? "", []);

  /** The host's latest `onSave` and readonly state, for saves that run later. */
  const hostSaveRef = useRef({ onSave, readonly });
  useLayoutEffect(() => {
    hostSaveRef.current = { onSave, readonly };
  }, [onSave, readonly]);

  const reportingRef = useRef<{ mode: NetMode; readonly: boolean } | null>(
    null,
  );
  reportingRef.current = session && { mode: session.mode, readonly };

  /**
   * Errors Petrinaut catches itself, such as a failing plugin's, never reach
   * the app's error boundary, so they go to Sentry from here, tagged with
   * the net this editor holds. Its identity never changes, so consumers
   * such as Brunch's identity request don't restart on a load or save.
   */
  const errorTracker = useMemo<ErrorTracker>(
    () => ({
      captureException: (error, context) => {
        const reporting = reportingRef.current;
        Sentry.captureException(error, {
          tags: {
            ...context?.tags,
            ...(context?.source === undefined
              ? {}
              : { "petrinaut.origin": context.source }),
            "petrinaut.source": "petrinaut",
            "petrinaut.mode": reporting?.mode.kind ?? "unknown",
          },
          contexts: {
            petrinaut: {
              mode: reporting?.mode ?? null,
              readonly: reporting?.readonly ?? null,
            },
          },
        });
      },
    }),
    [],
  );

  /** Renames the load this render shows, and nothing once another is open. */
  const setTitle = useCallback(
    (title: string) => {
      if (handle) {
        updateSession(handle, (current) => ({ ...current, title }));
      }
    },
    [handle, updateSession],
  );

  /**
   * Submits the open load's net, title and identity as they are when called,
   * returning `null` when no save starts: with no load open, while a save of
   * it is pending, or with no net to submit. Its completion marks what it
   * submitted as saved, so edits made meanwhile stay dirty, and applies only
   * while the same load is open. The promise settles when the host's save
   * does, rejecting when it failed; `committed` is called only once React
   * commits the saved snapshot in the same load.
   */
  const startSave = useCallback(
    (committed?: (save: CompletedSave) => void): Promise<void> | null => {
      const live = liveSessionRef.current;
      if (!live || live.savePending) {
        return null;
      }
      const { handle: savedHandle, mode, title } = live;
      const definition = savedHandle.doc();
      if (!definition) {
        return null;
      }
      updateSession(savedHandle, (current) => ({
        ...current,
        savePending: true,
      }));
      return (async () => {
        try {
          const saved = await hostSaveRef.current.onSave({
            definition,
            title,
            entityId: mode.kind === "saved" ? mode.entityId : null,
          });
          const snapshot = {
            definition,
            title,
            decisionTime: saved.decisionTime,
          };
          if (committed && liveSessionRef.current?.handle === savedHandle) {
            saveAwaitingCommitRef.current = {
              handle: savedHandle,
              snapshot,
              committed,
            };
          }
          updateSession(savedHandle, (current) => ({
            ...current,
            savePending: false,
            mode: { kind: "saved", entityId: saved.entityId },
            savedSnapshot: snapshot,
          }));
        } catch (error) {
          updateSession(savedHandle, (current) => ({
            ...current,
            savePending: false,
          }));
          throw error;
        }
      })();
    },
    [updateSession],
  );

  /**
   * Why the agent's save of `documentId` can't start now, with the title and
   * last save its approval card shows. It saves only the saved net open in
   * the editor, and only from the load this render shows.
   */
  const readAgentSaveState = useCallback<ReadBrunchDocumentSaveState>(
    (documentId) => {
      const live = liveSessionRef.current;
      const refusal =
        live?.mode.kind !== "saved"
          ? "The net is an unsaved draft, which the user creates with the editor's Create."
          : live.handle !== handle || documentId !== live.mode.entityId
            ? "That isn't the net open in the editor."
            : hostSaveRef.current.readonly
              ? "The user can't edit this net, so they can't save it."
              : live.savePending
                ? "A save of this net is already in progress."
                : null;
      return {
        title: live?.title ?? "",
        lastSavedTime: live?.savedSnapshot?.decisionTime ?? null,
        refusal,
      };
    },
    [handle],
  );

  /**
   * The Save button's save, for the agent once the user has approved it. It
   * settles once the editor commits the saved snapshot, with the dirty state
   * committed then, or with the host's error when the save failed. Aborting
   * rejects it without cancelling a save already submitted; a load or close
   * before the snapshot commits leaves it to that abort.
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
      return new Promise<HashSaveOutcome>((resolve, reject) => {
        /** Ends listening for the abort once the save settles. */
        const listening = new AbortController();
        const committed = (completed: CompletedSave) => {
          listening.abort();
          resolve({ saved: true, ...completed });
        };
        const saving = startSave(committed);
        if (!saving) {
          reject(new Error("The editor did not start the save."));
          return;
        }
        signal.addEventListener(
          "abort",
          () => {
            if (saveAwaitingCommitRef.current?.committed === committed) {
              saveAwaitingCommitRef.current = null;
            }
            reject(abortReasonOf(signal));
          },
          { once: true, signal: listening.signal },
        );
        saving.catch((error: unknown) => {
          listening.abort();
          resolve({
            saved: false,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      });
    },
    [readAgentSaveState, startSave],
  );

  /** The Save button's save, for the load this render shows only. */
  const save = useCallback((): void => {
    if (liveSessionRef.current?.handle !== handle) {
      return;
    }
    /**
     * A failed save leaves the net dirty and Save enabled to retry; the
     * editor has no error UI for it.
     */
    startSave()?.catch(() => {});
  }, [handle, startSave]);

  if (!session) {
    /** The host covers the editor with a skeleton until it has a load. */
    return <Box sx={{ height: "100%" }} />;
  }

  const topBar: TopBarState = {
    title: session.title,
    onTitleChange: setTitle,
    readonly,
    isDirty,
    persistPending: session.savePending,
    saveLabel:
      session.mode.kind === "saved" ? (isDirty ? "Save" : "Saved") : "Create",
    revisions,
    loadedRevisionTime: session.savedSnapshot?.decisionTime ?? null,
    onNavigateBack,
    onSave: save,
    onLoadRevision: (revision) => onSelectRevision(revision.decisionTime),
  };

  return (
    <Box sx={{ height: "100%", overflow: "hidden" }}>
      <TopBarContext value={topBar}>
        <ErrorTrackerContext value={errorTracker}>
          <ProcessPetrinaut
            handle={session.handle}
            savedEntityId={
              session.mode.kind === "saved" ? session.mode.entityId : null
            }
            readTitle={readTitle}
            readSaveState={readAgentSaveState}
            saveNetForAgent={saveNetForAgent}
            versionLoad={session.versionLoad}
            readonly={readonly}
            setTitle={setTitle}
            title={session.title}
          />
        </ErrorTrackerContext>
      </TopBarContext>
    </Box>
  );
};
