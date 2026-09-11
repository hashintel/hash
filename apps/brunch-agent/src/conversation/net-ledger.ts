/**
 * The net ledger: one deterministic fold over canonical Flue history that
 * yields, in history order, every browser tool call that observed or changed
 * the net, with its record verified.
 *
 * It is a projection, not a store. It persists nothing, invents no
 * identities (each event is the assistant's own tool call at its own place in
 * history), keeps a missing or ambiguous record as an `unrecorded` event with
 * its reason rather than repairing or dropping it, takes no live Petrinaut
 * observation as input, and leaves Flue history the only authority.
 *
 * Freshness folds over these events. Whether why moves onto them too is
 * decided by a parity test against its own attribution walk, not assumed
 * here (see the shared-history-projection fog-line in MISSION.md).
 */
import {
  canonicalContent,
  isLayoutPetrinautNetToolName,
  isMutatePetrinautNetToolName,
  isReadPetrinautDocsToolName,
  isReadPetrinautDiagnosticsToolName,
  isReadPetrinautNetToolName,
  mutatePetrinetInputSchema,
  parseClientToolResultMetadata,
  verifyDefinitionObservation,
  type DefinitionObservation,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import { clientToolHistoryFrom } from "@hashintel/brunch-agent-transport-aisdk";

import { CLIENT_TOOL_RESULT_SIGNAL, isAwaitingClient } from "./client-tools.ts";
import { verifyMutatePetrinetAttempts } from "./root-arc.ts";

import type { FlueConversationSnapshot } from "@flue/sdk";
import type { BrowserContext } from "@hashintel/brunch-agent-plugin-sdcpn/flue";

/** The fold reads the conversation's binding and nothing else of the context. */
export type NetLedgerBrowser = BrowserContext | Pick<BrowserContext, "binding">;

/** Where in history the assistant made the call: message, then part. */
export interface NetLedgerPosition {
  readonly messageIndex: number;
  readonly partIndex: number;
}

export type NetLedgerEvent =
  | {
      readonly kind: "read";
      readonly toolCallId: string;
      readonly position: NetLedgerPosition;
      /** Verified: re-parsed and re-hashed from the recorded sidecar. */
      readonly observation: DefinitionObservation;
    }
  | {
      readonly kind: "mutation";
      readonly toolCallId: string;
      readonly toolName: string;
      readonly position: NetLedgerPosition;
      readonly outcome: string;
      /** Verified post hash of the last applied attempt in the record. */
      readonly postHash: string;
      /** Absent only for retained pre-revision records. */
      readonly postRevisionId?: string;
    }
  | {
      readonly kind: "layout";
      readonly toolCallId: string;
      readonly position: NetLedgerPosition;
      readonly pre: DefinitionObservation;
      readonly post: DefinitionObservation;
    }
  | {
      /** The call exists in history but its record cannot vouch for what it did. */
      readonly kind: "unrecorded";
      readonly toolCallId: string;
      readonly toolName: string;
      readonly position: NetLedgerPosition;
      readonly reason: string;
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const resultMessages = (snapshot: FlueConversationSnapshot) =>
  snapshot.messages.filter(
    (message) =>
      message.role === "system" &&
      message.purpose === "dispatch" &&
      message.signal?.tagName === CLIENT_TOOL_RESULT_SIGNAL,
  );

/** Browser-executed tools that observe the net without changing it. */
const isNonMutatingBrowserTool = (name: string): boolean =>
  isReadPetrinautNetToolName(name) ||
  isReadPetrinautDiagnosticsToolName(name) ||
  isReadPetrinautDocsToolName(name);

/** A model-selected ID selects a recorded browser observation, never a model-supplied hash. */
export const recordedBrowserObservation = async (
  snapshot: FlueConversationSnapshot,
  browser: NetLedgerBrowser,
  toolCallId: string,
): Promise<DefinitionObservation> => {
  const calls = snapshot.messages
    .flatMap((message) =>
      message.role === "assistant" && message.purpose === "assistant"
        ? message.parts
        : [],
    )
    .filter(
      (part) => part.type === "dynamic-tool" && part.toolCallId === toolCallId,
    );
  const call = calls[0];
  if (
    calls.length !== 1 ||
    call?.type !== "dynamic-tool" ||
    !isReadPetrinautNetToolName(call.toolName) ||
    call.state !== "output-available" ||
    !isAwaitingClient(call.output)
  )
    throw new Error("Unknown admitted browser observation call.");
  const results = clientToolHistoryFrom(
    resultMessages(snapshot),
  ).results.filter((result) => result.toolCallId === toolCallId);
  const first = results[0];
  const recorded = parseClientToolResultMetadata(first?.metadata)?.observation;
  if (
    !first ||
    results.length !== 1 ||
    results.some(
      (result) => canonicalContent(result) !== canonicalContent(first),
    ) ||
    first.toolName !== call.toolName ||
    recorded === undefined ||
    !isRecord(first.output)
  )
    throw new Error("Missing or conflicting correlated browser observation.");
  if (
    recorded.toolCallId !== toolCallId ||
    canonicalContent(recorded.binding) !== canonicalContent(browser.binding)
  )
    throw new Error(
      "Browser observation belongs to another conversation or document incarnation.",
    );
  const observation = await verifyDefinitionObservation(recorded.observed);
  if (
    canonicalContent(first.output.definition) !==
    canonicalContent(observation.definition)
  )
    throw new Error(
      "Browser read output differs from its independent observation.",
    );
  return observation;
};

/** The verified post observation of the last applied attempt, or undefined when the record cannot vouch for one. */
const appliedPostObservation = async (
  attempts: readonly unknown[],
): Promise<DefinitionObservation | undefined> => {
  let post: DefinitionObservation | undefined;
  for (const attempt of attempts) {
    if (!isRecord(attempt) || attempt.outcome !== "applied") continue;
    if (!isRecord(attempt.post)) return undefined;
    try {
      // eslint-disable-next-line no-await-in-loop -- Attempts commit in order; the last applied post wins.
      post = await verifyDefinitionObservation({
        definition: attempt.post.definition,
        sha256: String(attempt.post.sha256),
        revisionId: attempt.post.revisionId,
      });
    } catch {
      return undefined;
    }
  }
  return post;
};

const reasonOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * Fold canonical history into ledger events. Only the snapshot and the
 * conversation's binding are inputs; the construction flag and any live
 * document state are not.
 */
export const deriveNetLedger = async (
  snapshot: FlueConversationSnapshot,
  browser: NetLedgerBrowser,
): Promise<readonly NetLedgerEvent[]> => {
  const results = clientToolHistoryFrom(resultMessages(snapshot)).results;
  const deliveriesFor = (toolCallId: string) =>
    results.filter((result) => result.toolCallId === toolCallId);
  const events: NetLedgerEvent[] = [];

  for (const [messageIndex, message] of snapshot.messages.entries()) {
    if (message.role !== "assistant" || message.purpose !== "assistant")
      continue;
    for (const [partIndex, call] of message.parts.entries()) {
      if (
        call.type !== "dynamic-tool" ||
        call.state !== "output-available" ||
        !isAwaitingClient(call.output)
      )
        continue;
      const position: NetLedgerPosition = { messageIndex, partIndex };
      const { toolCallId, toolName } = call;
      const unrecorded = (reason: string): NetLedgerEvent => ({
        kind: "unrecorded",
        toolCallId,
        toolName,
        position,
        reason,
      });

      if (isReadPetrinautNetToolName(toolName)) {
        try {
          // eslint-disable-next-line no-await-in-loop -- History order is the fold order.
          const observation = await recordedBrowserObservation(
            snapshot,
            browser,
            toolCallId,
          );
          events.push({ kind: "read", toolCallId, position, observation });
        } catch (error) {
          events.push(unrecorded(reasonOf(error)));
        }
        continue;
      }
      if (isNonMutatingBrowserTool(toolName)) continue;

      const deliveries = deliveriesFor(toolCallId);
      const first = deliveries[0];
      if (first === undefined) {
        events.push(
          unrecorded("No browser result was delivered for this call."),
        );
        continue;
      }
      if (
        deliveries.some(
          (delivery) => canonicalContent(delivery) !== canonicalContent(first),
        )
      ) {
        events.push(
          unrecorded(
            "Conflicting browser results were delivered for this call.",
          ),
        );
        continue;
      }
      const metadata = parseClientToolResultMetadata(first.metadata);

      if (isLayoutPetrinautNetToolName(toolName)) {
        const layout = metadata?.layoutRecord;
        if (layout === undefined) {
          events.push(
            unrecorded("The layout result carries no layout record."),
          );
          continue;
        }
        if (
          layout.toolCallId !== toolCallId ||
          canonicalContent(layout.binding) !== canonicalContent(browser.binding)
        ) {
          events.push(
            unrecorded(
              "The layout record belongs to another call, conversation or document incarnation.",
            ),
          );
          continue;
        }
        try {
          // eslint-disable-next-line no-await-in-loop -- History order is the fold order.
          const [pre, post] = await Promise.all([
            verifyDefinitionObservation(layout.pre),
            verifyDefinitionObservation(layout.post),
          ]);
          events.push({ kind: "layout", toolCallId, position, pre, post });
        } catch (error) {
          events.push(unrecorded(reasonOf(error)));
        }
        continue;
      }

      const record = metadata?.mutationRecord;
      if (record === undefined) {
        events.push(
          unrecorded("The mutation result carries no mutation record."),
        );
        continue;
      }
      if (isMutatePetrinautNetToolName(toolName)) {
        try {
          const batch = mutatePetrinetInputSchema.parse(call.input);
          // eslint-disable-next-line no-await-in-loop -- History order is the fold order.
          const attempts = await verifyMutatePetrinetAttempts({
            toolCallId,
            batch,
            binding: browser.binding,
            output: first.output,
            mutationRecord: record,
          });
          const post = attempts.at(-1)?.post;
          if (post === undefined)
            throw new Error(
              "The mutation record cannot vouch for a verified post observation.",
            );
          events.push({
            kind: "mutation",
            toolCallId,
            toolName,
            position,
            outcome: record.outcome,
            postHash: post.sha256,
            ...(post.revisionId === undefined
              ? {}
              : { postRevisionId: post.revisionId }),
          });
        } catch (error) {
          events.push(
            unrecorded(
              `The mutation record cannot vouch for a verified post observation: ${reasonOf(error)}`,
            ),
          );
        }
        continue;
      }
      // eslint-disable-next-line no-await-in-loop -- History order is the fold order.
      const post = await appliedPostObservation(record.attempts);
      if (post === undefined) {
        events.push(
          unrecorded(
            "The mutation record cannot vouch for a verified post observation.",
          ),
        );
        continue;
      }
      events.push({
        kind: "mutation",
        toolCallId,
        toolName,
        position,
        outcome: record.outcome,
        postHash: post.sha256,
        ...(post.revisionId === undefined
          ? {}
          : { postRevisionId: post.revisionId }),
      });
    }
  }
  return events;
};
