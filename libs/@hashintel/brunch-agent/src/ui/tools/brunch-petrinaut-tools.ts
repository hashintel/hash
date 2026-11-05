import {
  browserToolEnvelopeOf,
  browserToolMutatesDocument,
  type ClientToolHistoryResult,
  type ClientToolResultMetadata,
  type NetReaderLevel,
  netReaderToolNames,
  netStructureOf,
  projectNetDefinition,
  parseNetReaderInput,
} from "@hashintel/brunch-agent";
import {
  getLatestNetDefinitionToolName,
  getNetCompilationErrorsToolName,
  mutationActionInputSchemas,
  petrinautAiTools,
  resolvePetrinautHandleCapabilities,
  type PetrinautDocHandle,
} from "@hashintel/petrinaut-core";

import { executePetrinautAiMutation } from "../chat/ai-assistant-panel";
import {
  type DocumentRevision,
  documentRevisionOf,
} from "./shared/document-revision";

import type { PetrinautAiAutomaticTool } from "../chat/ai-automatic-tool";
import type { ReplayReadiness } from "../use-brunch-assistant/use-immutable-replay-baseline";
import type { FlueConversationState } from "@flue/sdk";

type RetainedCall = Pick<ClientToolHistoryResult, "toolName"> &
  Partial<Pick<ClientToolHistoryResult, "output">> & {
    readonly input: unknown;
    readonly metadata?: ClientToolResultMetadata;
  };
export interface CanonicalPetrinautReplay {
  readonly calls: ReadonlyMap<string, RetainedCall>;
}
type CanonicalPetrinautReplayReadiness =
  ReplayReadiness<CanonicalPetrinautReplay>;
export const EMPTY_CANONICAL_PETRINAUT_REPLAY: CanonicalPetrinautReplay = {
  calls: new Map(),
};

/** The immutable pre-admission history: an uncertain call remains attempted, never retried. */
export const issuedCanonicalCallsFromHistory = async ({
  snapshot,
}: {
  readonly snapshot: Pick<FlueConversationState, "messages">;
}): Promise<CanonicalPetrinautReplay> => {
  const calls = new Map<string, RetainedCall>();
  for (const message of snapshot.messages) {
    if (message.role !== "assistant" || message.purpose !== "assistant")
      continue;
    for (const part of message.parts) {
      if (part.type !== "dynamic-tool" || !(part.toolName in petrinautAiTools))
        continue;
      const recorded =
        part.state === "output-available" ? part.output : undefined;
      const output = browserToolEnvelopeOf(recorded)?.output;
      // The sidecar is taken from any recorded object, enveloped or not.
      const metadata =
        typeof recorded === "object" &&
        recorded !== null &&
        "metadata" in recorded
          ? (recorded.metadata as ClientToolResultMetadata)
          : undefined;
      calls.set(part.toolCallId, {
        toolName: part.toolName,
        input: part.input,
        ...(output === undefined ? {} : { output }),
        ...(metadata === undefined ? {} : { metadata }),
      });
    }
  }
  return { calls };
};

export interface CanonicalPetrinautHostToolsInput {
  readonly handle: PetrinautDocHandle;
  readonly readTitle: () => string;
  readonly replayReadiness: CanonicalPetrinautReplayReadiness;
}

const currentRevision = (
  handle: PetrinautDocHandle,
): DocumentRevision | undefined => {
  const definition = handle.doc();
  return definition === undefined ? undefined : documentRevisionOf(definition);
};

