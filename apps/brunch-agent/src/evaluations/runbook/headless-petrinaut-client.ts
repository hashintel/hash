import {
  PETRINAUT_CONSTRUCTION_TOOL_NAMES,
  type PetrinautConstructionToolName,
} from "@hashintel/brunch-agent-plugin-sdcpn/flue";
import {
  createJsonDocHandle,
  createPetrinaut,
  parseSDCPNFile,
} from "@hashintel/petrinaut-core";
import {
  createPetrinautAiWritableCallbacks,
  getLatestNetDefinitionToolName,
  petrinautAiTools,
  type PetrinautAiToolInput,
} from "@hashintel/petrinaut-core/ai";

import type { ClientToolCall } from "../../conversation/client-tools.ts";
import type { ClientToolResult } from "@hashintel/brunch-agent-transport-aisdk";
import type { Petrinaut, SDCPN } from "@hashintel/petrinaut-core";

export type HeadlessPetrinautToolCall = ClientToolCall;

/** A client-tool result whose output the headless host fully determines. */
export type HeadlessPetrinautToolResult = Omit<ClientToolResult, "output"> & {
  readonly output:
    | {
        readonly applied: true;
      }
    | {
        readonly applied: false;
        readonly error: string;
      }
    | {
        readonly title: string;
        readonly definition: ReturnType<Petrinaut["definition"]["get"]>;
        readonly extensions: Petrinaut["extensions"];
      };
};

type WritableConstructionToolName = Exclude<
  PetrinautConstructionToolName,
  typeof getLatestNetDefinitionToolName
>;

const constructionToolNames = new Set<string>(
  PETRINAUT_CONSTRUCTION_TOOL_NAMES,
);

const errorMessageFrom = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const createHeadlessPetrinautClient = (
  title: string,
  initial: SDCPN = {
    places: [],
    transitions: [],
    types: [],
    parameters: [],
    differentialEquations: [],
  },
) => {
  const handle = createJsonDocHandle({
    initial,
  });
  const instance = createPetrinaut({ document: handle });
  const writableCallbacks = createPetrinautAiWritableCallbacks(instance);
  const applyMutation = async (
    toolName: WritableConstructionToolName,
    input: unknown,
  ): Promise<void> => {
    // Petrinaut's own input schema is the validation boundary for a headless call.
    const parsed = petrinautAiTools[toolName].inputSchema.parse(input);
    // The callback map is keyed by name, but TypeScript cannot correlate one
    // key with its own parameter across the union; the parse above establishes it.
    const callback = writableCallbacks[toolName] as (
      mutation: PetrinautAiToolInput<WritableConstructionToolName>,
    ) => unknown;
    await callback(parsed);
  };

  const execute = async (
    call: HeadlessPetrinautToolCall,
  ): Promise<HeadlessPetrinautToolResult> => {
    if (!isPetrinautConstructionToolName(call.toolName)) {
      return {
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        output: {
          applied: false,
          error: `Headless Petrinaut client does not allow ${call.toolName}`,
        },
      };
    }

    if (call.toolName === getLatestNetDefinitionToolName) {
      return {
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        output: {
          title,
          definition: instance.definition.get(),
          extensions: instance.extensions,
        },
      };
    }

    try {
      await applyMutation(call.toolName, call.input);
      return {
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        output: { applied: true },
      };
    } catch (error) {
      return {
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        output: { applied: false, error: errorMessageFrom(error) },
      };
    }
  };

  const definition = () => instance.definition.get();
  const document = () => ({ title, ...definition() });
  const parse = () => parseSDCPNFile(document());

  return {
    definition,
    document,
    execute,
    parse,
    revisionId: () => handle.revisionId.get(),
    dispose: instance.dispose,
  };
};

export type HeadlessPetrinautClient = ReturnType<
  typeof createHeadlessPetrinautClient
>;

export const isPetrinautConstructionToolName = (
  toolName: string,
): toolName is PetrinautConstructionToolName =>
  constructionToolNames.has(toolName);
