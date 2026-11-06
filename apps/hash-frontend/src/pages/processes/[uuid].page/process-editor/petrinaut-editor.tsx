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
  canonicalizePetrinautIds,
  createJsonDocHandle,
  type ErrorTracker,
  ErrorTrackerContext,
  isSDCPNEqual,
  type PetrinautDocHandle,
  type SDCPN,
} from "@hashintel/petrinaut";

import { createAgentSave } from "./petrinaut-editor/agent-save";
import { ProcessPetrinaut } from "./petrinaut-editor/process-petrinaut";
import {
  agentSaveRefusal,
  saveRefusal,
} from "./petrinaut-editor/save-availability";
import {
  type TopBarState,
  TopBarContext,
} from "./petrinaut-editor/top-bar-context";

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
    savedSnapshot: withPetrinautIds(load.savedSnapshot),
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
   * The agent's save waiting on the editor, for the load whose handle it
   * names, until it settles. The agent's save of the same load is refused
   * meanwhile, including after its host save resolved and before its
   * snapshot commits.
   */
  const [agentSave] = useState(createAgentSave<PetrinautDocHandle>);

  /**
   * Settles the agent's save once its load commits its snapshot, with the
   * dirty state committed then, and abandons it once another load commits.
   */
  useLayoutEffect(() => {
    agentSave.committed(
      session?.handle,
      session?.savedSnapshot ?? null,
      isDirty,
    );
  }, [agentSave, isDirty, session]);

  useEffect(() => () => agentSave.abandon("closed"), [agentSave]);

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
   * does, rejecting when it failed; `hostSaved` is called with the snapshot
   * the load is about to hold, only while the load is still open.
   */
  const startSave = useCallback(
    (
      hostSaved?: (snapshot: NonNullable<SavedSnapshot>) => void,
    ): Promise<void> | null => {
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
          if (liveSessionRef.current?.handle === savedHandle) {
            hostSaved?.(snapshot);
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
   * last save its approval card shows, judged from the open load as it is
   * when called. It saves only from the load this render shows.
   */
  const readAgentSaveState = useCallback<ReadBrunchDocumentSaveState>(
    (documentId) => {
      const live = liveSessionRef.current;
      return {
        title: live?.title ?? "",
        lastSavedTime: live?.savedSnapshot?.decisionTime ?? null,
        refusal: agentSaveRefusal(
          {
            mode: live?.mode ?? null,
            fromOpenLoad: live !== null && live.handle === handle,
            readonly: hostSaveRef.current.readonly,
            saving:
              live !== null &&
              (live.savePending || agentSave.occupies(live.handle)),
            isDirty:
              live !== null &&
              computeIsDirty(
                live.handle.doc() ?? live.definition,
                live.title,
                live.savedSnapshot,
              ),
          },
          documentId,
        ),
      };
    },
    [agentSave, handle],
  );

  /**
   * The editor's Save, for the agent once the user has approved it, bound to
   * the load this render shows.
   */
  const hostSave = useMemo(
    () =>
      handle
        ? agentSave.hostSaveFor(handle, {
            read: readAgentSaveState,
            start: startSave,
          })
        : null,
    [agentSave, handle, readAgentSaveState, startSave],
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

  if (!session || !hostSave) {
    /** The host covers the editor with a skeleton until it has a load. */
    return <Box sx={{ height: "100%" }} />;
  }

  const topBar: TopBarState = {
    title: session.title,
    onTitleChange: setTitle,
    readonly,
    isDirty,
    persistPending: session.savePending,
    saveRefusal: saveRefusal({
      readonly,
      saving: session.savePending,
      isDirty,
    }),
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
            hostSave={hostSave}
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
