import { createHash } from "node:crypto";

import {
  canonicalContent,
  parseJoinedRootArcInput,
  parseObservedArcInput,
  parseObservedNodeInput,
  isObservedNodeMutation,
  assertNodeIdentity,
  type ConstructionMutationRequest,
  type DefinitionObservation,
  reconcileArcTransitionAttempts,
  verifyArcTransitionAttempt,
  type ArcMutationRequest,
  type ConstructionTransitionAttempt as ArcTransitionAttempt,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import { clientToolHistoryFrom } from "@hashintel/brunch-agent-transport-aisdk";
import { mutationActionInputSchemas } from "@hashintel/petrinaut-core";

import { isAwaitingClient } from "./client-tools.ts";

import type { FlueConversationSnapshot } from "@flue/sdk";
import type { WorkpieceRevision } from "@hashintel/brunch-agent/workpiece";

const record = (input: unknown): input is Record<string, unknown> =>
  typeof input === "object" && input !== null && !Array.isArray(input);

/** Historical citations resolve only actual successful core tool calls, never fenced recovery. */
export const retainedSettledRevision = (
  snapshot: FlueConversationSnapshot,
  revisionId: string,
): WorkpieceRevision | undefined => {
  for (const message of snapshot.messages) {
    if (message.role !== "assistant" || message.purpose !== "assistant")
      continue;
    for (const part of message.parts) {
      if (
        part.type !== "dynamic-tool" ||
        part.toolName !== "update_workpiece" ||
        part.toolCallId !== revisionId ||
        part.state !== "output-available"
      )
        continue;
      if (
        !record(part.input) ||
        typeof part.input.markdown !== "string" ||
        !record(part.output)
      )
        continue;
      const { markdown } = part.input;
      const { sha256, ordinal } = part.output;
      if (
        part.output.revisionId !== revisionId ||
        typeof sha256 !== "string" ||
        typeof ordinal !== "number" ||
        createHash("sha256").update(markdown).digest("hex") !== sha256
      )
        continue;
      return {
        revisionId,
        sha256,
        ordinal,
        markdown,
        ...(part.output.evidenceValidated === true
          ? {
              evidence: part.output.evidence as WorkpieceRevision["evidence"],
              evidenceValidated: true as const,
            }
          : {}),
      };
    }
  }
  return undefined;
};

/** Root arc identity is endpoint/direction scoped. A recorded deletion/recreation lifecycle is not admitted. */
export const assertArcNotRetired = async (
  snapshot: FlueConversationSnapshot,
  observed: DefinitionObservation,
  input: ArcMutationRequest["input"],
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
    if (
      result.toolName !== "addArc" ||
      !record(result.metadata) ||
      !record(result.metadata.transitionRecord) ||
      !Array.isArray(result.metadata.transitionRecord.attempts)
    )
      continue;
    const verified = await Promise.all(
      result.metadata.transitionRecord.attempts.map((raw: unknown) =>
        verifyArcTransitionAttempt(raw as ArcTransitionAttempt),
      ),
    );
    const reconciled = reconcileArcTransitionAttempts(verified);
    for (const attempt of verified) {
      const previousInput = mutationActionInputSchemas.addArc.parse(
        attempt.request.input,
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
  binding: ArcMutationRequest["binding"],
  read: (id: string) => Promise<DefinitionObservation>,
): Promise<void> => {
  if (mutation.toolName === "addArc") {
    const parsed = mutationActionInputSchemas.addArc.parse(mutation.input);
    await assertArcNotRetired(snapshot, observed, parsed);
    return;
  }
  if (!isObservedNodeMutation(mutation.toolName)) return;
  const earlier: DefinitionObservation[] = [];
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
      if (call.toolName === "getLatestNetDefinition")
        earlier.push(await read(call.toolCallId));
    }
  }
  const results = clientToolHistoryFrom(snapshot.messages).results;
  for (const result of results) {
    if (
      !isObservedNodeMutation(result.toolName) &&
      result.toolName !== "addArc" &&
      result.toolName !== "updateArcWeight"
    )
      continue;
    await verifyRootArcResults({
      body: JSON.stringify([result]),
      snapshot,
      binding,
      observationFor: async (id) => read(id),
    });
    if (
      !record(result.metadata) ||
      !record(result.metadata.transitionRecord) ||
      !Array.isArray(result.metadata.transitionRecord.attempts)
    )
      throw new Error("Missing identity history.");
    for (const raw of result.metadata.transitionRecord.attempts) {
      const attempt = await verifyArcTransitionAttempt(
        raw as ArcTransitionAttempt,
      );
      if (result.metadata.transitionRecord.outcome === "unknown")
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
};

/** Verify the incoming sidecar against this instance's issued canonical call before model continuation. */
export const verifyRootArcResults = async (input: {
  body: string;
  snapshot: FlueConversationSnapshot;
  binding: ArcMutationRequest["binding"];
  requestedBaseHash?: string;
  observationFor?: (
    id: string,
    beforeCallId: string,
  ) => Promise<DefinitionObservation>;
}): Promise<void> => {
  const deliveries: unknown = JSON.parse(input.body);
  if (!Array.isArray(deliveries)) throw new Error("Malformed browser results.");
  const history = clientToolHistoryFrom(input.snapshot.messages);
  await Promise.all(
    deliveries.map(async (delivery: unknown) => {
      if (
        !record(delivery) ||
        typeof delivery.toolCallId !== "string" ||
        typeof delivery.toolName !== "string" ||
        !("output" in delivery)
      )
        throw new Error("Malformed browser result identity.");
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
      if (
        call.toolName !== "addArc" &&
        !(
          input.observationFor &&
          (call.toolName === "updateArcWeight" ||
            isObservedNodeMutation(call.toolName))
        )
      )
        return;
      const name = call.toolName as ConstructionMutationRequest["toolName"];
      const { brunch, ...canonicalInput } = input.observationFor
        ? isObservedNodeMutation(name)
          ? parseObservedNodeInput(name, call.input)
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
      if (
        !record(delivery.metadata) ||
        !record(delivery.metadata.transitionRecord) ||
        !Array.isArray(delivery.metadata.transitionRecord.attempts)
      )
        throw new Error(
          "The root arc result requires a browser transition record.",
        );
      const attempts = await Promise.all(
        delivery.metadata.transitionRecord.attempts.map(
          async (attempt: unknown) => {
            // The plugin's receiving-boundary verifier validates detached observations and effects.
            const verified = await verifyArcTransitionAttempt(
              attempt as ArcTransitionAttempt,
            );
            if (
              canonicalContent(verified.request) !==
                canonicalContent(expected) ||
              canonicalContent(verified.binding) !==
                canonicalContent(input.binding)
            )
              throw new Error(
                "The browser record does not match the issued call or document incarnation.",
              );
            return verified;
          },
        ),
      );
      const reconciled = reconcileArcTransitionAttempts(attempts);
      if (reconciled.outcome !== delivery.metadata.transitionRecord.outcome)
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
