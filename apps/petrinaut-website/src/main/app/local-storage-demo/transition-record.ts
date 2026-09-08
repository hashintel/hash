import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

import {
  assertArcEffects,
  canonicalContent,
  deriveArcEffects,
  observedArcOutcome,
  parseJoinedRootArcInput,
  reconcileArcTransitionAttempts,
  verifyArcTransitionAttempt,
  type ArcMutationRequest,
  type ArcTransitionAttempt,
  type DefinitionObservation,
} from "@hashintel/brunch-agent-plugin-sdcpn";

import type { FlueChatTransportOptions } from "@hashintel/brunch-agent-transport-aisdk";
import type { PetrinautDocHandle } from "@hashintel/petrinaut-core";
import type { PetrinautAiAssistant } from "@hashintel/petrinaut/ui";

type MutationExecutor = NonNullable<PetrinautAiAssistant["executeMutation"]>;
type MutationOutput = ReturnType<MutationExecutor>;

/** Read the bound handle, never the request or React's last rendered snapshot. */
export const observeBrowserDefinition = (
  handle: PetrinautDocHandle,
): DefinitionObservation => {
  const live = handle.doc();
  if (!live) throw new Error("The bound browser document is unavailable.");
  const definition = structuredClone(live);
  return {
    definition,
    sha256: bytesToHex(
      sha256(new TextEncoder().encode(JSON.stringify(definition))),
    ),
  };
};

/**
 * One handle incarnation and conversation. No persistence, transport, or basis join.
 * The synchronous executor must mutate this handle; asynchronous commands are excluded.
 */
export const createBrowserTransitionRecorder = ({
  handle,
  binding: suppliedBinding,
  requestFor,
}: {
  handle: PetrinautDocHandle;
  binding: ArcMutationRequest["binding"];
  requestFor: (toolCallId: string) => ArcMutationRequest;
}) => {
  const binding = structuredClone(suppliedBinding);
  if (binding.documentId !== handle.id)
    throw new Error("The transition binding does not match the live handle.");
  const attemptsByCall = new Map<string, ArcTransitionAttempt[]>();
  const results = new Map<
    string,
    { request: ArcMutationRequest; output?: MutationOutput; error?: unknown }
  >();

  const retain = (attempt: ArcTransitionAttempt) => {
    assertArcEffects(attempt);
    const attempts = attemptsByCall.get(attempt.request.toolCallId) ?? [];
    attempts.push(structuredClone(attempt));
    attemptsByCall.set(attempt.request.toolCallId, attempts);
    return reconcileArcTransitionAttempts(attempts);
  };

  const executeMutation: MutationExecutor = (call) => {
    const request = structuredClone(requestFor(call.toolCallId));
    if (
      call.toolName !== "addArc" ||
      request.toolCallId !== call.toolCallId ||
      canonicalContent(request.input) !== canonicalContent(call.input)
    ) {
      throw new Error(
        "The transition request does not match the canonical tool call.",
      );
    }
    const previous = results.get(call.toolCallId);
    if (previous) {
      if (canonicalContent(previous.request) !== canonicalContent(request))
        throw new Error("Conflicting duplicate mutation request.");
      const priorAttempts = attemptsByCall.get(call.toolCallId);
      if (
        priorAttempts &&
        reconcileArcTransitionAttempts(priorAttempts).outcome === "unknown"
      )
        throw new Error(
          "The browser outcome is unknown or conflicting; do not retry.",
        );
      const first = priorAttempts?.[0];
      if (first) retain(first);
      if ("error" in previous) throw previous.error;
      if (previous.output) return structuredClone(previous.output);
      throw new Error(
        "The mutation is already executing; automatic retry is forbidden.",
      );
    }
    if (attemptsByCall.has(call.toolCallId))
      throw new Error(
        "This call already has a browser outcome; recover its canonical result from history, not by reapplying.",
      );
    // No await, timer, or output insertion is allowed between these observations.
    const pre = observeBrowserDefinition(handle);
    // Reject unearned scope before reserving this executor.
    deriveArcEffects(request, pre.definition, pre.definition);
    results.set(call.toolCallId, { request });
    const attempt: ArcTransitionAttempt = {
      request,
      binding: structuredClone(binding),
      pre,
      outcome: "unknown",
      effects: { created: [], updated: [], deleted: [], derived: [] },
    };
    try {
      if (canonicalContent(request.binding) !== canonicalContent(binding))
        throw new Error(
          "The mutation targets another document incarnation or conversation.",
        );
      if (request.requestedBaseHash !== pre.sha256) {
        attempt.outcome = "stale";
        attempt.post = observeBrowserDefinition(handle);
        const output: MutationOutput = {
          applied: false,
          reason:
            "The requested base does not match the independently observed document.",
        };
        retain(attempt);
        results.set(call.toolCallId, {
          request,
          output: structuredClone(output),
        });
        return output;
      }
      const output = call.execute();
      attempt.post = observeBrowserDefinition(handle);
      attempt.effects = deriveArcEffects(
        request,
        pre.definition,
        attempt.post.definition,
      );
      attempt.outcome = observedArcOutcome(attempt);
      if (attempt.outcome === "unknown")
        throw new Error(
          "Unmapped browser effects require review; do not retry.",
        );
      retain(attempt);
      const observedOutput: MutationOutput =
        attempt.outcome === "no-op" && output.applied
          ? {
              applied: false,
              reason:
                "The mutation left the independently observed document unchanged.",
            }
          : output;
      results.set(call.toolCallId, {
        request,
        output: structuredClone(observedOutput),
      });
      return observedOutput;
    } catch (error) {
      attempt.error = error instanceof Error ? error.message : String(error);
      // A throwing callback might have partially changed the document. Retain
      // the first post observation, if any; derivation failure is not absence.
      if (!attempt.post) {
        try {
          attempt.post = observeBrowserDefinition(handle);
        } catch {
          // The post state is unavailable, not inferred equal to the pre state.
        }
      }
      attempt.effects = attempt.post
        ? deriveArcEffects(request, pre.definition, attempt.post.definition)
        : { created: [], updated: [], deleted: [], derived: [] };
      attempt.outcome = observedArcOutcome(attempt);
      retain(attempt);
      results.set(call.toolCallId, { request, error });
      throw error;
    }
  };

  return {
    executeMutation,
    records: () =>
      [...attemptsByCall.values()].map(reconcileArcTransitionAttempts),
    /** External deliveries are verified before they can alter the first outcome. */
    acceptDelivery: async (attempt: ArcTransitionAttempt) => {
      const verified = await verifyArcTransitionAttempt(attempt);
      const expected = requestFor(verified.request.toolCallId);
      if (canonicalContent(verified.request) !== canonicalContent(expected))
        throw new Error(
          "Browser outcome does not match an issued canonical request.",
        );
      if (canonicalContent(verified.binding) !== canonicalContent(binding))
        throw new Error("Browser outcome belongs to another binding.");
      return retain(verified);
    },
  };
};

