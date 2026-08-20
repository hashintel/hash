/**
 * `@brunch/binding-flue` — the Flue binding.
 *
 * One binding per substrate. It implements the substrate-capability list
 * (spec §10), owns the storage-port implementation (spec §9.6), and is the
 * only shell allowed to know Flue's dialect: **the harness imports no
 * substrate; a binding imports both** (spec §4).
 *
 * Every time mechanism wants to land in here, the second-binding test applies
 * (spec §14.2): genuinely substrate-specific, or mechanism leaking into Flue's
 * dialect?
 */

import {
  AskInput,
  FreeTextAffordance,
  toolName,
  type FreeTextAffordanceValue,
  type Plugin,
} from '@brunch/core';
import {
  useAgentStart,
  useDataWriter,
  useDelivery,
  usePersistentState,
  useTool,
} from '@flue/runtime';

export { CAPABILITIES, type Capability, type Provision } from './capabilities.ts';

/**
 * Mount the elicitation harness in a Flue agent.
 *
 * Flue has no ask-the-user primitive, so the harness owns the turn-suspension
 * protocol: a `terminate: true` ask tool, the pending affordance in
 * per-session state, and the answer arriving as a fresh dispatch (spec §7.4).
 */
export function useElicitation(plugin: Plugin): string {
  const delivery = useDelivery();
  const [pending, setPending] = usePersistentState<FreeTextAffordanceValue | null>(
    'pendingAffordance',
    null,
  );
  const writeAffordance = useDataWriter('affordance', { schema: FreeTextAffordance });

  useAgentStart((ctx) => {
    if (delivery.kind !== 'user' || pending === null) return;

    setPending(null);
    ctx.append({
      kind: 'signal',
      type: 'affordance-reply-bound',
      tagName: 'affordance-reply-bound',
      body: `The immediately preceding user message is mechanically bound as the reply to this pending affordance:\n\n${pending.markdown}`,
      attributes: { affordanceId: pending.id },
    });
  });

  useTool({
    name: toolName('ask'),
    description:
      'Ask one free-text question and suspend this turn for the person’s reply. A second ask in the same tool batch is rejected.',
    input: AskInput,
    output: FreeTextAffordance,
    run({ data, toolCallId }) {
      const affordance: FreeTextAffordanceValue = {
        id: `affordance_${toolCallId}`,
        form: 'free-text',
        markdown: data.question,
        payload: { question: data.question },
      };

      setPending((current) => {
        if (current !== null) {
          throw new Error(
            `An interactive affordance is already pending (${current.id}); wait for its reply before asking another question.`,
          );
        }
        return affordance;
      });
      writeAffordance(affordance);

      return { output: affordance, terminate: true };
    },
  });

  return [
    `You are interviewing someone to elicit ${plugin.targetDomain}.`,
    `Ask one question at a time with ${toolName('ask')}.`,
    'Continue the conversation after each reply, using the harness-provided reply binding as a mechanical fact.',
  ].join('\n\n');
}
