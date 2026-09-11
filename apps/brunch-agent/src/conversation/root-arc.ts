import {
  canonicalContent,
  parseJoinedRootArcInput,
  parseObservedArcInput,
  parseObservedNodeInput,
  isObservedArcMutation,
  isObservedNodeMutation,
  assertNodeIdentity,
  assertStateIdentity,
  isObservedStateMutation,
  mutatePetrinetAttemptOperationId,
  mutatePetrinetInputSchema,
  mutatePetrinetToolName,
  type MutatePetrinetInput,
  parseClientToolResultMetadata,
  parseObservedStateInput,
  type BrowserBinding,
  type ConstructionMutationAttempt,
  type ConstructionMutationRequest,
  type ObservedConstructionMutationName,
  type DefinitionObservation,
  reconcileMutationAttempts,
  verifyMutationAttempt,
  type ArcMutationAttempt,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import {
  clientToolHistoryFrom,
  CLIENT_TOOL_RESULT_SIGNAL,
  isClientToolResult,
} from "@hashintel/brunch-agent-transport-aisdk";
import { mutationActionInputSchemas } from "@hashintel/petrinaut-core";
import {
  getLatestNetDefinitionToolName,
  type PetrinautAiToolInput,
} from "@hashintel/petrinaut-core/ai";

import { isAwaitingClient } from "./client-tools.ts";

import type { FlueConversationSnapshot } from "@flue/sdk";

const record = (input: unknown): input is Record<string, unknown> =>
  typeof input === "object" && input !== null && !Array.isArray(input);

const parseBrowserResults = (body: string) => {
  const deliveries: unknown = JSON.parse(body);
  if (!Array.isArray(deliveries)) throw new Error("Malformed browser results.");
  return deliveries.map((delivery: unknown) => {
    if (!isClientToolResult(delivery))
      throw new Error("Malformed browser result identity.");
    return delivery;
  });
};

/** Root arc identity is endpoint/direction scoped. A recorded deletion/recreation lifecycle is not admitted. */
export const assertArcNotRetired = async (
  snapshot: FlueConversationSnapshot,
  observed: DefinitionObservation,
  input: PetrinautAiToolInput<"addArc">,
): Promise<void> => {
  const transition = observed.definition.transitions.find(
    (entry) => entry.id === input.transitionId,
  );
  const direction = input.arcDirection === "input" ? "inputArcs" : "outputArcs";
  if (
    transition?.[direction].some(
      (arc) => "placeId" in arc && arc.placeId === input.placeId,
    )
  )
    throw new Error("Duplicate root arc identity cannot be created.");
  const results = clientToolHistoryFrom(snapshot.messages).results;
  for (const result of results) {
    const mutationRecord = parseClientToolResultMetadata(
      result.metadata,
    )?.mutationRecord;
    if (
      mutationRecord === undefined ||
      (result.toolName !== "addArc" &&
        result.toolName !== mutatePetrinetToolName)
    )
      continue;
    const verified = await Promise.all(
      mutationRecord.attempts.map((raw) =>
        verifyMutationAttempt(raw as ConstructionMutationAttempt),
      ),
    );
    const addArcIds = new Set(
      verified
        .filter((attempt) => attempt.request.toolName === "addArc")
        .map((attempt) => attempt.request.toolCallId),
    );
    for (const toolCallId of addArcIds) {
      const group = verified.filter(
        (attempt) => attempt.request.toolCallId === toolCallId,
      );
      const first = group[0];
      if (!first) continue;
      const reconciled = reconcileMutationAttempts(group);
      const previousInput = mutationActionInputSchemas.addArc.parse(
        first.request.input,
      );
      const sameTarget =
        previousInput.transitionId === input.transitionId &&
        previousInput.placeId === input.placeId &&
        previousInput.arcDirection === input.arcDirection;
      if (
        sameTarget &&
        (reconciled.outcome === "unknown" ||
          results.some(
            (other) =>
              other.toolCallId === result.toolCallId &&
              canonicalContent(other) !== canonicalContent(result),
          ))
      )
        throw new Error(
          "Unknown or conflicting arc attempts cannot establish an identity lifecycle; creation is unavailable.",
        );
      if (reconciled.outcome === "applied" && sameTarget)
        throw new Error(
          "Retired root arc identity cannot be reused; deletion/recreation is unavailable.",
        );
    }
  }
};

/** Every retained identity source is verified against this conversation's binding/call. */
export const assertConstructionIdentity = async (
  snapshot: FlueConversationSnapshot,
  observed: DefinitionObservation,
  mutation: Pick<ConstructionMutationRequest, "toolName" | "input">,
  binding: BrowserBinding,
  read: (id: string) => Promise<DefinitionObservation>,
): Promise<void> => {
  if (mutation.toolName === "addArc") {
    const parsed = mutationActionInputSchemas.addArc.parse(mutation.input);
    await assertArcNotRetired(snapshot, observed, parsed);
    return;
  }
  if (
    !isObservedNodeMutation(mutation.toolName) &&
    !isObservedStateMutation(mutation.toolName)
  )
    return;
  const earlier: DefinitionObservation[] = [];
  const deliveredResults = clientToolHistoryFrom(snapshot.messages).results;
  // The display projection drops malformed results. Verify raw deliveries before
  // treating their absence from that projection as an unanswered read.
  for (const message of snapshot.messages) {
    if (
      message.role === "system" &&
      message.purpose === "dispatch" &&
      message.signal?.tagName === CLIENT_TOOL_RESULT_SIGNAL
    )
      parseBrowserResults(
        message.parts
          .flatMap((part) => (part.type === "text" ? [part.text] : []))
          .join(""),
      );
  }
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
      // An unanswered client call remains canonical history but is not an
      // observation. Correlate delivery by call ID: a same-ID wrong-name result
      // must reach the verifier and refuse rather than being silently skipped.
      if (
        call.toolName === getLatestNetDefinitionToolName &&
        deliveredResults.some((result) => result.toolCallId === call.toolCallId)
      )
        earlier.push(await read(call.toolCallId));
    }
  }
  for (const result of deliveredResults) {
    if (
      !isObservedNodeMutation(result.toolName) &&
      !isObservedStateMutation(result.toolName) &&
      !isObservedArcMutation(result.toolName) &&
      result.toolName !== mutatePetrinetToolName
    )
      continue;
    await verifyRootArcResults({
      body: JSON.stringify([result]),
      snapshot,
      binding,
      observationFor: async (id) => read(id),
    });
    const mutationRecord = parseClientToolResultMetadata(
      result.metadata,
    )?.mutationRecord;
    if (mutationRecord === undefined)
      throw new Error("Missing identity history.");
    for (const raw of mutationRecord.attempts) {
      const attempt = await verifyMutationAttempt(raw as ArcMutationAttempt);
      if (mutationRecord.outcome === "unknown")
        throw new Error(
          "Unknown construction history cannot establish safe identity reuse.",
        );
      earlier.push(attempt.pre);
      if (attempt.post) earlier.push(attempt.post);
    }
  }
  assertNodeIdentity(
    mutation,
    observed.definition,
    earlier.map((entry) => entry.definition),
  );
  assertStateIdentity(
    mutation,
    observed.definition,
    earlier.map((entry) => entry.definition),
  );
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
  mutationRecord: {
    readonly attempts: readonly unknown[];
    readonly outcome: ConstructionMutationAttempt["outcome"];
  };
}): Promise<ConstructionMutationAttempt[]> => {
  if (input.mutationRecord.attempts.length === 0)
    throw new Error("The root arc result requires a browser mutation record.");
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
    const group = groups.get(attempt.request.toolCallId) ?? [];
    group.push(attempt);
    groups.set(attempt.request.toolCallId, group);
  }
  if (
    recordedIds.some((operationId, index) => operationId !== issuedIds[index])
  )
    throw new Error(
      "The browser record does not match the issued call or document incarnation.",
    );
  const groupOutcomes = [...groups.values()].map(
    (group) => reconcileMutationAttempts(group).outcome,
  );
  const outcome = batchRecordOutcome(
    groupOutcomes.map((groupOutcome) => ({ outcome: groupOutcome })),
  );
  if (outcome !== input.mutationRecord.outcome)
    throw new Error("The browser aggregate outcome is inconsistent.");
  return verified;
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
export const verifyRootArcResults = async (input: {
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
      if (call.toolName === mutatePetrinetToolName) {
        await verifyMutatePetrinetDelivery({
          delivery,
          call,
          binding: input.binding,
          observationFor: input.observationFor,
          history,
        });
        return;
      }
      if (
        call.toolName !== "addArc" &&
        !(
          input.observationFor &&
          (call.toolName === "updateArcWeight" ||
            isObservedNodeMutation(call.toolName) ||
            isObservedStateMutation(call.toolName))
        )
      )
        return;
      const name = call.toolName as ObservedConstructionMutationName;
      const { brunch, ...canonicalInput } = input.observationFor
        ? isObservedNodeMutation(name)
          ? parseObservedNodeInput(name, call.input)
          : isObservedStateMutation(name)
            ? parseObservedStateInput(name, call.input)
            : parseObservedArcInput(name, call.input)
        : parseJoinedRootArcInput(call.input);
      const observationToolCallId =
        "observationToolCallId" in brunch
          ? String(brunch.observationToolCallId)
          : undefined;
      if (input.observationFor) {
        const observed = await input.observationFor(
          observationToolCallId ?? "",
          call.toolCallId,
        );
        if (observed.sha256 !== brunch.requestedBaseHash)
          throw new Error(
            "Mutation does not cite its earlier verified raw browser base.",
          );
      }
      const expected: ConstructionMutationRequest = {
        toolCallId: call.toolCallId,
        toolName: name,
        input: canonicalInput,
        ...(observationToolCallId === undefined
          ? {}
          : { observationToolCallId }),
        binding: input.binding,
        requestedBaseHash: brunch.requestedBaseHash,
      };
      if (
        !input.observationFor &&
        expected.requestedBaseHash !== input.requestedBaseHash
      )
        throw new Error(
          "The issued browser base does not match the bound conversation.",
        );
      const mutationRecord = parseClientToolResultMetadata(
        delivery.metadata,
      )?.mutationRecord;
      if (mutationRecord === undefined)
        throw new Error(
          "The root arc result requires a browser mutation record.",
        );
      const attempts = await Promise.all(
        mutationRecord.attempts.map(async (attempt) => {
          // The plugin's receiving-boundary verifier validates detached observations and effects.
          const verified = await verifyMutationAttempt(
            attempt as ArcMutationAttempt,
          );
          if (
            canonicalContent(verified.request) !== canonicalContent(expected) ||
            canonicalContent(verified.binding) !==
              canonicalContent(input.binding)
          )
            throw new Error(
              "The browser record does not match the issued call or document incarnation.",
            );
          return verified;
        }),
      );
      const reconciled = reconcileMutationAttempts(attempts);
      if (reconciled.outcome !== mutationRecord.outcome)
        throw new Error("The browser aggregate outcome is inconsistent.");
      if (
        record(delivery.output) &&
        ((delivery.output.applied === true &&
          reconciled.outcome !== "applied") ||
          (delivery.output.applied === false &&
            reconciled.outcome === "applied"))
      )
        throw new Error(
          "The canonical result conflicts with the observed browser outcome.",
        );
      const earlier = history.results.filter(
        (result) => result.toolCallId === call.toolCallId,
      );
      if (earlier.length > 1)
        throw new Error(
          "This browser call already has a result delivery; do not continue or reapply it.",
        );
    }),
  );
};