/** Production adapter for the opt-in prepared root-arc lane; issued identities are immutable. */
export const createJoinedBrowserTransitionRecorder = (input: {
  handle: PetrinautDocHandle;
  binding: ArcMutationRequest["binding"];
  requestedBaseHash: string;
}) => {
  const binding = structuredClone(input.binding);
  const requestedBaseHash = input.requestedBaseHash;
  const issued = new Map<
    string,
    { request: ArcMutationRequest; envelope: unknown }
  >();
  const recorder = createBrowserTransitionRecorder({
    handle: input.handle,
    binding,
    requestFor: (toolCallId) => {
      const request = issued.get(toolCallId);
      if (!request) throw new Error("Unknown issued root arc request.");
      return structuredClone(request.request);
    },
  });
  const mapClientToolInput: NonNullable<
    FlueChatTransportOptions["mapClientToolInput"]
  > = (call) => {
    if (call.toolName !== "addArc") return call.input;
    const { brunch, ...canonicalInput } = parseJoinedRootArcInput(call.input);
    if (brunch.requestedBaseHash !== requestedBaseHash)
      throw new Error("Root arc cites another issued base.");
    const request: ArcMutationRequest = {
      toolCallId: call.toolCallId,
      toolName: "addArc",
      input: canonicalInput,
      binding,
      requestedBaseHash: brunch.requestedBaseHash,
    };
    const previous = issued.get(call.toolCallId);
    const issuedCall = { request, envelope: brunch };
    if (previous && canonicalContent(previous) !== canonicalContent(issuedCall))
      throw new Error("Conflicting issued root arc identity.");
    issued.set(call.toolCallId, structuredClone(issuedCall));
    // Canonical history still holds brunch; only the execution projection strips it.
    return canonicalInput;
  };
  const clientToolResultMetadata: NonNullable<
    FlueChatTransportOptions["clientToolResultMetadata"]
  > = (result) => {
    if (result.toolName !== "addArc") return undefined;
    const transitionRecord = recorder
      .records()
      .find(
        (record) =>
          record.attempts[0]?.request.toolCallId === result.toolCallId,
      );
    if (!transitionRecord)
      throw new Error(
        "A root arc result requires an observed browser transition record.",
      );
    return { transitionRecord };
  };
  return {
    ...recorder,
    mapClientToolInput,
    clientToolResultMetadata,
    validatedClientToolNames: new Set(["addArc"]),
  };
};
