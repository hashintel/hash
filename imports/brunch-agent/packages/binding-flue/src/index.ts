/**
 * `@brunch/binding-flue` — the Flue binding.
 *
 * One binding per substrate. It implements the substrate-capability list
 * (spec §10), owns the local capture-store/session-log storage-port
 * implementation (spec §9.6), and is the
 * only shell allowed to know Flue's dialect: **the harness imports no
 * substrate; a binding imports both** (spec §4).
 *
 * Every time mechanism wants to land in here, the second-binding test applies
 * (spec §14.2): genuinely substrate-specific, or mechanism leaking into Flue's
 * dialect?
 */

import {
  ASK_TOOL_DESCRIPTION,
  AskInput,
  FreeTextAffordance,
  askProtocolInstructionFragments,
  buildReplyBindingSignalPayload,
  decidePendingAffordance,
  mintAskAffordance,
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
export {
  createFlueHistoryReader,
  type FlueHistoryReader,
  type FlueHistoryReaderOptions,
} from './history-reader.ts';
export { createLocalCaptureStore } from './local-capture-store.ts';

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
    ctx.append({ kind: 'signal', ...buildReplyBindingSignalPayload(pending) });
  });

  useTool({
    name: toolName('ask'),
    description: ASK_TOOL_DESCRIPTION,
    input: AskInput,
    output: FreeTextAffordance,
    run({ data, toolCallId }) {
      const affordance = mintAskAffordance(data.question, toolCallId);

      setPending((current) => {
        const decision = decidePendingAffordance(current, affordance);
        if (!decision.ok) throw new Error(decision.reason);
        return decision.pending;
      });
      writeAffordance(affordance);

      return { output: affordance, terminate: true };
    },
  });

  return askProtocolInstructionFragments(plugin.targetDomain).join('\n\n');
}
