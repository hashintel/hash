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
  ChatCompletionTool,
  ChatCompletionToolMessageParam,
  FunctionDefinition,
} from "openai/resources";

import { modelAliasToSpecificModel } from "../../infer-entities";
import { getOpenAiResponse } from "../../infer-entities/shared/get-open-ai-response";
import type {
  CompletedCoordinatorToolCall,
  CoordinatorToolCall,
  ToolDefinition,
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

const mapToolDefinitionToOpenAiTool = ({
  toolId,
  description,
  inputSchema,
}: ToolDefinition): ChatCompletionTool =>
  ({
    function: {
      name: toolId,
      description,
      parameters: inputSchema as FunctionDefinition["parameters"],
    },
    type: "function",
  }) as const;

const getNextToolCalls = async (params: {
  submittedProposedEntities: (ProposedEntity & { localId: string })[];
  previousPlan: string;
  previousCalls?: {
    completedToolCalls: CompletedCoordinatorToolCall[];
  }[];
  prompt: string;
}): Promise<{
  toolCalls: CoordinatorToolCall[];
}> => {
  const { prompt, previousCalls, submittedProposedEntities, previousPlan } =
    params;

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

        ${
          submittedProposedEntities.length > 0
            ? dedent(`
              You have previously submitted the following proposed entities:
              ${JSON.stringify(submittedProposedEntities, null, 2)}

              If the submitted entities satisfy the research prompt, call the "complete" tool.
            `)
            : "You have not previously submitted any proposed entities."
        }

        You have previously proposed the following plan:
        ${previousPlan}
        If you want to deviate from this plan, update it using the "updatePlan" tool.
        You must call the "updatePlan" tool alongside other tool calls to progress towards completing the task.
      `),
    },
    {
      role: "user",
      content: prompt,
    },
    ...(previousCalls?.flatMap<ChatCompletionMessageParam>(
      ({ completedToolCalls }) =>
        completedToolCalls.length > 0
          ? [
              {
                role: "assistant",
                content: null,
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
      mapToolDefinitionToOpenAiTool,
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
    toolCalls: coordinatorToolCalls,
  };
};

const createInitialPlan = async (params: {
  prompt: string;
}): Promise<{ plan: string }> => {
  const { prompt } = params;

  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: dedent(`
        You are a coordinating agent for a research task.
        The user will provides you with a text prompt, from which you will be
          able to make the relevant function calls to progress towards 
          completing the task.
        You must completely satisfy the research prompt, without any missing information.

        Do not make *any* tool calls. You must first provide a plan of how you will use
          the tools to progress towards completing the task.
        This should be a list of steps in plain English.
      `),
    },
    {
      role: "user",
      content: prompt,
    },
  ];

  const openApiPayload: ChatCompletionCreateParams = {
    messages,
    model: modelAliasToSpecificModel["gpt-4-turbo"],
    tools: Object.values(coordinatorToolDefinitions)
      .filter(({ toolId }) => toolId !== "updatePlan")
      .map(mapToolDefinitionToOpenAiTool),
  };

  const openAiResponse = await getOpenAiResponse(openApiPayload);

  if (openAiResponse.code !== StatusCode.Ok) {
    throw new Error(
      `Failed to get OpenAI response: ${JSON.stringify(openAiResponse)}`,
    );
  }

  const { response, usage: _usage } = openAiResponse.contents[0]!;

  /** @todo: capture usage */

  const openAiAssistantMessageContent = response.message.content;

  if (!openAiAssistantMessageContent) {
    throw new Error(
      `Expected message content in response: ${JSON.stringify(response, null, 2)}`,
    );
  }

  return {
    plan: openAiAssistantMessageContent,
  };
};

export const coordinatingAgent = {
  createInitialPlan,
  getNextToolCalls,
};
