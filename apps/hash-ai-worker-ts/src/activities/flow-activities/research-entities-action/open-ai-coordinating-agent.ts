import type {
  InputDefinition,
  Payload,
  PayloadKind,
  ProposedEntity,
  StepInput,
} from "@local/hash-isomorphic-utils/flows/types";
import { StatusCode } from "@local/status";
import dedent from "dedent";
import type { JSONSchema } from "openai/lib/jsonschema";
import type {
  ChatCompletionCreateParams,
  ChatCompletionMessage,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionToolMessageParam,
  FunctionDefinition,
} from "openai/resources";

import { modelAliasToSpecificModel } from "../../infer-entities";
import { getOpenAiResponse } from "../../infer-entities/shared/get-open-ai-response";
import type {
  CompletedCoordinatorToolCall,
  CoordinatorToolCall,
} from "./coordinator-tools";
import {
  coordinatorToolDefinitions,
  isCoordinatorToolId,
} from "./coordinator-tools";

const _mapInputDefinitionsToJSONSchema = (
  inputDefinitions: InputDefinition[],
): JSONSchema => ({
  type: "object",
  properties: inputDefinitions.reduce(
    (acc, inputDefinition) => {
      const oneOf: JSONSchema["oneOf"] = inputDefinition.oneOfPayloadKinds
        .map((payloadKind) => {
          let valueType: string;
          if (payloadKind === "Text") {
            valueType = "string";
          } else if (payloadKind === "Number") {
            valueType = "number";
          } else if (payloadKind === "VersionedUrl") {
            valueType = "string";
          } else {
            /** @todo: support more input payload kinds */
            return [];
          }

          return {
            type: "object",
            properties: {
              kind: { type: "string", enum: [payloadKind] },
              value: { type: valueType },
            },
            required: ["kind", "value"],
          } satisfies JSONSchema;
        })
        .flat();

      acc[inputDefinition.name] = {
        ...(inputDefinition.array
          ? {
              type: "array",
              items: {
                oneOf,
              },
            }
          : { oneOf }),
        description: inputDefinition.description,
      };

      return acc;
    },
    {} as NonNullable<JSONSchema["properties"]>,
  ),
  required: inputDefinitions
    .filter((inputDefinition) => inputDefinition.required)
    .map((inputDefinition) => inputDefinition.name),
});

export const parseOpenAiFunctionArguments = <
  T extends Record<string, object>,
>(params: {
  stringifiedArguments: string;
}) => {
  const { stringifiedArguments } = params;

  return JSON.parse(stringifiedArguments) as T;
};

export const mapOpenAiFunctionArgumentsToStepInputs = (params: {
  stringifiedArguments: ChatCompletionMessageToolCall.Function["arguments"];
}): StepInput[] => {
  const { stringifiedArguments } = params;

  const parsedFunctionArguments = parseOpenAiFunctionArguments<{
    [key: string]: {
      kind: PayloadKind;
      value: unknown;
    };
  }>({ stringifiedArguments });

  return Object.entries(parsedFunctionArguments).map(
    ([inputName, { kind, value }]) => {
      const payload: Payload = {
        kind: `${kind[0]?.toUpperCase()}${kind.slice(1).toLowerCase()}`,
        value,
      } as Payload;

      return {
        inputName,
        payload,
      };
    },
  );
};

export const coordinatingAgentGetNextToolCalls = async (params: {
  submittedProposedEntities: (ProposedEntity & { localId: string })[];
  previousCalls?: {
    openAiAssistantMessageContent: string | null;
    completedToolCalls: CompletedCoordinatorToolCall[];
  }[];
  prompt: string;
}): Promise<{
  openAiAssistantMessageContent: string | null;
  toolCalls: CoordinatorToolCall[];
}> => {
  const { prompt, previousCalls, submittedProposedEntities } = params;

  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: dedent(`
        You are a coordinating agent for a research task.
        The user will provides you with a text prompt, from which you will be
          able to make the relevant function calls to progress towards 
          completing the task.
        Make as many tool calls as are required to progress towards completing the task.
        You must completely satisfy the research prompt, without any missing information.
        Alongside the function calls, explain what your plan is to complete the task
        and what each function call is doing towards completing the task.
        You may revised this plan as you receive more information from function calls.
        ${
          submittedProposedEntities.length > 0
            ? dedent(`
              You have previously submitted the following proposed entities:
              ${JSON.stringify(submittedProposedEntities, null, 2)}

              If the submitted entities satisfy the research prompt, call the "complete" tool.
            `)
            : "You have not previously submitted any proposed entities."
        }
      `),
    },
    {
      role: "user",
      content: prompt,
    },
    ...(previousCalls?.flatMap<ChatCompletionMessageParam>(
      ({ openAiAssistantMessageContent, completedToolCalls }) =>
        completedToolCalls.length > 0
          ? [
              {
                role: "assistant",
                content: openAiAssistantMessageContent,
                tool_calls: completedToolCalls.map(
                  ({ openAiToolCall }) => openAiToolCall,
                ),
              } satisfies ChatCompletionMessage,
              ...completedToolCalls.map<ChatCompletionToolMessageParam>(
                (completedToolCall) => ({
                  role: "tool",
                  tool_call_id: completedToolCall.openAiToolCall.id,
                  content: dedent(`
              The output fo the tool call is:
              ${completedToolCall.output}
            `),
                }),
              ),
            ]
          : [],
    ) ?? []),
  ];

  const openApiPayload: ChatCompletionCreateParams = {
    messages,
    model: modelAliasToSpecificModel["gpt-4-turbo"],
    tools: Object.values(coordinatorToolDefinitions).map(
      ({ toolId, description, inputSchema }) =>
        ({
          function: {
            name: toolId,
            description,
            parameters: inputSchema as FunctionDefinition["parameters"],
          },
          type: "function",
        }) as const,
    ),
  };

  const openAiResponse = await getOpenAiResponse(openApiPayload);

  if (openAiResponse.code !== StatusCode.Ok) {
    throw new Error(
      `Failed to get OpenAI response: ${JSON.stringify(openAiResponse)}`,
    );
  }

  const { response, usage: _usage } = openAiResponse.contents[0]!;

  /** @todo: capture usage */

  const openAiToolCalls = response.message.tool_calls;

  const openAiAssistantMessageContent = response.message.content;

  if (!openAiToolCalls) {
    /** @todo: retry this instead */
    throw new Error(
      `Expected tool calls in response: ${JSON.stringify(response)}`,
    );
  }

  const coordinatorToolCalls = openAiToolCalls.map<CoordinatorToolCall>(
    (openAiToolCall) => {
      if (isCoordinatorToolId(openAiToolCall.function.name)) {
        return {
          toolId: openAiToolCall.function.name,
          openAiToolCall,
          parsedArguments: parseOpenAiFunctionArguments({
            stringifiedArguments: openAiToolCall.function.arguments,
          }),
        };
      }

      throw new Error(`Unexpected tool call: ${openAiToolCall.function.name}`);
    },
  );

  return {
    openAiAssistantMessageContent,
    toolCalls: coordinatorToolCalls,
  };
};
