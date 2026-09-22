import {
  applyPetrinautConstructionToolName,
  canonicalContent,
  mutatePetrinetAttemptOperationId,
  mutatePetrinetInputSchema,
  mutatePetrinetOutputSchema,
  isConstructionMutationName,
  isHostRecordedCanonicalMutation,
  isMutatePetrinautNetToolName,
  type MutatePetrinetInput,
  parseClientToolResultMetadata,
  type BrowserBinding,
  type ConstructionMutationAttempt,
  type DefinitionObservation,
  reconcileMutationAttempts,
  verifyCanonicalMutationRecord,
  verifyDeepConstructionRecord,
  verifyExperimentRecord,
  verifyMutationAttempt,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import {
  clientToolHistoryFrom,
  parseClientToolResultPayload,
} from "@hashintel/brunch-agent-transport-aisdk";
import { MUTATE_WORKPIECE_TOOL_NAME } from "@hashintel/brunch-agent/flue";
import { createExperimentToolName } from "@hashintel/petrinaut-core";

import { isAwaitingClient } from "./client-tools.ts";
import { retainedSettledRevision } from "./workpiece.ts";

import type { FlueConversationSnapshot } from "@flue/sdk";

const parseBrowserResults = (body: string) => {
  const payload = parseClientToolResultPayload(body, () => {
    throw new Error("Malformed browser results.");
  });
  if (payload.results.length === 0)
    throw new Error("Malformed browser results.");
  return payload.results;
};

const batchRecordOutcome = (
  attempts: readonly {
    readonly outcome: ConstructionMutationAttempt["outcome"];
  }[],
): ConstructionMutationAttempt["outcome"] => {
  if (attempts.some((attempt) => attempt.outcome === "unknown"))
    return "unknown";
  if (attempts.some((attempt) => attempt.outcome === "failed")) return "failed";
  if (attempts.some((attempt) => attempt.outcome === "stale")) return "stale";
  if (attempts.some((attempt) => attempt.outcome === "applied"))
    return "applied";
  return "no-op";
};

/** Verify per-operation records against the issued batch; reconcile stays per call. */
export const verifyMutatePetrinetAttempts = async (input: {
  toolCallId: string;
  batch: MutatePetrinetInput;
  binding: BrowserBinding;
  output: unknown;
  mutationRecord: {
    readonly attempts: readonly unknown[];
    readonly outcome: ConstructionMutationAttempt["outcome"];
  };
}): Promise<ConstructionMutationAttempt[]> => {
  if (input.mutationRecord.attempts.length === 0)
    throw new Error("The root arc result requires a browser mutation record.");
  const output = mutatePetrinetOutputSchema.parse(input.output);
  if (
    output.toolCallId !== input.toolCallId ||
    output.observationToolCallId !== input.batch.observation.toolCallId ||
    output.preHash !== input.batch.observation.baseHash ||
    output.outcomes.length !== input.batch.operations.length
  )
    throw new Error(
      "The browser output does not match the complete issued mutation batch.",
    );
  const verified = await Promise.all(
    input.mutationRecord.attempts.map((attempt) =>
      verifyMutationAttempt(attempt as ConstructionMutationAttempt),
    ),
  );
  const issuedIds = input.batch.operations.map(
    (operation) => operation.operationId,
  );
  const recordedIds: string[] = [];
  const groups = new Map<string, ConstructionMutationAttempt[]>();
  for (const attempt of verified) {
    if (canonicalContent(attempt.binding) !== canonicalContent(input.binding))
      throw new Error(
        "The browser record does not match the issued call or document incarnation.",
      );
    const operationId = mutatePetrinetAttemptOperationId(
      input.toolCallId,
      attempt.request.toolCallId,
    );
    const operation = input.batch.operations.find(
      (entry) => entry.operationId === operationId,
    );
    if (
      operationId === undefined ||
      operation === undefined ||
      attempt.request.toolName !== operation.type ||
      canonicalContent(attempt.request.input) !==
        canonicalContent(operation.input) ||
      attempt.request.observationToolCallId !==
        input.batch.observation.toolCallId
    )
      throw new Error(
        "The browser record does not match the issued call or document incarnation.",
      );
    if (recordedIds.at(-1) !== operationId) {
      if (recordedIds.includes(operationId))
        throw new Error(
          "The browser record does not match the issued call or document incarnation.",
        );
      recordedIds.push(operationId);
    }
    const group = groups.get(operationId) ?? [];
    group.push(attempt);
    groups.set(operationId, group);
  }
  const attemptedOutcomes = output.outcomes.filter(
    (outcome) => outcome.status !== "unattempted",
  );
  if (
    output.outcomes.some((outcome, index) => {
      const operation = input.batch.operations[index];
      return (
        operation === undefined ||
        outcome.operationId !== operation.operationId ||
        outcome.basisId !== operation.basisId
      );
    }) ||
    recordedIds.length !== attemptedOutcomes.length ||
    recordedIds.some(
      (operationId, index) =>
        operationId !== issuedIds[index] ||
        operationId !== attemptedOutcomes[index]?.operationId,
    )
  )
    throw new Error(
      "The browser record does not account for the complete canonical output.",
    );
  let previousPostHash = output.preHash;
  const groupOutcomes = recordedIds.map((operationId, index) => {
    const group = groups.get(operationId);
    const deliveredOutcome = attemptedOutcomes[index];
    if (!group || !deliveredOutcome)
      throw new Error(
        "The browser record does not account for the complete canonical output.",
      );
    const reconciled = reconcileMutationAttempts(group);
    const attempt = reconciled.attempts.at(-1);
    const deliveredPostHash =
      "postHash" in deliveredOutcome ? deliveredOutcome.postHash : undefined;
    if (
      attempt === undefined ||
      deliveredOutcome.status !== reconciled.outcome ||
      deliveredOutcome.preHash !== attempt.pre.sha256 ||
      deliveredOutcome.preHash !== previousPostHash ||
      deliveredPostHash !== attempt.post?.sha256
    )
      throw new Error(
        "The browser record does not account for the complete canonical output.",
      );
    previousPostHash = attempt.post?.sha256 ?? previousPostHash;
    return reconciled.outcome;
  });
  if (previousPostHash !== output.postHash)
    throw new Error(
      "The browser record does not account for the complete canonical output.",
    );
  const outcome = batchRecordOutcome(
    groupOutcomes.map((groupOutcome) => ({ outcome: groupOutcome })),
  );
  if (outcome !== input.mutationRecord.outcome)
    throw new Error("The browser aggregate outcome is inconsistent.");
  return verified;
};

const verifyExperimentDelivery = async (input: {
  delivery: ReturnType<typeof parseBrowserResults>[number];
  call: { toolCallId: string; toolName: string; input: unknown };
  binding: BrowserBinding;
  history: ReturnType<typeof clientToolHistoryFrom>;
}): Promise<void> => {
  const record = parseClientToolResultMetadata(
    input.delivery.metadata,
  )?.experimentRecord;
  if (record === undefined)
    throw new Error("The experiment result requires an experiment record.");
  await verifyExperimentRecord({
    record,
    toolCallId: input.call.toolCallId,
    canonicalInput: input.call.input,
    canonicalOutput: input.delivery.output,
    binding: input.binding,
  });
  const earlier = input.history.results.filter(
    (result) => result.toolCallId === input.call.toolCallId,
  );
  if (earlier.length > 1)
    throw new Error(
      "This browser call already has a result delivery; do not continue or rerun it.",
    );
};

const verifyCanonicalPetrinautDelivery = async (input: {
  delivery: ReturnType<typeof parseBrowserResults>[number];
  call: { toolCallId: string; toolName: string; input: unknown };
  binding: BrowserBinding;
  history: ReturnType<typeof clientToolHistoryFrom>;
}): Promise<void> => {
  // The plugin owns the exact input scope the host can observe. Every other
  // canonical mutation stays `unrecorded`; only identity and duplication apply.
  if (isHostRecordedCanonicalMutation(input.call.toolName, input.call.input)) {
    const record = parseClientToolResultMetadata(
      input.delivery.metadata,
    )?.canonicalMutationRecord;
    if (record === undefined)
      throw new Error(
        "The canonical mutation result requires a canonical mutation record.",
      );
    await verifyCanonicalMutationRecord({
      record,
      toolCallId: input.call.toolCallId,
      toolName: input.call.toolName,
      canonicalInput: input.call.input,
      canonicalOutput: input.delivery.output,
      binding: input.binding,
    });
  }
  const earlier = input.history.results.filter(
    (result) => result.toolCallId === input.call.toolCallId,
  );
  if (earlier.length > 1)
    throw new Error(
      "This browser call already has a result delivery; do not continue or reapply it.",
    );
};

const verifyDeepConstructionDelivery = async (input: {
  delivery: ReturnType<typeof parseBrowserResults>[number];
  call: { toolCallId: string; toolName: string; input: unknown };
  binding: BrowserBinding;
  beforeCall: FlueConversationSnapshot;
  history: ReturnType<typeof clientToolHistoryFrom>;
}): Promise<void> => {
  const record = parseClientToolResultMetadata(
    input.delivery.metadata,
  )?.deepConstructionRecord;
  if (record === undefined)
    throw new Error(
      "The deep construction result requires a deep construction record.",
    );
  const latestSettlement = input.beforeCall.messages
    .flatMap((message) =>
      message.role === "assistant" && message.purpose === "assistant"
        ? message.parts
        : [],
    )
    .findLast(
      (part) =>
        part.type === "dynamic-tool" &&
        part.toolName === MUTATE_WORKPIECE_TOOL_NAME &&
        part.state === "output-available" &&
        retainedSettledRevision(input.beforeCall, part.toolCallId) !==
          undefined,
    );
  const ledgerRevision =
    latestSettlement?.type === "dynamic-tool"
      ? retainedSettledRevision(input.beforeCall, latestSettlement.toolCallId)
      : undefined;
  await verifyDeepConstructionRecord({
    record,
    toolCallId: input.call.toolCallId,
    canonicalInput: input.call.input,
    canonicalOutput: input.delivery.output,
    binding: input.binding,
    ledgerRevision,
  });
  const earlier = input.history.results.filter(
    (result) => result.toolCallId === input.call.toolCallId,
  );
  if (earlier.length > 1)
    throw new Error(
      "This browser call already has a result delivery; do not continue or reapply it.",
    );
};

const verifyMutatePetrinetDelivery = async (input: {
  delivery: ReturnType<typeof parseBrowserResults>[number];
  call: {
    toolCallId: string;
    toolName: string;
    input: unknown;
  };
  binding: BrowserBinding;
  observationFor?: (
    id: string,
    beforeCallId: string,
  ) => Promise<DefinitionObservation>;
  history: ReturnType<typeof clientToolHistoryFrom>;
}): Promise<void> => {
  const batch = mutatePetrinetInputSchema.parse(input.call.input);
  if (input.observationFor) {
    const observed = await input.observationFor(
      batch.observation.toolCallId,
      input.call.toolCallId,
    );
    if (observed.sha256 !== batch.observation.baseHash)
      throw new Error(
        "Mutation does not cite its earlier verified raw browser base.",
      );
  }
  const mutationRecord = parseClientToolResultMetadata(
    input.delivery.metadata,
  )?.mutationRecord;
  if (mutationRecord === undefined)
    throw new Error("The root arc result requires a browser mutation record.");
  await verifyMutatePetrinetAttempts({
    toolCallId: input.call.toolCallId,
    batch,
    binding: input.binding,
    output: input.delivery.output,
    mutationRecord,
  });
  const earlier = input.history.results.filter(
    (result) => result.toolCallId === input.call.toolCallId,
  );
  if (earlier.length > 1)
    throw new Error(
      "This browser call already has a result delivery; do not continue or reapply it.",
    );
};

/** Verify the incoming sidecar against this instance's issued canonical call before model continuation. */
export const verifyMutationResults = async (input: {
  body: string;
  snapshot: FlueConversationSnapshot;
  binding: BrowserBinding;
  requestedBaseHash?: string;
  observationFor?: (
    id: string,
    beforeCallId: string,
  ) => Promise<DefinitionObservation>;
}): Promise<void> => {
  const deliveries = parseBrowserResults(input.body);
  const history = clientToolHistoryFrom(input.snapshot.messages);
  await Promise.all(
    deliveries.map(async (delivery) => {
      const call = input.snapshot.messages
        .flatMap((message) => message.parts)
        .find(
          (part) =>
            part.type === "dynamic-tool" &&
            part.toolCallId === delivery.toolCallId,
        );
      if (
        !call ||
        call.type !== "dynamic-tool" ||
        call.toolName !== delivery.toolName ||
        call.state !== "output-available" ||
        !isAwaitingClient(call.output)
      )
        throw new Error(
          "The browser result has no matching admitted canonical call.",
        );
      if (call.toolName === createExperimentToolName) {
        await verifyExperimentDelivery({
          delivery,
          call,
          binding: input.binding,
          history,
        });
        return;
      }
      if (call.toolName === applyPetrinautConstructionToolName) {
        const messageIndex = input.snapshot.messages.findIndex((message) =>
          message.parts.includes(call),
        );
        const callMessage = input.snapshot.messages[messageIndex];
        const partIndex = callMessage?.parts.indexOf(call) ?? -1;
        if (messageIndex < 0 || callMessage === undefined || partIndex < 0)
          throw new Error(
            "The deep construction call position is unavailable.",
          );
        await verifyDeepConstructionDelivery({
          delivery,
          call,
          binding: input.binding,
          beforeCall: {
            ...input.snapshot,
            messages: [
              ...input.snapshot.messages.slice(0, messageIndex),
              { ...callMessage, parts: callMessage.parts.slice(0, partIndex) },
            ],
          },
          history,
        });
        return;
      }
      if (isMutatePetrinautNetToolName(call.toolName)) {
        await verifyMutatePetrinetDelivery({
          delivery,
          call,
          binding: input.binding,
          observationFor: input.observationFor,
          history,
        });
        return;
      }
      if (isConstructionMutationName(call.toolName)) {
        await verifyCanonicalPetrinautDelivery({
          delivery,
          call,
          binding: input.binding,
          history,
        });
      }
      return;
    }),
  );
};
