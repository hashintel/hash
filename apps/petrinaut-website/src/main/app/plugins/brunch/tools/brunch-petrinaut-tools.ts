import { browserToolMutatesDocument } from "@hashintel/brunch-agent-plugin-sdcpn";
import {
  getLatestNetDefinitionToolName,
  getNetCompilationErrorsToolName,
  mutationActionInputSchemas,
  petrinautAiTools,
} from "@hashintel/petrinaut-core";

import { executePetrinautAiMutation } from "../../_shared/chat/execute-petrinaut-ai-mutation";
import { readDiagnosticsForAi } from "../../_shared/chat/read-diagnostics-for-ai";
import {
  type DocumentRevision,
  documentRevisionOf,
} from "./shared/document-revision";

import type { PetrinautAiAutomaticTool } from "../../_shared/chat/automatic-tool";
import type { FlueConversationState } from "@flue/sdk";
import type { PluginDocument } from "@hashintel/petrinaut/ui";

interface DocumentRevisionMetadata {
  readonly documentRevision: {
    readonly before?: string;
    readonly after?: string;
  };
}

type RetainedCall = {
  readonly toolName: string;
  readonly input: unknown;
  readonly output?: unknown;
  readonly metadata?: DocumentRevisionMetadata;
};
interface CanonicalPetrinautReplay {
  readonly calls: ReadonlyMap<string, RetainedCall>;
}
export type CanonicalPetrinautReplayReadiness =
  | { readonly status: "pending" }
  | { readonly status: "ready"; readonly replay: CanonicalPetrinautReplay };
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
      const output =
        part.state === "output-available" &&
        typeof part.output === "object" &&
        part.output !== null &&
        "brunchBrowserResult" in part.output &&
        part.output.brunchBrowserResult === true &&
        "output" in part.output
          ? part.output.output
          : undefined;
      const metadata =
        part.state === "output-available" &&
        typeof part.output === "object" &&
        part.output !== null &&
        "metadata" in part.output
          ? (part.output.metadata as DocumentRevisionMetadata)
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

interface CanonicalPetrinautHostToolsInput {
  readonly document: PluginDocument;
  readonly replayReadiness: CanonicalPetrinautReplayReadiness;
}

/** Petrinaut executes canonical actions; the host records the content revision before each call, and after it when the call changed the document. */
export const createCanonicalPetrinautHostTools = (
  input: CanonicalPetrinautHostToolsInput,
) => {
  const { document } = input;
  const currentRevision = () => documentRevisionOf(document.net.get());
  const before = new Map<string, DocumentRevision>();
  const stampBefore = (toolCallId: string) => {
    before.set(toolCallId, currentRevision());
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
  const metadata = new Map<string, DocumentRevisionMetadata>();
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

  const readNetTool: PetrinautAiAutomaticTool = {
    toolName: getLatestNetDefinitionToolName,
    inputSchema: petrinautAiTools[getLatestNetDefinitionToolName].inputSchema,
    outputSchema: passthrough,
    execute: ({ toolCallId }) => {
      const prior = priorOutput(toolCallId);
      if (prior.found) return prior.output;
      if (input.replayReadiness.status === "pending")
        throw new Error("Conversation history is not ready.");
      const output = structuredClone({
        title: document.title.get(),
        definition: document.net.get(),
        extensions: document.extensions,
      });
      stampBefore(toolCallId);
      toolNames.set(toolCallId, getLatestNetDefinitionToolName);
      started.set(toolCallId, {
        toolName: getLatestNetDefinitionToolName,
        input: {},
        output,
      });
      return output;
    },
  };
  const diagnosticsTool: PetrinautAiAutomaticTool = {
    toolName: getNetCompilationErrorsToolName,
    inputSchema: petrinautAiTools[getNetCompilationErrorsToolName].inputSchema,
    outputSchema: passthrough,
    execute: async ({ toolCallId }) => {
      const prior = priorOutput(toolCallId);
      if (prior.found) return prior.output;
      const output = await readDiagnosticsForAi(document);
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
    execute: ({ toolCallId, input: rawInput }) => {
      const prior = priorOutput(toolCallId);
      if (prior.found) return prior.output;
      if (input.replayReadiness.status === "pending")
        throw new Error("Conversation history is not ready.");
      const parsed = mutationActionInputSchemas[toolName].parse(rawInput);
      stampBefore(toolCallId);
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
        getDefinition: () => document.net.get(),
        edit: document.edit,
      });
      started.set(toolCallId, { toolName, input: parsed, output });
      return output;
    },
  }));
  return {
    tools: [readNetTool, diagnosticsTool, ...mutationTools],
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
      stampBefore(toolCallId);
      return rawInput;
    },
    clientToolResultMetadataFor: (
      toolCallId: string,
      _output?: unknown,
    ): DocumentRevisionMetadata => {
      const existing = metadata.get(toolCallId);
      if (existing) return existing;
      const revisionBefore = before.get(toolCallId);
      const revisionAfter = currentRevision();
      const toolName = toolNames.get(toolCallId);
      const changed =
        revisionBefore !== undefined &&
        revisionBefore !== revisionAfter &&
        (toolName === undefined || browserToolMutatesDocument(toolName));
      const result: DocumentRevisionMetadata = {
        documentRevision: {
          ...(revisionBefore === undefined ? {} : { before: revisionBefore }),
          ...(changed ? { after: revisionAfter } : {}),
        },
      };
      metadata.set(toolCallId, result);
      return result;
    },
  };
};
