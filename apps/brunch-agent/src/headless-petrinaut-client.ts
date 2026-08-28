import {
  createJsonDocHandle,
  createPetrinaut,
  parseSDCPNFile,
} from "@hashintel/petrinaut-core";
import {
  createPetrinautAiWritableCallbacks,
  getLatestNetDefinitionToolName,
} from "@hashintel/petrinaut-core/ai";

import {
  PETRINAUT_CONSTRUCTION_TOOL_NAMES,
  type PetrinautConstructionToolName,
} from "./tools/petrinaut-construction.ts";

import type { Petrinaut } from "@hashintel/petrinaut-core";

export interface HeadlessPetrinautToolCall {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly input: unknown;
}

export interface HeadlessPetrinautToolResult {
  readonly toolCallId: string;
  readonly toolName: string;
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
}

const constructionToolNames = new Set<string>(
  PETRINAUT_CONSTRUCTION_TOOL_NAMES,
);

const errorMessageFrom = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const createHeadlessPetrinautClient = (title: string) => {
  const handle = createJsonDocHandle({
    initial: {
      places: [],
      transitions: [],
      types: [],
      parameters: [],
      differentialEquations: [],
    },
  });
  const instance = createPetrinaut({ document: handle });
  const writableCallbacks = createPetrinautAiWritableCallbacks(
    instance,
  ) as unknown as Record<string, (input: unknown) => unknown>;

  const execute = async (
    call: HeadlessPetrinautToolCall,
  ): Promise<HeadlessPetrinautToolResult> => {
    if (!constructionToolNames.has(call.toolName)) {
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

    const callback = writableCallbacks[call.toolName];
    if (callback === undefined) {
      return {
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        output: {
          applied: false,
          error: `Petrinaut has no writable callback for ${call.toolName}`,
        },
      };
    }

    try {
      await callback(call.input);
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
