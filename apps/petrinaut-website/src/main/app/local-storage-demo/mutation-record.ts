import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

import {
  assertMutationEffects,
  canonicalContent,
  classifyMutationOutcome,
  deriveLayoutEffects,
  deriveMutationEffects,
  isLayoutPetrinautNetToolName,
  isMutatePetrinautNetToolName,
  isReadPetrinautNetToolName,
  mutatePetrinautNetToolName,
  observedMutationOutcome,
  parseJoinedRootArcInput,
  parseObservedArcInput,
  reconcileMutationAttempts,
  verifyMutationAttempt,
  type ConstructionMutationRequest,
  type ObservedConstructionMutationName,
  isObservedNodeMutation,
  parseObservedNodeInput,
  expectedNodeDefinition,
  assertNodeIdentity,
  assertStateIdentity,
  isObservedStateMutation,
  parseObservedStateInput,
  observedStateMutationNames,
  type ClientToolResultMetadata,
  type ConstructionMutationAttempt,
  type DefinitionObservation,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

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
    revisionId: handle.revisionId.get(),
  };
};

/**
 * One handle incarnation and conversation. No persistence, transport, or basis join.
 * The synchronous executor must mutate this handle; asynchronous commands are excluded.
 */
/**
 * A failure the recorder contained while recording a failed mutation: the
 * retained attempt already reflects it as an unknown outcome, so nothing
 * else surfaces the thrown value.
 */
export interface MutationRecordContainedFailure {
  readonly toolCallId: string;
  readonly kind: "post-observation" | "effect-derivation";
  readonly error: unknown;
}

