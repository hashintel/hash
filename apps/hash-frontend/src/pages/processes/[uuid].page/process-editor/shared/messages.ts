import type { EntityId } from "@blockprotocol/type-system";
import type { SDCPN } from "@hashintel/petrinaut";

/**
 * Metadata about the active net surfaced by the host. Mirrors the shape the
 * editor needs to drive the version picker and to know what (if anything) it's
 * currently editing on the server.
 */
export type HostNetMode =
  | { kind: "draft"; seedKey: string | null }
  | { kind: "saved"; entityId: EntityId; userEditable: boolean };

export type RevisionSummary = {
  decisionTime: string;
  title: string;
};

/**
 * Snapshot the editor should treat as the canonical "last-saved" state for
 * the purposes of dirty-tracking. The editor compares its live SDCPN against
 * `definition` (and `title` against this title); when they diverge it emits
 * `dirtyChanged: { isDirty: true }`.
 *
 * `null` means "there is no saved state to compare against" (a brand-new
 * draft) — in that case the editor treats every non-empty edit as dirty.
 */
export type SavedSnapshot = {
  definition: SDCPN;
  title: string;
  /** Decision-time of the snapshot, used to drive the version picker. */
  decisionTime: string | null;
} | null;

/**
 * Messages sent by the host (process-editor) to the editor.
 */
export type HostToEditorMessage =
  | {
      kind: "init";
      /** Initial SDCPN the editor should load into its handle. */
      initialDefinition: SDCPN;
      /** Initial title (mirrored into the editor's title state). */
      initialTitle: string;
      /** Whether the editor should be read-only. */
      readonly: boolean;
      mode: HostNetMode;
      /** The "last-saved" snapshot at init time (null for unsaved drafts). */
      savedSnapshot: SavedSnapshot;
      /**
       * Initial revision list for the version picker (newest first). Empty
       * for drafts and brand-new saved nets.
       */
      revisions: RevisionSummary[];
    }
  | {
      /**
       * Replace the editor's contents wholesale. Used when the user picks a
       * past revision in the version picker (the host fetches the revision
       * and forwards it), or when the URL navigates to a different net.
       */
      kind: "load";
      definition: SDCPN;
      title: string;
      mode: HostNetMode;
      savedSnapshot: SavedSnapshot;
      /**
       * Updated revision list. Included in `load` so a net-switch can swap
       * content + revisions atomically without the version picker briefly
       * showing the previous net's history.
       */
      revisions: RevisionSummary[];
    }
  | {
      /**
       * Update read-only state without touching the document (e.g. when the
       * persisted-net record is refreshed and permissions changed).
       */
      kind: "setReadonly";
      readonly: boolean;
    }
  | {
      /** Push the latest revision list to the version picker. */
      kind: "revisionsList";
      revisions: RevisionSummary[];
    }
  | {
      /**
       * Reply to a `requestSave`. On success carries the new entity id (the
       * host has either created or updated the underlying entity) and the
       * updated saved snapshot the editor should treat as canonical. The
       * revision list that includes the new revision arrives separately, as
       * `revisionsList`, once the host's history refetch lands.
       */
      kind: "saveResult";
      requestId: string;
      result:
        | {
            ok: true;
            mode: HostNetMode;
            savedSnapshot: NonNullable<SavedSnapshot>;
          }
        | { ok: false; error: string };
    };

/**
 * Messages sent by the editor (Petrinaut + bridge) to the host.
 */
export type EditorToHostMessage =
  | {
      /**
       * Sent once after the editor has mounted and its bridge is ready to
       * receive messages. The host responds with `init`.
       */
      kind: "ready";
    }
  | {
      /**
       * Editor-computed dirty flag (live SDCPN vs the `savedSnapshot` it last
       * received). The host caches this for the discard-changes modal and the
       * `beforeunload` guard.
       */
      kind: "dirtyChanged";
      isDirty: boolean;
    }
  | {
      /**
       * Title is owned by the editor; emitted on every change so the host
       * can mirror it into the document title or into a heading rendered
       * around the editor.
       */
      kind: "titleChanged";
      title: string;
    }
  | {
      /**
       * User clicked the save/create button. The host should persist
       * `definition` + `title` to the graph and reply with `saveResult` —
       * including on failure. The editor waits for the matching `requestId`
       * before un-disabling the save button.
       */
      kind: "requestSave";
      requestId: string;
      definition: SDCPN;
      title: string;
    }
  | {
      /**
       * Back arrow click. The host typically navigates to `/processes`.
       */
      kind: "requestNavigateBack";
    }
  | {
      /**
       * User picked a revision in the version picker. The host looks up the
       * revision in its already-fetched data and replies with `load`.
       */
      kind: "requestRevision";
      decisionTime: string;
    }
  | {
      /**
       * An error Petrinaut caught itself (its boundaries keep these from the
       * app's `ErrorBoundary`), forwarded so the host captures it in Sentry
       * tagged with the net the user was editing.
       *
       * `name` / `message` / `stack` are extracted editor-side from the
       * thrown value so the host doesn't have to deal with non-Error values.
       */
      kind: "reportError";
      source: "petrinaut";
      name: string;
      message: string;
      stack: string | undefined;
      /**
       * Active net mode at the time of the error, if known. Lets the host
       * tag the Sentry event with which net the user was editing.
       */
      mode: HostNetMode | null;
      /** Tags Petrinaut attached, such as a failing plugin's id and place. */
      tags?: Record<string, string | number | boolean>;
    };

const hostToEditorMessageKinds: ReadonlySet<string> = new Set<
  HostToEditorMessage["kind"]
>(["init", "load", "setReadonly", "revisionsList", "saveResult"]);

export const isHostToEditorMessage = (
  data: unknown,
): data is HostToEditorMessage => {
  if (typeof data !== "object" || data === null) {
    return false;
  }

  const record = data as Record<string, unknown>;
  if (typeof record.kind !== "string") {
    return false;
  }

  return hostToEditorMessageKinds.has(record.kind);
};

const editorToHostMessageKinds: ReadonlySet<string> = new Set<
  EditorToHostMessage["kind"]
>([
  "ready",
  "dirtyChanged",
  "titleChanged",
  "requestSave",
  "requestNavigateBack",
  "requestRevision",
  "reportError",
]);

export const isEditorToHostMessage = (
  data: unknown,
): data is EditorToHostMessage => {
  if (typeof data !== "object" || data === null) {
    return false;
  }

  const record = data as Record<string, unknown>;
  if (typeof record.kind !== "string") {
    return false;
  }

  return editorToHostMessageKinds.has(record.kind);
};

let requestIdCounter = 0;

/**
 * Produces a process-local request id for matching `requestSave` -> `saveResult`
 * round-trips. Doesn't need cross-tab uniqueness (each window has its own
 * counter and the matching is done within a single host<->editor pair).
 */
export const nextRequestId = (): string => {
  requestIdCounter += 1;
  return `req-${Date.now()}-${requestIdCounter}`;
};
