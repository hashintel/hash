import type { FreeTextAffordance } from './affordance.ts';
import { toolName } from './naming.ts';

export const ASK_TOOL_DESCRIPTION =
  'Ask one free-text question and suspend this turn for the person’s reply. A second ask in the same tool batch is rejected.';

export type PendingAffordanceDecision =
  | { readonly ok: true; readonly pending: FreeTextAffordance }
  | { readonly ok: false; readonly reason: string };

export interface ReplyBindingSignalPayload {
  readonly type: 'affordance-reply-bound';
  readonly tagName: 'affordance-reply-bound';
  readonly body: string;
  readonly attributes: { readonly affordanceId: string };
}

/** Mint the durable free-text affordance carried by an ask tool result. */
export function mintAskAffordance(question: string, callId: string): FreeTextAffordance {
  return {
    id: `affordance_${callId}`,
    form: 'free-text',
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
    type: 'affordance-reply-bound',
    tagName: 'affordance-reply-bound',
    body: `The immediately preceding user message is mechanically bound as the reply to this pending affordance:\n\n${pending.markdown}`,
    attributes: { affordanceId: pending.id },
  };
}

/** Render-invariant instruction fragments for the ask/suspension protocol. */
export function askProtocolInstructionFragments(targetDomain: string): readonly string[] {
  return [
    `You are interviewing someone to elicit ${targetDomain}.`,
    `Ask one question at a time with ${toolName('ask')}.`,
    'Continue the conversation after each reply, using the harness-provided reply binding as a mechanical fact.',
  ];
}
