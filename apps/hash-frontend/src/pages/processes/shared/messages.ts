import { z } from "zod";

import type { EntityId } from "@blockprotocol/type-system";
import type { PetrinautProps, SDCPN } from "@hashintel/petrinaut";
import type { PetrinautOptimizationInput } from "@hashintel/petrinaut-core";

export type PetrinautAiMessage = NonNullable<
  NonNullable<PetrinautProps["aiAssistant"]>["messages"]
>[number];

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
 * Host features that depend on HASH deployment configuration rather than on
 * the contents of the active net. The authenticated host resolves these and
 * sends them into the sandboxed iframe explicitly.
 */
export const petrinautHostCapabilitiesSchema = z.strictObject({
  optimization: z.boolean(),
});

export type PetrinautHostCapabilities = z.infer<
  typeof petrinautHostCapabilitiesSchema
>;

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
      /**
       * Persisted AI-assistant conversation for the net being loaded. Empty
       * for nets with no saved conversation (and for drafts, which the host
       * deliberately never restores). The iframe seeds the assistant panel
       * with these as its initial messages.
       */
      aiMessages: PetrinautAiMessage[];
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
      /**
       * Persisted AI-assistant conversation for the net being switched to.
       */
      aiMessages: PetrinautAiMessage[];
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
      /**
       * Update deployment-backed Petrinaut capabilities. This is separate
       * from service health: a configured optimizer remains available in the
       * UI when its container is temporarily unreachable.
       */
      kind: "setCapabilities";
      capabilities: PetrinautHostCapabilities;
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
    }
  | {
      /**
       * First reply to an `aiChatRequest`, carrying the proxied HTTP
       * response's status. Sent before any `aiChatChunk`. The iframe's chat
       * transport uses this to construct the `Response` it hands back to the
       * AI SDK (so a non-`ok` status surfaces as a chat error).
       */
      kind: "aiChatResponseStart";
      requestId: string;
      ok: boolean;
      status: number;
      statusText: string;
    }
  | {
      /**
       * A chunk of the proxied AI response body, forwarded verbatim. The host
       * is deliberately agnostic to the stream's contents — it just relays
       * bytes so the iframe can parse them with the AI SDK's own decoder.
       */
      kind: "aiChatChunk";
      requestId: string;
      bytes: Uint8Array;
    }
  | {
      /** The proxied AI response body completed normally. */
      kind: "aiChatEnd";
      requestId: string;
    }
  | {
      /**
       * The proxied fetch failed before/while streaming a response (network
       * error, abort). Distinct from a non-`ok` `aiChatResponseStart`, which
       * carries an HTTP error body the iframe still reads as a stream.
       */
      kind: "aiChatError";
      requestId: string;
      message: string;
    }
  | {
      /** First reply to an `optimizationRequest`. */
      kind: "optimizationResponseStart";
      requestId: string;
      ok: boolean;
      status: number;
      statusText: string;
    }
  | {
      /** A verbatim chunk of the optimizer's NDJSON response body. */
      kind: "optimizationChunk";
      requestId: string;
      bytes: Uint8Array;
    }
  | {
      /** The proxied optimization response completed normally. */
      kind: "optimizationEnd";
      requestId: string;
    }
  | {
      /** The optimization fetch failed before or while streaming. */
      kind: "optimizationError";
      requestId: string;
      message: string;
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
    }
  | {
      /**
       * Relay an AI assistant chat request to the host so it can be fetched
       * against HASH's authenticated API (the sandboxed iframe can't reach it
       * directly). `body` is the JSON request body the AI SDK produced; the
       * host streams the response back via `aiChatResponseStart` /
       * `aiChatChunk` / `aiChatEnd` / `aiChatError`, all keyed by `requestId`.
       */
      kind: "aiChatRequest";
      requestId: string;
      body: string;
    }
  | {
      /**
       * Abort an in-flight `aiChatRequest` (the user stopped the assistant or
       * the chat component unmounted). The host aborts the underlying fetch.
       */
      kind: "aiChatAbort";
      requestId: string;
    }
  | {
      /**
       * Ask the authenticated host to start a Petrinaut optimization. The
       * host validates this public request before forwarding it to NodeAPI.
       */
      kind: "optimizationRequest";
      requestId: string;
      input: PetrinautOptimizationInput;
    }
  | {
      /** Abort the matching in-flight optimization all the way upstream. */
      kind: "optimizationAbort";
      requestId: string;
    }
  | {
      /**
       * The AI-assistant conversation changed (a turn finished, or the
       * conversation was cleared). The host persists `messages` to
       * `localStorage` keyed by the currently-loaded net, so reopening the
       * net restores the conversation.
       */
      kind: "aiMessagesChanged";
      messages: PetrinautAiMessage[];
    }
  | {
      /**
       * The user explicitly cleared the conversation. The host deletes the
       * persisted entry for the currently-loaded net.
       */
      kind: "aiMessagesCleared";
    };

const hostToIframeMessageKinds: ReadonlySet<string> = new Set<
  HostToIframeMessage["kind"]
>([
  "init",
  "load",
  "setReadonly",
  "setCapabilities",
  "revisionsList",
  "saveResult",
  "aiChatResponseStart",
  "aiChatChunk",
  "aiChatEnd",
  "aiChatError",
  "optimizationResponseStart",
  "optimizationChunk",
  "optimizationEnd",
  "optimizationError",
]);

export const isHostToIframeMessage = (
  data: unknown,
): data is HostToIframeMessage => {
  if (typeof data !== "object" || data === null) {
    return false;
  }

  const record = data as Record<string, unknown>;
  if (typeof record.kind !== "string") {
    return false;
  }

  if (record.kind === "setCapabilities") {
    return petrinautHostCapabilitiesSchema.safeParse(record.capabilities)
      .success;
  }

  return hostToIframeMessageKinds.has(record.kind);
};

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