export const createBrowserMutationRecorder = ({
  handle,
  binding: suppliedBinding,
  requestFor,
  deriveEffects = deriveMutationEffects,
  onContainedFailure,
}: {
  handle: PetrinautDocHandle;
  binding: ConstructionMutationRequest["binding"];
  requestFor: (toolCallId: string) => ConstructionMutationRequest;
  deriveEffects?: typeof deriveMutationEffects;
  onContainedFailure?: (failure: MutationRecordContainedFailure) => void;
}) => {
  const binding = structuredClone(suppliedBinding);
  if (binding.documentId !== handle.id)
    throw new Error("The transition binding does not match the live handle.");
  const attemptsByCall = new Map<string, ConstructionMutationAttempt[]>();
  const results = new Map<
    string,
    {
      request: ConstructionMutationRequest;
      output?: MutationOutput;
      error?: unknown;
    }
  >();

  const retain = (
    attempt: ConstructionMutationAttempt,
    { verifyEffects = true }: { verifyEffects?: boolean } = {},
  ) => {
    if (verifyEffects) assertMutationEffects(attempt);
    const attempts = attemptsByCall.get(attempt.request.toolCallId) ?? [];
    attempts.push(structuredClone(attempt));
    attemptsByCall.set(attempt.request.toolCallId, attempts);
    return reconcileMutationAttempts(attempts);
  };

  const executeMutation: MutationExecutor = (call) => {
    const request = structuredClone(requestFor(call.toolCallId));
    if (
      call.toolName !== request.toolName ||
      request.toolCallId !== call.toolCallId ||
      canonicalContent(
        isObservedStateMutation(request.toolName)
          ? petrinautAiTools[request.toolName].inputSchema.parse(request.input)
          : request.input,
      ) !== canonicalContent(call.input)
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
        reconcileMutationAttempts(priorAttempts).outcome === "unknown"
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
    deriveEffects(request, pre.definition, pre.definition);
    results.set(call.toolCallId, { request });
    const attempt: ConstructionMutationAttempt = {
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
      if (
        isObservedNodeMutation(request.toolName) ||
        isObservedStateMutation(request.toolName)
      ) {
        if (handle.capabilities?.disabledExtensions?.length)
          throw new Error(
            "Construction observation is unavailable for disabled extensions.",
          );
        const assertIdentity = isObservedStateMutation(request.toolName)
          ? assertStateIdentity
          : assertNodeIdentity;
        assertIdentity(
          request,
          pre.definition,
          [...attemptsByCall.values()].flatMap((attempts) =>
            attempts.flatMap((entry) => [
              entry.pre.definition,
              ...(entry.post ? [entry.post.definition] : []),
            ]),
          ),
        );
        expectedNodeDefinition(request, pre.definition);
      } else if (
        request.observationToolCallId !== undefined &&
        deriveEffects(
          request,
          pre.definition,
          expectedNodeDefinition(request, pre.definition),
        ).derived.length
      ) {
        throw new Error(
          "Derived arc footprints are unavailable; no mutation was executed. Embedded transition creation has a separately observed kernel path.",
        );
      }
      const output = call.execute();
      attempt.post = observeBrowserDefinition(handle);
      attempt.effects = deriveEffects(
        request,
        pre.definition,
        attempt.post.definition,
      );
      const classified = classifyMutationOutcome(attempt);
      attempt.outcome = classified.outcome;
      // The catch below records this message as `attempt.error`, so the reason
      // an outcome is unknown survives in the retained record.
      if (attempt.outcome === "unknown")
        throw new Error(
          `Unmapped browser effects require review; do not retry.${
            classified.reason === undefined ? "" : ` (${classified.reason})`
          }`,
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
        } catch (observationError) {
          // The post state is unavailable, not inferred equal to the pre state.
          onContainedFailure?.({
            toolCallId: call.toolCallId,
            kind: "post-observation",
            error: observationError,
          });
        }
      }
      try {
        attempt.effects = attempt.post
          ? deriveEffects(request, pre.definition, attempt.post.definition)
          : { created: [], updated: [], deleted: [], derived: [] };
        attempt.outcome = observedMutationOutcome(attempt);
        retain(attempt);
      } catch (derivationError) {
        onContainedFailure?.({
          toolCallId: call.toolCallId,
          kind: "effect-derivation",
          error: derivationError,
        });
        attempt.error = `${attempt.error}; effect derivation failed: ${
          derivationError instanceof Error
            ? derivationError.message
            : String(derivationError)
        }`;
        attempt.effects = {
          created: [],
          updated: [],
          deleted: [],
          derived: [],
        };
        attempt.outcome = "unknown";
        retain(attempt, { verifyEffects: false });
      }
      results.set(call.toolCallId, { request, error });
      throw error;
    }
  };

  return {
    executeMutation,
    records: () => [...attemptsByCall.values()].map(reconcileMutationAttempts),
    retainAttempt: retain,
    /** External deliveries are verified before they can alter the first outcome. */
    acceptDelivery: async (attempt: ConstructionMutationAttempt) => {
      const verified = await verifyMutationAttempt(attempt);
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
export const createJoinedBrowserMutationRecorder = (input: {
  handle: PetrinautDocHandle;
  binding: ConstructionMutationRequest["binding"];
  requestedBaseHash?: string;
  construction?: true;
  onContainedFailure?: (failure: MutationRecordContainedFailure) => void;
}) => {
  if (!input.construction && !input.requestedBaseHash)
    throw new Error("Legacy recorder requires its immutable original base.");
  const binding = structuredClone(input.binding);
  const requestedBaseHash = input.requestedBaseHash;
  const issuedReads = new Set<string>();
  const observedReads = new Map<string, string>();
  /** Live observation taken when the layout call was issued, before the browser ran it. */
  const issuedLayouts = new Map<string, DefinitionObservation>();
  const issued = new Map<
    string,
    { request: ConstructionMutationRequest; envelope: unknown }
  >();
  const recorder = createBrowserMutationRecorder({
    handle: input.handle,
    binding,
    onContainedFailure: input.onContainedFailure,
    requestFor: (toolCallId) => {
      const request = issued.get(toolCallId);
      if (!request) throw new Error("Unknown issued root arc request.");
      if (
        input.construction &&
        observedReads.get(request.request.observationToolCallId ?? "") !==
          request.request.requestedBaseHash
      )
        throw new Error(
          "Construction requires the cited earlier verified browser read; after reopen obtain a fresh read.",
        );
      return structuredClone(request.request);
    },
  });
  const mapClientToolInput: NonNullable<
    FlueChatTransportOptions["mapClientToolInput"]
  > = (call) => {
    if (isReadPetrinautNetToolName(call.toolName)) {
      issuedReads.add(call.toolCallId);
      return call.input;
    }
    if (isLayoutPetrinautNetToolName(call.toolName)) {
      if (!issuedLayouts.has(call.toolCallId))
        issuedLayouts.set(
          call.toolCallId,
          observeBrowserDefinition(input.handle),
        );
      return call.input;
    }
    if (
      call.toolName !== "addArc" &&
      !(
        input.construction &&
        (call.toolName === "updateArcWeight" ||
          isObservedNodeMutation(call.toolName) ||
          isObservedStateMutation(call.toolName))
      )
    )
      return call.input;
    const name = call.toolName as ObservedConstructionMutationName;
    const { brunch, ...canonicalInput } = input.construction
      ? isObservedNodeMutation(name)
        ? parseObservedNodeInput(name, call.input)
        : isObservedStateMutation(name)
          ? parseObservedStateInput(name, call.input)
          : parseObservedArcInput(name, call.input)
      : parseJoinedRootArcInput(call.input);
    if (!input.construction && brunch.requestedBaseHash !== requestedBaseHash)
      throw new Error("Root arc cites another issued base.");
    const request: ConstructionMutationRequest = {
      toolCallId: call.toolCallId,
      toolName: name,
      input: canonicalInput,
      ...("observationToolCallId" in brunch
        ? { observationToolCallId: String(brunch.observationToolCallId) }
        : {}),
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
    if (isReadPetrinautNetToolName(result.toolName)) {
      if (!issuedReads.has(result.toolCallId))
        throw new Error("Unknown issued browser read.");
      const observed = observeBrowserDefinition(input.handle);
      if (
        typeof result.output !== "object" ||
        result.output === null ||
        !("definition" in result.output) ||
        canonicalContent(result.output.definition) !==
          canonicalContent(observed.definition)
      )
        throw new Error(
          "Browser read output differs from the independently observed live handle.",
        );
      observedReads.set(result.toolCallId, observed.sha256);
      return {
        observation: { toolCallId: result.toolCallId, binding, observed },
      } satisfies ClientToolResultMetadata;
    }
    if (isLayoutPetrinautNetToolName(result.toolName)) {
      const pre = issuedLayouts.get(result.toolCallId);
      if (!pre) throw new Error("Unknown issued browser layout command.");
      const post = observeBrowserDefinition(input.handle);
      return {
        layoutRecord: {
          toolCallId: result.toolCallId,
          binding,
          pre,
          post,
          effects: deriveLayoutEffects(pre.definition, post.definition),
        },
      } satisfies ClientToolResultMetadata;
    }
    if (isMutatePetrinautNetToolName(result.toolName)) {
      const reported =
        typeof result.output === "object" &&
        result.output !== null &&
        "postHash" in result.output
          ? result.output.postHash
          : undefined;
      if (reported !== observeBrowserDefinition(input.handle).sha256)
        throw new Error(
          "The document changed after the mutate_petrinaut_net result reported its final hash.",
        );
      const prefix = `${result.toolCallId}:`;
      const attempts = recorder
        .records()
        .filter((record) =>
          record.attempts[0]?.request.toolCallId.startsWith(prefix),
        )
        .flatMap((record) => record.attempts);
      if (attempts.length === 0)
        throw new Error(
          "A mutate_petrinaut_net result requires observed browser mutation records.",
        );
      const outcome = attempts.some((attempt) => attempt.outcome === "unknown")
        ? "unknown"
        : attempts.some((attempt) => attempt.outcome === "failed")
          ? "failed"
          : attempts.some((attempt) => attempt.outcome === "stale")
            ? "stale"
            : attempts.some((attempt) => attempt.outcome === "applied")
              ? "applied"
              : "no-op";
      return {
        mutationRecord: { attempts, outcome },
      } satisfies ClientToolResultMetadata;
    }
    if (
      result.toolName !== "addArc" &&
      !(
        input.construction &&
        (result.toolName === "updateArcWeight" ||
          isObservedNodeMutation(result.toolName) ||
          isObservedStateMutation(result.toolName))
      )
    )
      return undefined;
    const mutationRecord = recorder
      .records()
      .find(
        (record) =>
          record.attempts[0]?.request.toolCallId === result.toolCallId,
      );
    if (!mutationRecord)
      throw new Error(
        "A root arc result requires an observed browser mutation record.",
      );
    return { mutationRecord } satisfies ClientToolResultMetadata;
  };
  return {
    ...recorder,
    mapClientToolInput,
    clientToolResultMetadata,
    validatedClientToolNames: new Set(
      input.construction
        ? [
            "addArc",
            "updateArcWeight",
            "addPlace",
            "updatePlace",
            "addTransition",
            "updateTransition",
            mutatePetrinautNetToolName,
            ...observedStateMutationNames,
          ]
        : ["addArc"],
    ),
  };
};
