/**
 * Suspended generalized typed-elicitation hook.
 *
 * This remains compiled and testable as prior implementation evidence, but it
 * is not exported by the binding and is not mounted by the production agent.
 */

import {
  useAgentFinish,
  useAgentStart,
  useDataWriter,
  useDelivery,
  usePersistentState,
  useTool,
} from "@flue/runtime";
import * as v from "valibot";

import {
  ASK_TOOL_DESCRIPTION,
  AskInput,
  FreeTextAffordance,
  SWEEP_RESULT_STATUSES,
  advanceSweepHighWater,
  askProtocolInstructionFragments,
  buildCompletionCueSignal,
  buildSettlementCheckSignal,
  buildReplyBindingSignalPayload,
  buildSweepExtractionPrompt,
  buildSweepList,
  buildSweepRepairSignal,
  completionDemands,
  computeUnaccountedAskAdvisories,
  createSweepExtractionResultSchema,
  createInitialSweepState,
  decidePendingAffordance,
  decideSettlementTrigger,
  deriveCaptureStatus,
  evaluateCompletion,
  foldElicitedModel,
  mintAskAffordance,
  parseSweepState,
  pendingSweepRepair,
  renderInstructions,
  reopenSweepAfterRefusal,
  settlementProtocolInstructionFragments,
  slotAssertionExtractionGuidance,
  sweepableRange,
  toolName,
  type CaptureStore,
  type CaptureStoreSnapshot,
  type FreeTextAffordanceValue,
  type Plugin,
  type SweepState,
} from "@hashintel/brunch-agent";
import { repertoire } from "@hashintel/brunch-agent/prompts";

import { capturedUserEntryIdsForSession } from "../capture-accounting";
import {
  projectFlueHistoryForSweep,
  type FlueHistoryReader,
} from "../history-reader";

