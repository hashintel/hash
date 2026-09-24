import {
  canonicalContent,
  hostRecordedCanonicalMutationNames,
  isHostRecordedCanonicalMutation,
  isHostRecordedCanonicalMutationName,
  parseClientToolResultMetadata,
  verifyCanonicalMutationRecord,
  verifyDefinitionObservation,
  verifyExperimentRecord,
  type CanonicalMutationRecord,
  type ExperimentRecord,
  type ClientToolResultMetadata,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import { clientToolHistoryFrom } from "@hashintel/brunch-agent-transport-aisdk";
import {
  createExperimentToolName,
  getLatestNetDefinitionToolName,
  getNetCompilationErrorsToolName,
  mutationActionInputSchemas,
  petrinautAiTools,
  petrinautExperimentRequestSchema,
  petrinautExperimentResultSchema,
  resolvePetrinautHandleCapabilities,
  type DocumentRevisionId,
  type PetrinautDocHandle,
  type SDCPN,
} from "@hashintel/petrinaut-core";
import {
  executePetrinautAiMutation,
  type PetrinautAiAutomaticTool,
  type PetrinautAiAutomaticToolExecuteParams,
} from "@hashintel/petrinaut/ui";

import {
  createBrowserMutationRecords,
  deriveCanonicalMutationEvidence,
  observeBrowserDefinition,
  type BrowserCanonicalMutationRecord,
  type BrowserToolBinding,
  type CanonicalBrowserMutationName,
} from "./mutation-record";

/**
 * Browser host adapter for the deliberately small canonical Petrinaut tool
 * override. Tool names, schemas and outputs stay canonical; observations and
 * durability evidence are retained only in the host-side record seam.
 */
import type { FlueConversationState } from "@flue/sdk";

const passthrough = { parse: (value: unknown) => value };

type CanonicalReplayCall = {
  readonly toolName: string;
  readonly input: unknown;
  readonly conflicting: boolean;
};

type RetainedCanonicalRead = {
  readonly input: unknown;
  readonly output: unknown;
  readonly metadata: ClientToolResultMetadata;
};

type RetainedCanonicalExperiment = {
  readonly input: unknown;
  readonly output: unknown;
  readonly record: ExperimentRecord;
};

type RetainedCanonicalMutation = {
  readonly toolName: CanonicalBrowserMutationName;
  readonly input: unknown;
  readonly output: unknown;
  readonly record: CanonicalMutationRecord;
};

export interface CanonicalPetrinautReplay {
  readonly terminalReads: ReadonlyMap<string, RetainedCanonicalRead>;
  readonly terminalMutations: ReadonlyMap<string, RetainedCanonicalMutation>;
  readonly terminalExperiments: ReadonlyMap<
    string,
    RetainedCanonicalExperiment
  >;
  readonly blockedCalls: ReadonlyMap<string, CanonicalReplayCall>;
}

export type CanonicalPetrinautReplayReadiness =
  | { readonly status: "pending" }
  | { readonly status: "ready"; readonly replay: CanonicalPetrinautReplay };

export const EMPTY_CANONICAL_PETRINAUT_REPLAY: CanonicalPetrinautReplay = {
  terminalReads: new Map(),
  terminalMutations: new Map(),
  terminalExperiments: new Map(),
  blockedCalls: new Map(),
};

export interface CanonicalPetrinautHostToolsInput {
  readonly handle: PetrinautDocHandle;
  readonly binding: BrowserToolBinding;
  /** I-mode panel queues all same-document calls, including reads; legacy modes queue root mutations here. */
  readonly orderedByPanel?: boolean;
  readonly readTitle: () => string;
  readonly replayReadiness: CanonicalPetrinautReplayReadiness;
  readonly settleRevision: (input: {
    readonly documentId: string;
    readonly revisionId: DocumentRevisionId;
  }) => Promise<void>;
}

const sameInput = (left: unknown, right: unknown) =>
  canonicalContent(left) === canonicalContent(right);

const canonicalReplayToolNames = new Set<string>([
  createExperimentToolName,
  getLatestNetDefinitionToolName,
  ...hostRecordedCanonicalMutationNames,
]);

const isCanonicalMutationName = (
  toolName: string,
): toolName is CanonicalBrowserMutationName =>
  isHostRecordedCanonicalMutationName(toolName);

/** Derive reload idempotency from admitted calls and their one dispatch terminal. */
export const deriveCanonicalPetrinautReplay = async (input: {
  readonly snapshot: Pick<FlueConversationState, "messages">;
  readonly binding: BrowserToolBinding;
}): Promise<CanonicalPetrinautReplay> => {
  const calls = new Map<string, CanonicalReplayCall>();
  for (const message of input.snapshot.messages) {
    if (message.role !== "assistant" || message.purpose !== "assistant")
      continue;
    for (const part of message.parts) {
      if (part.type !== "dynamic-tool") continue;
      if (
        !canonicalReplayToolNames.has(part.toolName) ||
        (isHostRecordedCanonicalMutationName(part.toolName) &&
          !isHostRecordedCanonicalMutation(part.toolName, part.input))
      )
        continue;
      const prior = calls.get(part.toolCallId);
      if (prior === undefined) {
        calls.set(part.toolCallId, {
          toolName: part.toolName,
          input: structuredClone(part.input),
          conflicting: false,
        });
      } else if (
        prior.toolName !== part.toolName ||
        !sameInput(prior.input, part.input)
      ) {
        calls.set(part.toolCallId, { ...prior, conflicting: true });
      }
    }
  }

  let results: ReturnType<typeof clientToolHistoryFrom>["results"] = [];
  let dispatchHistoryDecoded = false;
  try {
    results = clientToolHistoryFrom(input.snapshot.messages).results;
    dispatchHistoryDecoded = true;
  } catch {
    // Malformed dispatch history may conceal a delivery, so it is ambiguous.
  }

  const terminalReads = new Map<string, RetainedCanonicalRead>();
  const terminalMutations = new Map<string, RetainedCanonicalMutation>();
  const terminalExperiments = new Map<string, RetainedCanonicalExperiment>();
  const blockedCalls = new Map<string, CanonicalReplayCall>();
  for (const [toolCallId, call] of calls) {
    const identityResults = results.filter(
      (result) => result.toolCallId === toolCallId,
    );
    const matching = identityResults.filter(
      (result) => result.toolName === call.toolName,
    );
    const result = matching[0];
    if (call.conflicting || matching.length !== 1 || result === undefined) {
      blockedCalls.set(toolCallId, {
        ...call,
        conflicting:
          call.conflicting ||
          !dispatchHistoryDecoded ||
          identityResults.length > 0,
      });
      continue;
    }
    const metadata = parseClientToolResultMetadata(result.metadata);
    try {
      if (call.toolName === createExperimentToolName) {
        const record = metadata?.experimentRecord;
        const verified = await verifyExperimentRecord({
          record,
          toolCallId,
          canonicalInput: call.input,
          canonicalOutput: result.output,
          binding: input.binding,
        });
        if (record === undefined)
          throw new Error("Missing canonical experiment terminal.");
        terminalExperiments.set(toolCallId, {
          input: structuredClone(verified.input),
          output: structuredClone(verified.output),
          record: structuredClone(record),
        });
      } else if (call.toolName === getLatestNetDefinitionToolName) {
        const observation = metadata?.observation;
        if (
          metadata === undefined ||
          observation === undefined ||
          observation.toolCallId !== toolCallId ||
          canonicalContent(observation.binding) !==
            canonicalContent(input.binding) ||
          typeof result.output !== "object" ||
          result.output === null ||
          !("definition" in result.output)
        )
          throw new Error("Unbound canonical read terminal.");
        petrinautAiTools[getLatestNetDefinitionToolName].inputSchema.parse(
          call.input,
        );
        const observed = await verifyDefinitionObservation(
          observation.observed,
        );
        if (
          canonicalContent(result.output.definition) !==
          canonicalContent(observed.definition)
        )
          throw new Error(
            "Canonical read output does not match its observation.",
          );
        terminalReads.set(toolCallId, {
          input: structuredClone(call.input),
          output: structuredClone(result.output),
          metadata: structuredClone(metadata),
        });
      } else if (isCanonicalMutationName(call.toolName)) {
        const record = metadata?.canonicalMutationRecord;
        const verified = await verifyCanonicalMutationRecord({
          record,
          toolCallId,
          toolName: call.toolName,
          canonicalInput: call.input,
          canonicalOutput: result.output,
          binding: input.binding,
        });
        if (record === undefined)
          throw new Error("Missing canonical mutation terminal.");
        terminalMutations.set(toolCallId, {
          toolName: call.toolName,
          input: structuredClone(verified.input),
          output: structuredClone(verified.output),
          record: structuredClone(record),
        });
      } else {
        throw new Error("Unsupported canonical replay tool.");
      }
    } catch {
      // One invalid prior delivery must not be repaired into a second result.
      blockedCalls.set(toolCallId, { ...call, conflicting: true });
    }
  }
  return {
    terminalReads,
    terminalMutations,
    terminalExperiments,
    blockedCalls,
  };
};

const liveDefinition = (handle: PetrinautDocHandle): SDCPN => {
  const definition = handle.doc();
  if (!definition)
    throw new Error("The bound browser document is unavailable.");
  return definition;
};

const requiresDiagnostics = (record: BrowserCanonicalMutationRecord) => {
  if (record.toolName === "addPlace")
    return (
      record.input.visualizerCode !== undefined &&
      record.input.visualizerCode.trim() !== ""
    );
  if (record.toolName === "addTransition")
    return (
      record.input.lambdaCode.trim() !== "" ||
      record.input.transitionKernelCode.trim() !== ""
    );
  return false;
};

type CanonicalMutationExecution =
  BrowserCanonicalMutationRecord extends infer Record
    ? Record extends BrowserCanonicalMutationRecord
      ? Pick<Record, "toolName" | "input">
      : never
    : never;

const executeCanonicalMutation = (
  record: CanonicalMutationExecution,
  params: PetrinautAiAutomaticToolExecuteParams,
) => {
  if (record.toolName === "addPlace")
    return executePetrinautAiMutation({
      aiToolCall: { toolName: record.toolName, input: record.input },
      getDefinition: () => liveDefinition(params.handle),
      mutations: params.mutations,
    });
  if (record.toolName === "addTransition")
    return executePetrinautAiMutation({
      aiToolCall: { toolName: record.toolName, input: record.input },
      getDefinition: () => liveDefinition(params.handle),
      mutations: params.mutations,
    });
  return executePetrinautAiMutation({
    aiToolCall: { toolName: record.toolName, input: record.input },
    getDefinition: () => liveDefinition(params.handle),
    mutations: params.mutations,
  });
};

/**
 * Construct canonical browser tools and their host-only evidence store. The
 * three mutation executors share one promise chain: each invocation reserves
 * its place synchronously, and a rejected task is converted to a settled queue
 * tail so later independent siblings are still attempted in invocation order.
 */
export const createCanonicalPetrinautHostTools = (
  input: CanonicalPetrinautHostToolsInput,
) => {
  const records = createBrowserMutationRecords({
    handle: input.handle,
    suppliedBinding: input.binding,
  });
  const readyReplay =
    input.replayReadiness.status === "ready"
      ? input.replayReadiness.replay
      : undefined;
  const terminalMutations = new Map<
    string,
    {
      toolName: CanonicalBrowserMutationName;
      input: unknown;
      output: unknown;
    }
  >(
    [...(readyReplay?.terminalMutations ?? [])].map(
      ([toolCallId, terminal]) => [
        toolCallId,
        {
          toolName: terminal.toolName,
          input: structuredClone(terminal.input),
          output: structuredClone(terminal.output),
        },
      ],
    ),
  );
  const terminalReads = new Map<string, { input: unknown; output: unknown }>(
    [...(readyReplay?.terminalReads ?? [])].map(([toolCallId, terminal]) => [
      toolCallId,
      {
        input: structuredClone(terminal.input),
        output: structuredClone(terminal.output),
      },
    ]),
  );
  const replayReadMetadata = new Map(
    [...(readyReplay?.terminalReads ?? [])].map(([toolCallId, terminal]) => [
      toolCallId,
      structuredClone(terminal.metadata),
    ]),
  );
  const replayMutationMetadata = new Map(
    [...(readyReplay?.terminalMutations ?? [])].map(
      ([toolCallId, terminal]) => [
        toolCallId,
        structuredClone(terminal.record),
      ],
    ),
  );
  const blockedCalls = new Map(readyReplay?.blockedCalls ?? []);
  const experimentProjections = new Map<
    string,
    {
      input: ReturnType<typeof petrinautExperimentRequestSchema.parse>;
      source: ReturnType<typeof observeBrowserDefinition>;
      output?: ReturnType<typeof petrinautExperimentResultSchema.parse>;
    }
  >();
  const executingMutations = new Map<
    string,
    {
      toolName: CanonicalBrowserMutationName;
      input: unknown;
      output: Promise<unknown>;
    }
  >();
  let mutationQueue: Promise<void> = Promise.resolve();

  const retainFailedMutation = (
    toolCallId: string,
    toolName: CanonicalBrowserMutationName,
    parsedInput: unknown,
    reason: string,
  ) => {
    let observation;
    try {
      observation = observeBrowserDefinition(input.handle);
    } catch (error) {
      throw new Error(
        `The live document could not be observed: ${records.errorMessage(error)}`,
      );
    }
    const output = { applied: false, reason };
    const record = {
      toolCallId,
      toolName,
      input: structuredClone(parsedInput),
      binding: structuredClone(records.binding),
      pre: structuredClone(observation),
      post: structuredClone(observation),
      outcome: "failed",
      effects: { created: [], updated: [], deleted: [], derived: [] },
      settlement: { status: "not-required" },
      diagnostics: { status: "not-required" },
      output: structuredClone(output),
      error: reason,
    } as BrowserCanonicalMutationRecord;
    records.retain(record);
    terminalMutations.set(toolCallId, {
      toolName,
      input: structuredClone(parsedInput),
      output: structuredClone(output),
    });
    return output;
  };

  const readNetTool: PetrinautAiAutomaticTool = {
    toolName: getLatestNetDefinitionToolName,
    inputSchema: petrinautAiTools[getLatestNetDefinitionToolName].inputSchema,
    outputSchema: passthrough,
    execute: ({ input: rawInput, handle, toolCallId }) => {
      const parsedInput =
        petrinautAiTools[getLatestNetDefinitionToolName].inputSchema.parse(
          rawInput,
        );
      if (handle !== input.handle)
        throw new Error("The tool call is not bound to this browser document.");
      const terminal = terminalReads.get(toolCallId);
      if (terminal !== undefined) {
        if (!sameInput(terminal.input, parsedInput))
          throw new Error("Conflicting duplicate canonical tool call.");
        return structuredClone(terminal.output);
      }
      const blocked = blockedCalls.get(toolCallId);
      if (blocked !== undefined) {
        if (
          blocked.conflicting ||
          blocked.toolName !== getLatestNetDefinitionToolName ||
          !sameInput(blocked.input, parsedInput)
        )
          throw new Error("Conflicting duplicate canonical tool call.");
        throw new Error(
          "This canonical read call was previously admitted without one verifiable terminal result.",
        );
      }
      if (input.replayReadiness.status === "pending")
        throw new Error(
          "Canonical tool replay verification is not ready for this conversation.",
        );

      const observation = observeBrowserDefinition(handle);
      const output = {
        title: input.readTitle(),
        definition: observation.definition,
        extensions: resolvePetrinautHandleCapabilities(handle.capabilities)
          .extensions,
      };
      records.retain({
        toolCallId,
        toolName: getLatestNetDefinitionToolName,
        binding: structuredClone(records.binding),
        observation,
      });
      terminalReads.set(toolCallId, {
        input: structuredClone(parsedInput),
        output: structuredClone(output),
      });
      return output;
    },
  };

  const diagnosticsTool: PetrinautAiAutomaticTool = {
    toolName: getNetCompilationErrorsToolName,
    inputSchema: petrinautAiTools[getNetCompilationErrorsToolName].inputSchema,
    outputSchema: passthrough,
    execute: ({ input: rawInput, handle, readDiagnosticsContext }) => {
      petrinautAiTools[getNetCompilationErrorsToolName].inputSchema.parse(
        rawInput,
      );
      if (handle !== input.handle)
        throw new Error("The tool call is not bound to this browser document.");
      return readDiagnosticsContext();
    },
  };

  const runMutation = async (
    initialRecord: BrowserCanonicalMutationRecord,
    params: PetrinautAiAutomaticToolExecuteParams,
  ) => {
    let record = initialRecord;
    let pre;
    try {
      pre = observeBrowserDefinition(input.handle);
      record = { ...record, pre } as BrowserCanonicalMutationRecord;
      records.retain(record);
    } catch (error) {
      const hostError = new Error(
        `The live document could not be observed: ${records.errorMessage(error)}`,
      );
      record = {
        ...record,
        outcome: "failed",
        error: hostError.message,
      } as BrowserCanonicalMutationRecord;
      records.retain(record);
      const output = { applied: false, reason: hostError.message };
      terminalMutations.set(params.toolCallId, {
        toolName: record.toolName,
        input: structuredClone(record.input),
        output: structuredClone(output),
      });
      return output;
    }

    let canonicalOutput: unknown;
    let callbackError: unknown;
    try {
      canonicalOutput = executeCanonicalMutation(record, params);
    } catch (error) {
      callbackError = error;
    }

    let postStateVerifiable = false;
    try {
      const post = observeBrowserDefinition(input.handle);
      const evidence = deriveCanonicalMutationEvidence({
        toolName: record.toolName,
        input: record.input,
        pre,
        post,
      });
      postStateVerifiable = true;
      record = {
        ...record,
        post,
        outcome: evidence.outcome,
        ...(evidence.outcomeReason === undefined
          ? {}
          : { outcomeReason: evidence.outcomeReason }),
        effects: evidence.effects,
        settlement:
          post.revisionId === pre.revisionId
            ? { status: "not-required" }
            : { status: "pending", revisionId: post.revisionId },
      } as BrowserCanonicalMutationRecord;
    } catch {
      // Missing post-state evidence is intentionally not synthesized.
    }
    records.retain(record);

    let hostError: Error | undefined;
    if (record.settlement.status === "pending") {
      const revisionId = record.settlement.revisionId;
      try {
        await input.settleRevision({
          documentId: records.binding.documentId,
          revisionId,
        });
        record = {
          ...record,
          settlement: { status: "settled", revisionId },
        } as BrowserCanonicalMutationRecord;
      } catch (error) {
        hostError = new Error(
          `The document revision was not settled: ${records.errorMessage(error)}`,
        );
        record = {
          ...record,
          settlement: {
            status: "failed",
            revisionId,
            error: records.errorMessage(error),
          },
        } as BrowserCanonicalMutationRecord;
      }
      records.retain(record);
    }

    if (requiresDiagnostics(record)) {
      try {
        const value = await params.readDiagnosticsContext();
        record = {
          ...record,
          diagnostics: { status: "settled", value },
        } as BrowserCanonicalMutationRecord;
      } catch (error) {
        record = {
          ...record,
          diagnostics: {
            status: "failed",
            error: records.errorMessage(error),
          },
        } as BrowserCanonicalMutationRecord;
      }
    }

    if (callbackError !== undefined) {
      hostError = new Error(records.errorMessage(callbackError));
    }
    if (!postStateVerifiable && hostError === undefined) {
      hostError = new Error(
        "The canonical mutation's post-state could not be verified from the live document.",
      );
    }
    const output =
      hostError === undefined
        ? canonicalOutput
        : { applied: false, reason: hostError.message };
    record = {
      ...record,
      ...(hostError === undefined
        ? {}
        : {
            outcome:
              record.post?.sha256 === record.pre?.sha256
                ? ("failed" as const)
                : ("unknown" as const),
            error: hostError.message,
          }),
      output,
    } as BrowserCanonicalMutationRecord;
    records.retain(record);
    terminalMutations.set(params.toolCallId, {
      toolName: record.toolName,
      input: structuredClone(record.input),
      output: structuredClone(output),
    });
    return output;
  };

  const createMutationTool = (
    toolName: CanonicalBrowserMutationName,
  ): PetrinautAiAutomaticTool => ({
    toolName,
    inputSchema: mutationActionInputSchemas[toolName],
    outputSchema: passthrough,
    execute: async (params: PetrinautAiAutomaticToolExecuteParams) => {
      const parsedInput = mutationActionInputSchemas[toolName].parse(
        params.input,
      );
      if (params.handle !== input.handle)
        throw new Error("The tool call is not bound to this browser document.");
      if (!isHostRecordedCanonicalMutation(toolName, parsedInput))
        return executeCanonicalMutation(
          { toolName, input: parsedInput } as CanonicalMutationExecution,
          params,
        );

      const terminal = terminalMutations.get(params.toolCallId);
      if (terminal !== undefined) {
        if (
          terminal.toolName !== toolName ||
          !sameInput(terminal.input, parsedInput)
        )
          throw new Error("Conflicting duplicate canonical tool call.");
        return Promise.resolve(structuredClone(terminal.output));
      }
      const executing = executingMutations.get(params.toolCallId);
      if (executing !== undefined) {
        if (
          executing.toolName !== toolName ||
          !sameInput(executing.input, parsedInput)
        )
          throw new Error("Conflicting duplicate canonical tool call.");
        return executing.output.then((output) => structuredClone(output));
      }
      const blocked = blockedCalls.get(params.toolCallId);
      if (blocked !== undefined) {
        if (
          blocked.conflicting ||
          blocked.toolName !== toolName ||
          !sameInput(blocked.input, parsedInput)
        )
          throw new Error("Conflicting duplicate canonical tool call.");
        return retainFailedMutation(
          params.toolCallId,
          toolName,
          parsedInput,
          "This canonical mutation call was previously admitted without one verifiable terminal result.",
        );
      }
      if (input.replayReadiness.status === "pending")
        return retainFailedMutation(
          params.toolCallId,
          toolName,
          parsedInput,
          "Canonical tool replay verification is not ready for this conversation.",
        );

      const recordWithoutDiagnostics = {
        toolCallId: params.toolCallId,
        toolName,
        input: structuredClone(parsedInput),
        binding: structuredClone(records.binding),
        settlement: { status: "not-required" },
        diagnostics: { status: "not-required" },
      } as BrowserCanonicalMutationRecord;
      const initialRecord = {
        ...recordWithoutDiagnostics,
        diagnostics: requiresDiagnostics(recordWithoutDiagnostics)
          ? { status: "pending" as const }
          : { status: "not-required" as const },
      } as BrowserCanonicalMutationRecord;

      const execution = input.orderedByPanel
        ? runMutation(initialRecord, params)
        : mutationQueue.then(() => runMutation(initialRecord, params));
      if (!input.orderedByPanel)
        mutationQueue = execution.then(
          () => undefined,
          () => undefined,
        );
      executingMutations.set(params.toolCallId, {
        toolName,
        input: structuredClone(parsedInput),
        output: execution,
      });
      void execution.then(
        () => executingMutations.delete(params.toolCallId),
        () => executingMutations.delete(params.toolCallId),
      );
      return execution;
    },
  });

  const mutationTools = (["addPlace", "addTransition", "addArc"] as const).map(
    createMutationTool,
  );

  return {
    tools: [readNetTool, diagnosticsTool, ...mutationTools],
    records: records.records,
    metadataFor: records.metadataFor,
    /**
     * Observe an experiment's source when its canonical call reaches the
     * browser, while leaving Petrinaut's static createExperiment tool in sole
     * possession of the model-visible request and execution lifecycle.
     */
    mapClientToolInput: ({
      input: rawInput,
      toolCallId,
      toolName,
    }: {
      readonly input: unknown;
      readonly toolCallId: string;
      readonly toolName: string;
    }) => {
      if (toolName !== createExperimentToolName) return rawInput;
      const parsedInput = petrinautExperimentRequestSchema.parse(rawInput);
      if (input.replayReadiness.status === "pending")
        throw new Error(
          "Canonical tool replay verification is not ready for this conversation.",
        );
      const blocked = blockedCalls.get(toolCallId);
      if (blocked !== undefined) {
        if (
          blocked.conflicting ||
          blocked.toolName !== createExperimentToolName ||
          !sameInput(blocked.input, parsedInput)
        )
          throw new Error("Conflicting duplicate canonical tool call.");
        throw new Error(
          "This canonical experiment call was previously admitted without one verifiable terminal result.",
        );
      }
      const terminal = readyReplay?.terminalExperiments.get(toolCallId);
      if (terminal !== undefined) {
        if (!sameInput(terminal.input, parsedInput))
          throw new Error("Conflicting duplicate canonical tool call.");
        throw new Error(
          "This canonical experiment call already has a verified terminal result.",
        );
      }
      const projectedSource = observeBrowserDefinition(input.handle);
      const retained = experimentProjections.get(toolCallId);
      if (retained !== undefined) {
        if (
          !sameInput(retained.input, parsedInput) ||
          !sameInput(retained.source, projectedSource)
        )
          throw new Error("Conflicting duplicate experiment projection.");
        return rawInput;
      }
      experimentProjections.set(toolCallId, {
        input: structuredClone(parsedInput),
        source: projectedSource,
      });
      return rawInput;
    },
    /** Validated wire sidecar; the canonical model-visible output is untouched. */
    clientToolResultMetadataFor: (
      toolCallId: string,
      canonicalOutput?: unknown,
    ) => {
      const experiment = experimentProjections.get(toolCallId);
      if (experiment !== undefined && canonicalOutput !== undefined) {
        const parsedOutput =
          petrinautExperimentResultSchema.parse(canonicalOutput);
        if (parsedOutput.name !== experiment.input.name)
          throw new Error(
            "The experiment terminal result does not belong to the projected request.",
          );
        if (
          experiment.output !== undefined &&
          !sameInput(experiment.output, parsedOutput)
        )
          throw new Error("Conflicting duplicate experiment result.");
        experiment.output ??= structuredClone(parsedOutput);
        return parseClientToolResultMetadata({
          experimentRecord: {
            toolCallId,
            binding: structuredClone(records.binding),
            input: structuredClone(experiment.input),
            source: structuredClone(experiment.source),
            output: structuredClone(experiment.output),
          },
        });
      }
      const replayedRead = replayReadMetadata.get(toolCallId);
      if (replayedRead !== undefined) return structuredClone(replayedRead);
      const replayedMutation = replayMutationMetadata.get(toolCallId);
      if (replayedMutation !== undefined)
        return parseClientToolResultMetadata({
          canonicalMutationRecord: structuredClone(replayedMutation),
        });
      const record = records.metadataFor(toolCallId);
      if (record?.toolName === getLatestNetDefinitionToolName) {
        return parseClientToolResultMetadata({
          observation: {
            toolCallId: record.toolCallId,
            binding: record.binding,
            observed: record.observation,
          },
        });
      }
      if (record === undefined) return undefined;
      if (
        record.pre === undefined ||
        record.outcome === undefined ||
        record.effects === undefined ||
        record.output === undefined ||
        record.settlement.status === "pending"
      ) {
        // A host-recorded call without a deliverable record is a host defect;
        // surface exactly which evidence is missing rather than failing silently.
        // eslint-disable-next-line no-console -- host-defect diagnostic captured by the evaluator's console listener
        console.error(
          `[brunch] ${record.toolName} ${record.toolCallId} has no deliverable canonical mutation record: ${JSON.stringify(
            {
              pre: record.pre !== undefined,
              post: record.post !== undefined,
              outcome: record.outcome,
              effects: record.effects !== undefined,
              output: record.output !== undefined,
              settlement: record.settlement.status,
              error: record.error,
            },
          )}`,
        );
        return undefined;
      }
      return parseClientToolResultMetadata({
        canonicalMutationRecord: {
          toolCallId: record.toolCallId,
          toolName: record.toolName,
          binding: record.binding,
          input: record.input,
          pre: record.pre,
          ...(record.post === undefined ? {} : { post: record.post }),
          outcome: record.outcome,
          effects: record.effects,
          settlement: record.settlement,
          diagnostics: record.diagnostics,
          output: record.output,
          ...(record.error === undefined ? {} : { error: record.error }),
        },
      });
    },
  };
};
