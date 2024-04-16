/* eslint-disable */
// @ts-nocheck
/**
 * This file contains work done to experiment with LLM models from Anthropic.
 */
import dedent from "dedent";
import { AnthropicChatApi } from "llm-api";
import type { ZodTypeAny } from "zod";
import { z } from "zod";
import { chat } from "zod-gpt";

import type { ToolCall } from "./tools";
import { tools } from "./tools";

const anthropicClient = new AnthropicChatApi(
  {
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
  { model: "claude-3-opus-20240229" },
);

const schema = z.object({
  plan: z.array(z.string()),
  toolCalls: z.array(
    z.union(
      Object.values(tools).map((tool) =>
        z.object({
          toolId: z.literal(tool.toolId),
          inputs: z.array(
            z.union(
              tool.inputs.map(({ name, oneOfPayloadKinds }) =>
                z.object({
                  inputName: z.literal(name),
                  payload: z.object({
                    kind: z.enum(oneOfPayloadKinds as [string, ...string[]]),
                    value: z.any(),
                  }),
                }),
              ) as unknown as readonly [
                ZodTypeAny,
                ZodTypeAny,
                ...ZodTypeAny[],
              ],
            ),
          ),
        }),
      ) as unknown as readonly [ZodTypeAny, ZodTypeAny, ...ZodTypeAny[]],
    ),
  ),
});

/** @todo: figure out how to infer this from the `zod` type definition */
type CoordinatingAgentResponse = {
  plan: string[];
  toolCalls: ToolCall[];
};

export const callCoordinatingAgent = async (params: {
  prompt: string;
}): Promise<CoordinatingAgentResponse> => {
  const { prompt } = params;

  const systemMessage = dedent(`
    You are a coordinating agent for a research task.
    The user will provides you with a text prompt, from which you will be
      able to make the relevant function calls to progress towards 
      completing the task.
    You must completely satisfy the research prompt, without any missing information.
    Make as many tool calls as are required to progress towards completing the task.
    Note it may be necessary to tackle the task by composing it into multiple sub-tasks.
    Do not under any circumstances make a tool call which can only be executed in the future.
    Only make tool calls which can be made right now, based on the available information.
    You will receive a response for each tool call you make, and be able to make further tool calls after that.
    Here is a description of the available tools you can call:
      ${Object.values(tools)
        .map(({ toolId, description }) => `- ${toolId}: ${description}`)
        .join("\n")}

    Alongside the \`toolCalls\`, you must also provide a \`plan\` which which is a list of natural language steps that you plan to take to complete the task.
  `);

  const response = await chat(
    anthropicClient,
    [
      {
        role: "system",
        content: systemMessage,
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    {
      schema,
    },
  );

  return response.data;
};