const SweepToolOutput = v.looseObject({
  status: v.picklist(SWEEP_RESULT_STATUSES),
});

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
export function useElicitation(
  plugin: Plugin,
  session: ElicitationSession,
): string {
  const delivery = useDelivery();
  const [pending, setPending] =
    usePersistentState<FreeTextAffordanceValue | null>(
      "pendingAffordance",
      null,
    );
  const [storedSweepState, setSweepState] = usePersistentState<SweepState>(
    "sweepHighWater",
    createInitialSweepState(),
  );
  let pendingAtFinish = pending;
  let sweepState = parseSweepState(storedSweepState);
  const extractionResult = createSweepExtractionResultSchema(plugin);
  const { definition } = plugin;
  // The fold and the completion cue know slot assertions; a definition whose
  // proposals do not include them has a model the harness cannot yet fold.
  const slotModel =
    definition?.proposals.some((p) => p.type === "slot-asserted") === true
      ? definition
      : undefined;
  const demands =
    slotModel === undefined ? undefined : completionDemands(slotModel);
  // Read-time derivation, never stored: fold the active captures, evaluate
  // completion over the objective slices, and render the cue (ADR-0003,
  // ADR-0006). Returned as a tool result so the model sees a harness fact
  // without any state reaching the instructions.
  const completionCue = (snapshot: CaptureStoreSnapshot) => {
    if (slotModel === undefined || demands === undefined) return undefined;
    const model = foldElicitedModel(snapshot, slotModel);
    const report = evaluateCompletion(model, demands);
    const sweepList = buildSweepList(model, report, slotModel.patterns);
    return {
      ...report,
      unsatisfied: report.failures.length,
      unmapped: model.unmapped,
      cue: buildCompletionCueSignal(model, report, sweepList).body,
    };
  };
  const writeAffordance = useDataWriter("affordance", {
    schema: FreeTextAffordance,
  });

  useAgentStart((ctx) => {
    if (delivery.kind !== "user" || pending === null) return;

    pendingAtFinish = null;
    setPending(null);
    ctx.append({ kind: "signal", ...buildReplyBindingSignalPayload(pending) });
  });

  useTool({
    name: toolName("ask"),
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
    name: toolName("sweep"),
    description:
      "Apply or replay the settled conversation prefix. The harness privately extracts quote-anchored captures, refreshes durable history immediately before atomic application, and advances sweep state only on success.",
    input: v.strictObject({}),
    output: SweepToolOutput,
    harness: true,
    durable: true,
    async run({ harness, signal, step }) {
      const historyAtJudgment = await step.do("read-settled-range", async () =>
        projectFlueHistoryForSweep(
          await session.historyReader.peek(session.sessionId),
        ),
      );
      const range = sweepableRange(historyAtJudgment);
      const throughUserEntryId = range.at(-1)?.id;
      if (!throughUserEntryId) {
        return { output: { status: "no-settled-range" as const } };
      }

      const extraction = await step.do(
        "extract-sweep-proposals",
        async () =>
          (
            await harness.prompt(
              buildSweepExtractionPrompt(
                {
                  targetFormalism: plugin.targetFormalism,
                  proposalNames: plugin.proposalCatalog.map(
                    (proposal) => proposal.name,
                  ),
                  ...(slotModel === undefined
                    ? {}
                    : { guidance: slotAssertionExtractionGuidance(slotModel) }),
                },
                range,
              ),
              { result: extractionResult, signal },
            )
          ).data,
      );

      // This read is intentionally adjacent to application: its binding-owned
      // archive write makes every quote resolvable before the store sees it.
      await step.do("refresh-history-before-apply", async () =>
        projectFlueHistoryForSweep(
          await session.historyReader.read(session.sessionId),
        ),
      );
      const applied = await step.do("apply-sweep", () =>
        session.captureStore.execute(
          {
            type: "apply-sweep",
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
        return {
          output: { status: "refused" as const, refusal: applied.refusal },
        };
      }

      sweepState = advanceSweepHighWater(sweepState, throughUserEntryId);
      setSweepState(sweepState);
      const accountedEntryIds = await capturedUserEntryIdsForSession(
        session.captureStore,
        applied.snapshot,
        session.sessionId,
      );
      const appliedCaptureIds =
        "appliedCaptureIds" in applied.value
          ? applied.value.appliedCaptureIds
          : [];
      const completion =
        slotModel === undefined ? undefined : completionCue(applied.snapshot);
      return {
        output: {
          status: "applied" as const,
          appliedCaptureIds,
          skippedDedupKeys:
            "skippedDedupKeys" in applied.value
              ? applied.value.skippedDedupKeys
              : [],
          advisories: [
            ...("advisories" in applied.value ? applied.value.advisories : []),
            ...computeUnaccountedAskAdvisories(range, accountedEntryIds),
          ],
          captures: applied.snapshot.captures.map((capture) =>
            Object.assign({}, capture, {
              status: deriveCaptureStatus(applied.snapshot, capture.id),
            }),
          ),
          ...(completion === undefined ? {} : { completion }),
        },
      };
    },
  });

  useAgentFinish(async (ctx) => {
    // useAgentFinish also fires on terminate:true asks. The callback's local
    // view is updated by ask/reply callbacks in this render, so it observes the
    // live slot rather than the render-time persistent-state snapshot.
    if (pendingAtFinish !== null) return;

    const entries = projectFlueHistoryForSweep(
      await session.historyReader.peek(session.sessionId),
    );
    const repair = pendingSweepRepair(entries);
    if (repair) {
      ctx.append({ kind: "signal", ...buildSweepRepairSignal(repair) });
      return;
    }
    const decision = decideSettlementTrigger({
      entries,
      state: sweepState,
      pendingAffordance: false,
    });
    if (decision.action !== "nudge") return;

    sweepState = decision.nextState;
    setSweepState(sweepState);
    ctx.append({
      kind: "signal",
      ...buildSettlementCheckSignal(decision.tail),
    });
  });

  return [
    ...askProtocolInstructionFragments(plugin.targetFormalism),
    ...settlementProtocolInstructionFragments(),
    ...(definition === undefined
      ? []
      : [renderInstructions(repertoire, definition)]),
  ].join("\n\n");
}
