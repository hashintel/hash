/**
 * Derive whether the model's most recent net observation is still the most
 * recent net the conversation has recorded. A fold over the net ledger: the
 * last verified read against the last recorded change (an applied mutation's
 * post hash, or a layout's post hash). Anything the ledger could not vouch
 * for makes the answer conservative; it never makes it confident.
 */
import { isReadPetrinautNetToolName } from "@hashintel/brunch-agent-plugin-sdcpn";

import { deriveNetLedger } from "./net-ledger.ts";

import type { FlueConversationSnapshot } from "@flue/sdk";
import type { BrowserContext } from "@hashintel/brunch-agent-plugin-sdcpn/flue";

/** Signal appended at user-turn start when the model must read before relying on the net. */
export const NET_STALE_SIGNAL = "brunch.net-stale";

export type NetFreshness =
  | { readonly kind: "never-read" }
  | {
      readonly kind: "stale";
      readonly lastReadHash: string;
      /** Undefined when a browser change left the current net unrecorded. */
      readonly lastKnownHash: string | undefined;
      readonly lastReadRevisionId?: string;
      readonly lastKnownRevisionId?: string;
      readonly reportedRevisionId?: string;
    }
  | {
      readonly kind: "current";
      readonly hash: string;
      readonly revisionId?: string;
    };

export const deriveNetFreshness = async (
  snapshot: FlueConversationSnapshot,
  browser: BrowserContext,
  reportedRevisionId?: string,
): Promise<NetFreshness> => {
  let lastReadHash: string | undefined;
  let lastKnownHash: string | undefined;
  let lastReadRevisionId: string | undefined;
  let lastKnownRevisionId: string | undefined;
  let unrecordedChange = false;
  for (const event of await deriveNetLedger(snapshot, browser)) {
    switch (event.kind) {
      case "read":
        lastReadHash = event.observation.sha256;
        lastKnownHash = event.observation.sha256;
        lastReadRevisionId = event.observation.revisionId;
        lastKnownRevisionId = event.observation.revisionId;
        unrecordedChange = false;
        break;
      case "mutation":
        lastKnownHash = event.postHash;
        lastKnownRevisionId = event.postRevisionId;
        unrecordedChange = false;
        break;
      case "layout":
        lastKnownHash = event.post.sha256;
        lastKnownRevisionId = event.post.revisionId;
        unrecordedChange = false;
        break;
      case "unrecorded":
        // An unverifiable read is not a read; an unrecorded change may have
        // changed the net.
        if (!isReadPetrinautNetToolName(event.toolName)) {
          unrecordedChange = true;
          lastKnownHash = undefined;
          lastKnownRevisionId = undefined;
        }
        break;
    }
  }
  if (lastReadHash === undefined) return { kind: "never-read" };
  const revisionChanged =
    lastReadRevisionId !== undefined &&
    lastKnownRevisionId !== undefined &&
    lastKnownRevisionId !== lastReadRevisionId;
  const reportedRevisionChanged =
    reportedRevisionId !== undefined &&
    (lastReadRevisionId !== reportedRevisionId ||
      lastKnownRevisionId !== reportedRevisionId);
  const currentRevisionUnconfirmed =
    lastReadRevisionId !== undefined && reportedRevisionId === undefined;
  if (
    unrecordedChange ||
    revisionChanged ||
    reportedRevisionChanged ||
    currentRevisionUnconfirmed ||
    (lastKnownHash !== undefined && lastKnownHash !== lastReadHash)
  )
    return {
      kind: "stale",
      lastReadHash,
      lastKnownHash,
      ...(lastReadRevisionId === undefined ? {} : { lastReadRevisionId }),
      ...(lastKnownRevisionId === undefined ? {} : { lastKnownRevisionId }),
      ...(reportedRevisionId === undefined ? {} : { reportedRevisionId }),
    };
  return {
    kind: "current",
    hash: lastReadHash,
    ...(reportedRevisionId === undefined && lastReadRevisionId === undefined
      ? {}
      : { revisionId: reportedRevisionId ?? lastReadRevisionId }),
  };
};

/** The one-line body the model reads; hashes only, never a definition. */
export const netStaleSignalBody = (
  freshness: Exclude<NetFreshness, { kind: "current" }>,
): string =>
  freshness.kind === "never-read"
    ? "No verified read of the current net exists in this conversation. Call read_petrinaut_net in its own proposal before explaining, reviewing, interviewing about, or changing the model."
    : `The net changed after your last verified read (${freshness.lastReadHash}${
        freshness.lastKnownHash === undefined
          ? "; the current state is unrecorded"
          : ` → ${freshness.lastKnownHash}`
      }). Call read_petrinaut_net in its own proposal before relying on the model.`;
