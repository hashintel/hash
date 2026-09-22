/**
 * Unwired browser host adapter for canonical Petrinaut tools. Tool names,
 * schemas and outputs stay canonical; observations and durability evidence are
 * retained only in the host-side record seam.
 */
import { parseClientToolResultMetadata } from "@hashintel/brunch-agent-plugin-sdcpn";
import {
  getLatestNetDefinitionToolName,
  getNetCompilationErrorsToolName,
  mutationActionInputSchemas,
  petrinautAiTools,
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
  deriveAddPlaceEvidence,
  observeBrowserDefinition,
  type BrowserAddPlaceRecord,
  type BrowserToolBinding,
} from "./mutation-record";

const passthrough = { parse: (value: unknown) => value };

export interface CanonicalPetrinautHostToolsInput {
  readonly handle: PetrinautDocHandle;
  readonly binding: BrowserToolBinding;
  readonly readTitle: () => string;
  readonly settleRevision: (input: {
    readonly documentId: string;
    readonly revisionId: DocumentRevisionId;
  }) => Promise<void>;
}

const sameInput = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);

const liveDefinition = (handle: PetrinautDocHandle): SDCPN => {
  const definition = handle.doc();
  if (!definition)
    throw new Error("The bound browser document is unavailable.");
  return definition;
};

/**
 * Construct canonical browser tools and their host-only evidence store. A
 * later composition layer can install `tools` directly and attach
 * `metadataFor(toolCallId)` to transport results.
 */
export const createCanonicalPetrinautHostTools = (
  input: CanonicalPetrinautHostToolsInput,
) => {
  const records = createBrowserMutationRecords({
    handle: input.handle,
    suppliedBinding: input.binding,
  });
  const terminalMutations = new Map<
    string,
    { input: unknown; output: unknown }
  >();
  const terminalReads = new Map<string, { input: unknown; output: unknown }>();

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

  const addPlaceTool: PetrinautAiAutomaticTool = {
    toolName: "addPlace",
    inputSchema: mutationActionInputSchemas.addPlace,
    outputSchema: passthrough,
    execute: async (params: PetrinautAiAutomaticToolExecuteParams) => {
      const parsedInput = mutationActionInputSchemas.addPlace.parse(
        params.input,
      );
      if (params.handle !== input.handle)
        throw new Error("The tool call is not bound to this browser document.");

      const terminal = terminalMutations.get(params.toolCallId);
      if (terminal !== undefined) {
        if (!sameInput(terminal.input, parsedInput))
          throw new Error("Conflicting duplicate canonical tool call.");
        return structuredClone(terminal.output);
      }
      const existing = records.read(params.toolCallId);
      if (existing !== undefined)
        throw new Error("The canonical tool call is still executing.");

      const diagnosticsRequired =
        parsedInput.visualizerCode !== undefined &&
        parsedInput.visualizerCode.trim() !== "";
      let record: BrowserAddPlaceRecord = {
        toolCallId: params.toolCallId,
        toolName: "addPlace",
        input: structuredClone(parsedInput),
        binding: structuredClone(records.binding),
        settlement: { status: "not-required" },
        diagnostics: diagnosticsRequired
          ? { status: "pending" }
          : { status: "not-required" },
      };

      let pre;
      try {
        pre = observeBrowserDefinition(input.handle);
        record = { ...record, pre };
        records.retain(record);
      } catch (error) {
        const hostError = new Error(
          `The live document could not be observed: ${records.errorMessage(error)}`,
        );
        record = { ...record, outcome: "failed", error: hostError.message };
        records.retain(record);
        const output = { applied: false, reason: hostError.message };
        terminalMutations.set(params.toolCallId, {
          input: structuredClone(parsedInput),
          output: structuredClone(output),
        });
        return output;
      }

      let canonicalOutput: unknown;
      let callbackError: unknown;
      try {
        canonicalOutput = executePetrinautAiMutation({
          aiToolCall: { toolName: "addPlace", input: parsedInput },
          getDefinition: () => liveDefinition(input.handle),
          mutations: params.mutations,
        });
      } catch (error) {
        callbackError = error;
      }

      let postStateVerifiable = false;
      try {
        const post = observeBrowserDefinition(input.handle);
        const evidence = deriveAddPlaceEvidence({
          input: parsedInput,
          pre,
          post,
        });
        postStateVerifiable = true;
        record = {
          ...record,
          post,
          outcome: evidence.outcome,
          effects: evidence.effects,
          settlement:
            post.revisionId === pre.revisionId
              ? { status: "not-required" }
              : { status: "pending", revisionId: post.revisionId },
        };
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
          };
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
          };
        }
        records.retain(record);
      }

      if (diagnosticsRequired) {
        try {
          const value = await params.readDiagnosticsContext();
          record = { ...record, diagnostics: { status: "settled", value } };
        } catch (error) {
          record = {
            ...record,
            diagnostics: {
              status: "failed",
              error: records.errorMessage(error),
            },
          };
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
      };
      records.retain(record);
      terminalMutations.set(params.toolCallId, {
        input: structuredClone(parsedInput),
        output: structuredClone(output),
      });
      return output;
    },
  };

  return {
    tools: [readNetTool, diagnosticsTool, addPlaceTool],
    records: records.records,
    metadataFor: records.metadataFor,
    /** Validated wire sidecar; the canonical model-visible output is untouched. */
    clientToolResultMetadataFor: (toolCallId: string) => {
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
      if (
        record?.toolName !== "addPlace" ||
        record.pre === undefined ||
        record.outcome === undefined ||
        record.effects === undefined ||
        record.output === undefined ||
        record.settlement.status === "pending"
      ) {
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
