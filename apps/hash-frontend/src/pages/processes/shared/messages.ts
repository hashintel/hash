import type { EntityId } from "@blockprotocol/type-system";
import type { SDCPN } from "@hashintel/petrinaut";

/**
 * Metadata about the active net surfaced by the host. Mirrors the shape the
 * iframe needs to drive the version picker and to know what (if anything) it's
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
 * Snapshot the iframe should treat as the canonical "last-saved" state for
 * the purposes of dirty-tracking. The iframe compares its live SDCPN against
 * `definition` (and `title` against this title); when they diverge it emits
 * `dirtyChanged: { isDirty: true }`.
 *
 * `null` means "there is no saved state to compare against" (a brand-new
 * draft) — in that case the iframe treats every non-empty edit as dirty.
 */
export type SavedSnapshot = {
  definition: SDCPN;
  title: string;
  /** Decision-time of the snapshot, used to drive the version picker. */
  decisionTime: string | null;
} | null;

/**
 * Messages sent by the host (process-editor) into the iframe.
 */
export type HostToIframeMessage =
  | {
      kind: "init";
      /** Initial SDCPN the iframe should load into its handle. */
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
       * updated saved snapshot the iframe should treat as canonical.
       */
      kind: "saveResult";
      requestId: string;
      result:
        | {
            ok: true;
            mode: HostNetMode;
            savedSnapshot: NonNullable<SavedSnapshot>;
            revisions: RevisionSummary[];
          }
        | { ok: false; error: string };
    };

/**
 * Messages sent by the iframe (Petrinaut + bridge) up to the host.
 */
export type IframeToHostMessage =
  | {
      /**
       * Sent once after the iframe has mounted and its bridge is ready to
       * receive messages. The host responds with `init`.
       */
      kind: "ready";
    }
  | {
      /**
       * Iframe-computed dirty flag (live SDCPN vs the `savedSnapshot` it last
       * received). The host caches this for the discard-changes modal and the
       * `beforeunload` guard.
       */
      kind: "dirtyChanged";
      isDirty: boolean;
    }
  | {
      /**
       * Title is owned by the iframe; emitted on every change so the host
       * can mirror it into the document title or into a heading rendered
       * around the iframe.
       */
      kind: "titleChanged";
      title: string;
    }
  | {
      /**
       * User clicked the save/create button. The host should persist
       * `definition` + `title` to the graph and reply with `saveResult` —
       * including on failure. The iframe waits for the matching `requestId`
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
       * Forwarded error from inside the iframe. The host's Sentry SDK
       * captures it because the iframe's strict CSP blocks Sentry's own
       * transport, and because attribution to the host's authenticated
       * user is more useful than a free-standing iframe report.
       *
       * `name` / `message` / `stack` are extracted iframe-side from the
       * thrown value so the host doesn't have to deal with non-Error
       * `reason` values from `unhandledrejection` etc.
       */
      kind: "reportError";
      source: "react" | "window-error" | "unhandled-rejection";
      name: string;
      message: string;
      stack: string | undefined;
      /**
       * Active net mode at the time of the error, if known. Lets the host
       * tag the Sentry event with which net the user was editing.
       */
      mode: HostNetMode | null;
    };

export const isHostToIframeMessage = (
  data: unknown,
): data is HostToIframeMessage =>
  typeof data === "object" &&
  data !== null &&
  typeof (data as { kind?: unknown }).kind === "string";

export const isIframeToHostMessage = (
  data: unknown,
): data is IframeToHostMessage =>
  typeof data === "object" &&
  data !== null &&
  typeof (data as { kind?: unknown }).kind === "string";

let requestIdCounter = 0;

/**
 * Produces a process-local request id for matching `requestSave` -> `saveResult`
 * round-trips. Doesn't need cross-tab uniqueness (each iframe has its own
 * counter and the matching is done within a single host<->iframe pair).
 */
export const nextRequestId = (): string => {
  requestIdCounter += 1;
  return `req-${Date.now()}-${requestIdCounter}`;
};