/** Petrinaut executes canonical actions; the host records the content revision before each call, and after it when the call changed the document. */
export const createCanonicalPetrinautHostTools = (
  input: CanonicalPetrinautHostToolsInput,
) => {
  const before = new Map<string, DocumentRevision>();
  const stampBefore = (toolCallId: string, handle: PetrinautDocHandle) => {
    const revision = currentRevision(handle);
    if (revision === undefined) before.delete(toolCallId);
    else before.set(toolCallId, revision);
  };
  const toolNames = new Map<string, string>();
  const prepared = new Set<string>();
  const replay =
    input.replayReadiness.status === "ready"
      ? input.replayReadiness.replay.calls
      : new Map<string, RetainedCall>();
  const started = new Map<
    string,
    {
      readonly toolName: string;
      readonly input: unknown;
      readonly output: unknown;
    }
  >();
  const metadata = new Map<string, ClientToolResultMetadata>();
  /** The revision each settled Brunch change started from, keyed by the one it produced. */
  const producedFrom = new Map<string, string>();
  for (const call of replay.values()) {
    const { before: revisionBefore, after: revisionAfter } =
      call.metadata?.documentRevision ?? {};
    if (revisionBefore !== undefined && revisionAfter !== undefined)
      producedFrom.set(revisionAfter, revisionBefore);
  }
  const passthrough = { parse: (value: unknown) => value };

  const priorOutput = (
    toolCallId: string,
  ): { found: boolean; output?: unknown } => {
    const previous = replay.get(toolCallId) ?? started.get(toolCallId);
    if (previous === undefined) return { found: false };
    if (!("output" in previous))
      throw new Error(
        "This browser call was already attempted; it will not run again.",
      );
    if ("metadata" in previous && previous.metadata !== undefined)
      metadata.set(toolCallId, previous.metadata);
    return { found: true, output: previous.output };
  };

  const readNet = (
    toolName: string,
    view: (definition: unknown) => unknown,
    toolCallId: string,
    handle: PetrinautDocHandle,
  ) => {
    const prior = priorOutput(toolCallId);
    if (prior.found) return prior.output;
    if (input.replayReadiness.status === "pending")
      throw new Error("Conversation history is not ready.");
    const definition = handle.doc();
    if (!definition)
      throw new Error("The bound browser document is unavailable.");
    const output = {
      title: input.readTitle(),
      definition: view(structuredClone(definition)),
      extensions: resolvePetrinautHandleCapabilities(handle.capabilities)
        .extensions,
    };
    stampBefore(toolCallId, handle);
    toolNames.set(toolCallId, toolName);
    started.set(toolCallId, { toolName, input: {}, output });
    return output;
  };
  const readNetTool: PetrinautAiAutomaticTool = {
    toolName: getLatestNetDefinitionToolName,
    inputSchema: petrinautAiTools[getLatestNetDefinitionToolName].inputSchema,
    outputSchema: passthrough,
    execute: ({ toolCallId, handle }) =>
      readNet(
        getLatestNetDefinitionToolName,
        (definition) => definition,
        toolCallId,
        handle,
      ),
  };
  const readerTools: PetrinautAiAutomaticTool[] = (
    Object.keys(netReaderToolNames) as NetReaderLevel[]
  ).map((level) => ({
    toolName: netReaderToolNames[level],
    inputSchema: { parse: parseNetReaderInput },
    outputSchema: passthrough,
    execute: ({ toolCallId, handle }) =>
      readNet(
        netReaderToolNames[level],
        (definition) => projectNetDefinition(definition, level),
        toolCallId,
        handle,
      ),
  }));
  const diagnosticsTool: PetrinautAiAutomaticTool = {
    toolName: getNetCompilationErrorsToolName,
    inputSchema: petrinautAiTools[getNetCompilationErrorsToolName].inputSchema,
    outputSchema: passthrough,
    execute: async ({ toolCallId, readDiagnosticsContext }) => {
      const prior = priorOutput(toolCallId);
      if (prior.found) return prior.output;
      const output = await readDiagnosticsContext();
      started.set(toolCallId, {
        toolName: getNetCompilationErrorsToolName,
        input: {},
        output,
      });
      return output;
    },
  };
  const mutationTools: PetrinautAiAutomaticTool[] = (
    ["addPlace", "addTransition", "addArc"] as const
  ).map((toolName) => ({
    toolName,
    inputSchema: mutationActionInputSchemas[toolName],
    outputSchema: passthrough,
    execute: ({ toolCallId, input: rawInput, handle, edit }) => {
      const prior = priorOutput(toolCallId);
      if (prior.found) return prior.output;
      if (input.replayReadiness.status === "pending")
        throw new Error("Conversation history is not ready.");
      const parsed = mutationActionInputSchemas[toolName].parse(rawInput);
      const definition = () => {
        const current = handle.doc();
        if (!current)
          throw new Error("The bound browser document is unavailable.");
        return current;
      };
      stampBefore(toolCallId, handle);
      toolNames.set(toolCallId, toolName);
      const aiToolCall =
        toolName === "addPlace"
          ? ({
              toolName,
              input: mutationActionInputSchemas.addPlace.parse(rawInput),
            } as const)
          : toolName === "addTransition"
            ? ({
                toolName,
                input: mutationActionInputSchemas.addTransition.parse(rawInput),
              } as const)
            : {
                toolName: "addArc" as const,
                input: mutationActionInputSchemas.addArc.parse(rawInput),
              };
      const output = executePetrinautAiMutation({
        aiToolCall,
        getDefinition: definition,
        // Refused while the editor is read-only: the refusal is the output.
        edit,
      });
      started.set(toolCallId, { toolName, input: parsed, output });
      return output;
    },
  }));
  return {
    tools: [readNetTool, ...readerTools, diagnosticsTool, ...mutationTools],
    /**
     * Whether the document has moved since `expected` only through settled
     * Brunch changes. A hand edit, or a change whose revisions were never
     * recorded, breaks the chain.
     */
    acceptsRevision: (expected: string): boolean => {
      const visited = new Set<string>();
      let revision: string | undefined = currentRevision(input.handle);
      while (revision !== undefined && !visited.has(revision)) {
        if (revision === expected) return true;
        visited.add(revision);
        revision = producedFrom.get(revision);
      }
      return false;
    },
    mapClientToolInput: ({
      input: rawInput,
      toolCallId,
      toolName,
    }: {
      readonly input: unknown;
      readonly toolCallId: string;
      readonly toolName: string;
    }) => {
      const prior = priorOutput(toolCallId);
      if (
        prior.found &&
        toolName !== getLatestNetDefinitionToolName &&
        toolName !== "addPlace" &&
        toolName !== "addTransition" &&
        toolName !== "addArc"
      )
        throw new Error(
          "This browser call was already recorded; it will not run again.",
        );
      if (input.replayReadiness.status === "pending")
        throw new Error("Conversation history is not ready.");
      if (prepared.has(toolCallId))
        throw new Error(
          "This browser call was already attempted; it will not run again.",
        );
      prepared.add(toolCallId);
      toolNames.set(toolCallId, toolName);
      stampBefore(toolCallId, input.handle);
      return rawInput;
    },
    clientToolResultMetadataFor: (
      toolCallId: string,
      _output?: unknown,
    ): ClientToolResultMetadata => {
      const existing = metadata.get(toolCallId);
      if (existing) return existing;
      const revisionBefore = before.get(toolCallId);
      const revisionAfter = currentRevision(input.handle);
      const toolName = toolNames.get(toolCallId);
      const changed =
        revisionBefore !== undefined &&
        revisionAfter !== undefined &&
        revisionBefore !== revisionAfter &&
        (toolName === undefined || browserToolMutatesDocument(toolName));
      if (changed) producedFrom.set(revisionAfter, revisionBefore);
      const definition = changed ? input.handle.doc() : undefined;
      const result: ClientToolResultMetadata = {
        documentRevision: {
          ...(revisionBefore === undefined ? {} : { before: revisionBefore }),
          ...(changed ? { after: revisionAfter } : {}),
        },
        ...(definition
          ? {
              readBack: netStructureOf(structuredClone(definition)),
            }
          : {}),
      };
      metadata.set(toolCallId, result);
      return result;
    },
  };
};
