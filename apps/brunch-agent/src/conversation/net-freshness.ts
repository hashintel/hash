/**
 * Derive whether the model's most recent net observation is still the most
 * recent net the conversation has recorded. Flue history is the only ledger:
 * verified `getLatestNetDefinition` results and applied browser mutations with
 * verified post observations, folded in recorded order. Anything unverifiable
 * makes the answer conservative; it never makes it confident.
 */
import {
  mutatePetrinetInputSchema,
  mutatePetrinetToolName,
  parseClientToolResultMetadata,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import { clientToolHistoryFrom } from "@hashintel/brunch-agent-transport-aisdk";
import {
  getLatestNetDefinitionToolName,
  getNetCompilationErrorsToolName,
  readPetrinautDocToolName,
} from "@hashintel/petrinaut-core/ai";

import { CLIENT_TOOL_RESULT_SIGNAL, isAwaitingClient } from "./client-tools.ts";
import { verifyMutatePetrinetAttempts } from "./root-arc.ts";
import { recordedBrowserObservation } from "./why.ts";

import type { FlueConversationPart, FlueConversationSnapshot } from "@flue/sdk";
import type { BrowserContext } from "@hashintel/brunch-agent-plugin-sdcpn/flue";
import type { ClientToolHistoryResult } from "@hashintel/brunch-agent-transport-aisdk";

/** Signal appended at user-turn start when the model must read before relying on the net. */
export const NET_STALE_SIGNAL = "brunch.net-stale";

export type NetFreshness =
  | { readonly kind: "never-read" }
  | {
      readonly kind: "stale";
      readonly lastReadHash: string;
      /** Undefined when a browser mutation left the current net unrecorded. */
      readonly lastKnownHash: string | undefined;
    }
  | { readonly kind: "current"; readonly hash: string };

/** Browser-executed tools that observe the net without changing it. */
const nonMutatingBrowserTools: ReadonlySet<string> = new Set([
  getLatestNetDefinitionToolName,
  getNetCompilationErrorsToolName,
  readPetrinautDocToolName,
]);

/** The final verified post hash of a non-unknown admitted batch. */
const verifiedMutationPostHash = async (
  call: Extract<FlueConversationPart, { type: "dynamic-tool" }>,
  results: readonly ClientToolHistoryResult[],
  browser: BrowserContext,
): Promise<string | undefined> => {
  if (call.toolName !== mutatePetrinetToolName) return undefined;
  const delivered = results.filter(
    (result) => result.toolCallId === call.toolCallId,
  );
  const first = delivered[0];
  const mutationRecord = parseClientToolResultMetadata(
    first?.metadata,
  )?.mutationRecord;
  if (
    delivered.length !== 1 ||
    first?.toolName !== call.toolName ||
    mutationRecord === undefined ||
    mutationRecord.outcome === "unknown"
  )
    return undefined;
  try {
    const attempts = await verifyMutatePetrinetAttempts({
      toolCallId: call.toolCallId,
      batch: mutatePetrinetInputSchema.parse(call.input),
      binding: browser.binding,
      mutationRecord,
    });
    return attempts.at(-1)?.post?.sha256;
  } catch {
    return undefined;
  }
};

export const deriveNetFreshness = async (
  snapshot: FlueConversationSnapshot,
  browser: BrowserContext,
): Promise<NetFreshness> => {
  const results = clientToolHistoryFrom(
    snapshot.messages.filter(
      (message) =>
        message.role === "system" &&
        message.purpose === "dispatch" &&
        message.signal?.tagName === CLIENT_TOOL_RESULT_SIGNAL,
    ),
  ).results;
  let lastReadHash: string | undefined;
  let lastKnownHash: string | undefined;
  let unrecordedMutation = false;
  for (const message of snapshot.messages) {
    if (message.role !== "assistant" || message.purpose !== "assistant")
      continue;
    for (const call of message.parts) {
      if (
        call.type !== "dynamic-tool" ||
        call.state !== "output-available" ||
        !isAwaitingClient(call.output)
      )
        continue;
      if (call.toolName === getLatestNetDefinitionToolName) {
        try {
          // eslint-disable-next-line no-await-in-loop -- History order is the fold order.
          const observed = await recordedBrowserObservation(
            snapshot,
            browser,
            call.toolCallId,
          );
          lastReadHash = observed.sha256;
          lastKnownHash = observed.sha256;
          unrecordedMutation = false;
        } catch {
          // An unverifiable read is not a read.
        }
        continue;
      }
      if (nonMutatingBrowserTools.has(call.toolName)) continue;
      // eslint-disable-next-line no-await-in-loop -- History order is the fold order.
      const post = await verifiedMutationPostHash(call, results, browser);
      if (post === undefined) {
        // A mutation the ledger cannot vouch for may have changed the net.
        unrecordedMutation = true;
        lastKnownHash = undefined;
      } else {
        unrecordedMutation = false;
        lastKnownHash = post;
      }
    }
  }
  if (lastReadHash === undefined) return { kind: "never-read" };
  if (unrecordedMutation) return { kind: "stale", lastReadHash, lastKnownHash };
  if (lastKnownHash !== undefined && lastKnownHash !== lastReadHash)
    return { kind: "stale", lastReadHash, lastKnownHash };
  return { kind: "current", hash: lastReadHash };
};

/** The one-line body the model reads; hashes only, never a definition. */
export const netStaleSignalBody = (
  freshness: Exclude<NetFreshness, { kind: "current" }>,
): string =>
  freshness.kind === "never-read"
    ? "No verified read of the current net exists in this conversation. Call getLatestNetDefinition in its own proposal before explaining, reviewing, interviewing about, or changing the model."
    : `The net changed after your last verified read (${freshness.lastReadHash}${
        freshness.lastKnownHash === undefined
          ? "; the current state is unrecorded"
          : ` → ${freshness.lastKnownHash}`
      }). Call getLatestNetDefinition in its own proposal before relying on the model.`;
