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
  advanceSweepHighWater,
  askProtocolInstructionFragments,
  buildSettlementCheckSignal,
  buildReplyBindingSignalPayload,
  buildSweepExtractionPrompt,
  buildSweepRepairSignal,
  computeUnaccountedAskAdvisories,
  createSweepExtractionResultSchema,
  createInitialSweepState,
  decidePendingAffordance,
  decideSettlementTrigger,
  mintAskAffordance,
  parseSweepState,
  pendingSweepRepair,
  reopenSweepAfterRefusal,
  settlementProtocolInstructionFragments,
  sweepableRange,
  toolName,
  type CaptureStore,
  type FreeTextAffordanceValue,
  type Plugin,
  type SweepState,
} from '@brunch/core';
import {
  useAgentFinish,
  useAgentStart,
  useDataWriter,
  useDelivery,
  usePersistentState,
  useTool,
} from '@flue/runtime';
import * as v from 'valibot';
import { capturedUserEntryIdsForSession } from './capture-accounting.ts';
import { projectFlueHistoryForSweep, type FlueHistoryReader } from './history-reader.ts';

const SweepToolOutput = v.looseObject({
  status: v.picklist(['no-settled-range', 'refused', 'applied']),
});

export { CAPABILITIES, type Capability, type Provision } from './capabilities.ts';
export {
  createFlueHistoryReader,
  projectFlueHistoryForSweep,
  type FlueHistoryReaderOptions,
} from './history-reader.ts';
export {
  createFlueReplyProjector,
  type FlueReplyProjector,
  type FlueReplyProjectorOptions,
} from './reply-projector.ts';
export { createLocalCaptureStore } from './local-capture-store.ts';

export interface ElicitationSession {
  readonly sessionId: string;
  readonly captureStore: CaptureStore;
  readonly historyReader: FlueHistoryReader;
}

/**
 * Mount the elicitation harness in a Flue agent.
 *
 * Flue has no ask-the-user primitive, so the harness owns the turn-suspension
 * protocol: a `terminate: true` ask tool, the pending affordance in
 * per-session state, and the answer arriving as a fresh dispatch (spec §7.4).
 */
export function useElicitation(plugin: Plugin, session: ElicitationSession): string {
  const delivery = useDelivery();
  const [pending, setPending] = usePersistentState<FreeTextAffordanceValue | null>(
    'pendingAffordance',
    null,
  );
  const [storedSweepState, setSweepState] = usePersistentState<SweepState>(
    'sweepHighWater',
    createInitialSweepState(),
  );
  let pendingAtFinish = pending;
  let sweepState = parseSweepState(storedSweepState);
  const extractionResult = createSweepExtractionResultSchema(plugin);
  const writeAffordance = useDataWriter('affordance', { schema: FreeTextAffordance });

  useAgentStart((ctx) => {
    if (delivery.kind !== 'user' || pending === null) return;

    pendingAtFinish = null;
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
        pendingAtFinish = decision.pending;
        return decision.pending;
      });
      writeAffordance(affordance);

      return { output: affordance, terminate: true };
    },
  });

  useTool({
    name: toolName('sweep'),
    description:
      'Apply or replay the settled conversation prefix. The harness privately extracts quote-anchored captures, refreshes durable history immediately before atomic application, and advances sweep state only on success.',
    input: v.strictObject({}),
    output: SweepToolOutput,
    harness: true,
    durable: true,
    async run({ harness, signal, step }) {
      const historyAtJudgment = await step.do('read-settled-range', async () =>
        projectFlueHistoryForSweep(await session.historyReader.peek(session.sessionId)),
      );
      const range = sweepableRange(historyAtJudgment);
      const throughUserEntryId = range.at(-1)?.id;
      if (!throughUserEntryId) {
        return { output: { status: 'no-settled-range' as const } };
      }

      const extraction = await step.do(
        'extract-sweep-proposals',
        async () =>
          (
            await harness.prompt(
              buildSweepExtractionPrompt(
                {
                  targetDomain: plugin.targetDomain,
                  proposalNames: plugin.proposalCatalog.map((proposal) => proposal.name),
                },
                range,
              ),
              { result: extractionResult, signal },
            )
          ).data,
      );

      // This read is intentionally adjacent to application: its binding-owned
      // archive write makes every quote resolvable before the store sees it.
      await step.do('refresh-history-before-apply', async () =>
        projectFlueHistoryForSweep(await session.historyReader.read(session.sessionId)),
      );
      const applied = await step.do('apply-sweep', () =>
        session.captureStore.execute(
          {
            type: 'apply-sweep',
            // The plugin schema narrows the existing envelope here; the store
            // repeats envelope validation and owns anchoring at apply.
            proposals: extraction.proposals,
          },
          { sessionId: session.sessionId },
        ),
      );
      if (!applied.ok) {
        sweepState = reopenSweepAfterRefusal(sweepState);
        setSweepState(sweepState);
        return { output: { status: 'refused' as const, refusal: applied.refusal } };
      }

      sweepState = advanceSweepHighWater(sweepState, throughUserEntryId);
      setSweepState(sweepState);
      const accountedEntryIds = await capturedUserEntryIdsForSession(
        session.captureStore,
        applied.snapshot,
        session.sessionId,
      );
      return {
        output: {
          status: 'applied' as const,
          appliedCaptureIds:
            'appliedCaptureIds' in applied.value ? applied.value.appliedCaptureIds : [],
          skippedDedupKeys:
            'skippedDedupKeys' in applied.value ? applied.value.skippedDedupKeys : [],
          advisories: [
            ...('advisories' in applied.value ? applied.value.advisories : []),
            ...computeUnaccountedAskAdvisories(range, accountedEntryIds),
          ],
        },
      };
    },
  });

  useAgentFinish(async (ctx) => {
    // useAgentFinish also fires on terminate:true asks. The callback's local
    // view is updated by ask/reply callbacks in this render, so it observes the
    // live slot rather than the render-time persistent-state snapshot.
    if (pendingAtFinish !== null) return;

    const entries = projectFlueHistoryForSweep(await session.historyReader.peek(session.sessionId));
    const repair = pendingSweepRepair(entries);
    if (repair) {
      ctx.append({ kind: 'signal', ...buildSweepRepairSignal(repair) });
      return;
    }
    const decision = decideSettlementTrigger({
      entries,
      state: sweepState,
      pendingAffordance: false,
    });
    if (decision.action !== 'nudge') return;

    sweepState = decision.nextState;
    setSweepState(sweepState);
    ctx.append({ kind: 'signal', ...buildSettlementCheckSignal(decision.tail) });
  });

  return [
    ...askProtocolInstructionFragments(plugin.targetDomain),
    ...settlementProtocolInstructionFragments(),
  ].join('\n\n');
}
