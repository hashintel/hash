import { toolName } from "./naming";

import type { FreeTextAffordance } from "./affordance";
import type { SweepSessionEntry } from "./sweep-protocol";

export { AskSubmission } from "./ask-tool-contract";

export const ASK_TOOL_DESCRIPTION =
  "Ask one free-text question and suspend this turn for the person’s reply. A second ask in the same tool batch is rejected.";

export type PendingAffordanceDecision =
  | { readonly ok: true; readonly pending: FreeTextAffordance }
  | { readonly ok: false; readonly reason: string };

export interface ReplyBindingSignalPayload {
  readonly type: "affordance-reply-bound";
  readonly tagName: "affordance-reply-bound";
  readonly body: string;
  readonly attributes: { readonly affordanceId: string };
}

/** The affordance id an ask tool call mints — the wire-level correlation key. */
export function askAffordanceId(callId: string): string {
  return `affordance_${callId}`;
}

/** Mint the durable free-text affordance carried by an ask tool result. */
export function mintAskAffordance(
  question: string,
  callId: string,
): FreeTextAffordance {
  return {
    id: askAffordanceId(callId),
    form: "free-text",
    markdown: question,
    payload: { question },
  };
}

/** Decide whether a candidate may occupy the one-live-affordance slot. */
export function decidePendingAffordance(
  current: FreeTextAffordance | null,
  candidate: FreeTextAffordance,
): PendingAffordanceDecision {
  if (current !== null) {
    return {
      ok: false,
      reason: `An interactive affordance is already pending (${current.id}); wait for its reply before asking another question.`,
    };
  }
  return { ok: true, pending: candidate };
}

/** Describe the mechanical binding between a user dispatch and its pending affordance. */
export function buildReplyBindingSignalPayload(
  pending: FreeTextAffordance,
): ReplyBindingSignalPayload {
  return {
    type: "affordance-reply-bound",
    tagName: "affordance-reply-bound",
    body: `The immediately preceding user message is mechanically bound as the reply to this pending affordance:\n\n${pending.markdown}`,
    attributes: { affordanceId: pending.id },
  };
}

export type AskReplyAdmission =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: "no-pending-ask" | "different-ask-pending";
    };

/**
 * The affordance id of the one ask still awaiting its reply, from projected
 * durable history. An affordance is pending once emitted and stops being
 * pending when a later entry is bound as its reply.
 */
export function pendingAskAffordanceId(
  entries: readonly SweepSessionEntry[],
): string | undefined {
  const answered = new Set<string>();
  for (const entry of entries) {
    if (entry.replyToAffordanceId !== undefined)
      answered.add(entry.replyToAffordanceId);
  }
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    for (const affordance of entries[index]!.affordances ?? []) {
      if (!answered.has(affordance.id)) return affordance.id;
    }
  }
  return undefined;
}

/**
 * Decide whether one submitted ask answer may become the user-affordance
 * reply. Only the currently pending ask's correlated submission is admitted;
 * stale, duplicate, and forged tool-call ids are refused before any dispatch.
 */
export function decideAskReplyAdmission(
  pendingAffordanceId: string | undefined,
  submittedToolCallId: string,
): AskReplyAdmission {
  if (pendingAffordanceId === undefined)
    return { ok: false, reason: "no-pending-ask" };
  if (pendingAffordanceId !== askAffordanceId(submittedToolCallId)) {
    return { ok: false, reason: "different-ask-pending" };
  }
  return { ok: true };
}

/** Render-invariant instruction fragments for the ask/suspension protocol. */
export function askProtocolInstructionFragments(
  targetFormalism: string,
): readonly string[] {
  return [
    `You are interviewing someone to elicit ${targetFormalism}.`,
    `Ask one question at a time with ${toolName("ask")}.`,
    "Continue the conversation after each reply, using the harness-provided reply binding as a mechanical fact.",
  ];
}
