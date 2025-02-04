import type { JsonValue } from "@blockprotocol/graph/types/entity";
import get from "lodash/get.js";

import { logger } from "./activity-logger.js";
import { getFlowContext } from "./get-flow-context.js";
import { getLlmResponse } from "./get-llm-response.js";
import { isPermittedGoogleAiModel } from "./get-llm-response/google-vertex-ai-client.js";
import {
  getToolCallsFromLlmAssistantMessage,
  type LlmUserMessage,
} from "./get-llm-response/llm-message.js";
import type { LlmParams, LlmToolDefinition } from "./get-llm-response/types.js";
import { graphApiClient } from "./graph-api-client.js";

type ExchangeToReview = Required<Pick<LlmParams, "messages" | "tools">> &
  Pick<LlmParams, "systemPrompt">;

type JudgeAiOutputsParams = {
  exchangeToReview: ExchangeToReview;
  previousErrors?: string[];
  judgeModel: LlmParams["model"];
  judgeAdditionalInstructions?: string;
  /**
   * Optional parameters for optimization purposes, allowing to overwrite the system prompt and model used.
   */
  testingParams?: {
    systemPrompt: string;
  };
};

export type JudgeCorrection = {
  reasoning: string;
  jsonPath: string[];
  correctionType: "correct-missing" | "correct-incorrect" | "delete-unfounded";
  correctValue?: JsonValue;
};

type JudgeVerdict = {
  score: number;
  feedback: string;
  corrections: JudgeCorrection[];
};

const correctionTypeDescriptions = `The types of correction you may issue:
- "correct-missing": The AI missed a value that can be inferred from the context. You provide the correct value. Do NOT use this if the AI has provided a value that is incorrect – use "correct-incorrect" instead.
- "correct-incorrect": The AI provided a value that is incorrect based on the context. You provide the correct value. Do NOT use this if the AI has missed a value – use "correct-missing" instead.
- "delete-unfounded": The AI provided a value for a field that cannot be inferred from the context. You do not provide a correct value, as one cannot be determined.`;

export const judgeSystemPrompt = `# Task
You are an expert reviewer judging the accuracy and completeness of an AI model's outputs. 

You consider a conversation between a user and an AI model, along with any special instructions and/or tools the AI was provided with.

You provide an overall score out of 10 on the AI's answer, along with general feedback, and any specific corrections that need to be made.

The AI's answer should be based on the information provided by the user only, including content of the user's messages and any files the user has provided.

# Correcting AI Outputs

The AI may provide a response that includes information which is NOT in the user's messages or files – you should issue corrections for these.
The AI may also FAIL to provide information that is in the user's messages or files – you should issue corrections for these.

When issuing a correction, you specify the JSON path to the value that is incorrect or missing from the AI's response,
where the path represents its position in the JSON structure of the AI's repsonse.

For example, if the AI's response is:

{
  "name": "John Doe",
  "age": 30,
  "address": {
    "street": "123 Main St",
    "city": "Anytown",
    "state": "CA"
  }
}

The JSON path to the city value is ["address", "city"].

If the AI's response is missing the city value, the JSON path is ["address", "state"].

Array indices are numbered starting from 0. For example, if the AI's response is:

{
role: "assistant",
content: [
{
  "name": "John Doe",
  "age": 30,
  "addresses": [
    {
      "street": "123 Main St",
      "city": "Anytown",
      "state": "CA"
    },
    {
      "street": "456 Main St",
      "city": "Anytown",
      "state": "CA"
    }
  ]
}

The JSON path to the second address is ["addresses", "1"].

${correctionTypeDescriptions}

Be very sure that your corrections are accurate! Think it through and provide the 'reasoning' for each of your corrections.
If in doubt, don't issue a correction.

# General feedback

You provide general feedback on the AI's answer. Consider primarily whether it is correct and complete.

You also provide a score out of 10. Please use whole numbers only.
`;

const generateJudgePrompt = ({
  exchangeToReview,
  judgeAdditionalInstructions,
  previousErrors,
}: Pick<
  JudgeAiOutputsParams,
  "exchangeToReview" | "judgeAdditionalInstructions" | "previousErrors"
>): LlmUserMessage => {
  let judgePrompt = `Please review the following exchange between a user and an AI and issue corrections, provide feedback, and a score out of 10.\n`;

  const { messages, tools, systemPrompt } = exchangeToReview;

  const previousMessages = messages.slice(0, -1);
  const lastMessage = messages.at(-1);

  if (!lastMessage) {
    throw new Error("No AI message found");
  }

  if (!lastMessage.content[0]) {
    throw new Error("No content found in the AI's final response");
  }

  if (lastMessage.content[0].type !== "tool_use") {
    throw new Error(
      "AI's final response is not a tool use. The judge is currently only designed to correct oversights in function calls.",
    );
  }

  const examplePath = `[
    "content",
    "0",
    "input",
    ${Object.keys(lastMessage.content[0].input)[0]},
  ]`;

  if (systemPrompt) {
    judgePrompt += `<SystemPrompt>The AI was provided with the following pre-task instructions: ${systemPrompt}</SystemPrompt>\n`;
  }

  if (tools.length) {
    judgePrompt += `<Tools>The AI was provided with the following tools:\n${tools.map((tool) => `<Tool>${JSON.stringify(tool)}</Tool>`).join("\n\n")}</Tools>`;
  }

  judgePrompt += `<Messages>These were the earlier messages leading up to the AI's final response:
${previousMessages.map((message) => `<${message.role === "user" ? "User" : "AI"}Message>${JSON.stringify(message)}</${message.role === "user" ? "User" : "AI"}Message>`).join("\n")}\n</Messages>`;

  judgePrompt += `<AiMessageToJudge>
${JSON.stringify(lastMessage)}</AiMessageToJudge>

Remember that any JSON path you provide must be a valid path in the JSON structure of the AI's response.
e.g. it might start with ${examplePath};

${correctionTypeDescriptions}
`;

  if (judgeAdditionalInstructions) {
    judgePrompt += `\n\n${judgeAdditionalInstructions}`;
  }

  if (previousErrors?.length) {
    judgePrompt += `\n\nYou previously made an assessment, but the following discrepancies in your response were found:
${previousErrors.map((error) => `<Error>${error}</Error>`).join("\n")}`;
  }

  return {
    role: "user",
    content: [{ type: "text", text: judgePrompt }],
  };
};

const judgeTool: LlmToolDefinition = {
  name: "submitAssessment",
  description: "Submit an assessment of the AI's outputs",
  inputSchema: {
    type: "object",
    properties: {
      score: { type: "number" },
      feedback: { type: "string" },
      corrections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            reasoning: { type: "string" },
            jsonPath: { type: "array", items: { type: "string" } },
            correctionType: {
              type: "string",
              enum: [
                "correct-missing",
                "correct-incorrect",
                "delete-unfounded",
              ],
            },
            correctValue: {
              anyOf: [
                { type: "string" },
                { type: "number" },
                { type: "boolean" },
                { type: "array" },
                { type: "object" },
              ],
            },
          },
          required: ["jsonPath", "correctionType", "correctValue"],
          additionalProperties: false,
        },
      },
    },
    required: ["score", "feedback", "corrections"],
    additionalProperties: false,
  },
};

const isJudgeVerdict = (value: unknown): value is JudgeVerdict => {
  return (
    typeof value === "object" &&
    value !== null &&
    "score" in value &&
    "feedback" in value &&
    "corrections" in value
  );
};

export const judgeAiOutputs = async ({
  exchangeToReview,
  judgeModel,
  judgeAdditionalInstructions,
  testingParams,
}: JudgeAiOutputsParams): Promise<JudgeVerdict> => {
  const fileMessages = exchangeToReview.messages.flatMap((message) =>
    message.content.filter((content) => content.type === "file"),
  );

  const judgePrompt = generateJudgePrompt({
    exchangeToReview,
    judgeAdditionalInstructions,
  });

  if (fileMessages.length > 0) {
    if (!isPermittedGoogleAiModel(judgeModel)) {
      throw new Error(
        "Judge must be Google AI model in order to provide files to it.",
      );
    }

    judgePrompt.content.push(...fileMessages);
  }

  const lastAiMessage = exchangeToReview.messages.at(-1);

  if (!lastAiMessage) {
    throw new Error("No AI message found");
  }

  if (lastAiMessage.role !== "assistant") {
    throw new Error("Last message must be from the AI");
  }

  const { flowEntityId, stepId, userAuthentication, webId } =
    await getFlowContext();

  const judgeResponse = await getLlmResponse(
    {
      messages: [judgePrompt],
      model: judgeModel,
      systemPrompt: testingParams?.systemPrompt ?? judgeSystemPrompt,
      tools: [judgeTool],
    },
    {
      customMetadata: {
        taskName: "judge-ai-outputs",
        stepId,
      },
      graphApiClient,
      incurredInEntities: [{ entityId: flowEntityId }],
      userAccountId: userAuthentication.actorId,
      webId,
    },
  );

  if (judgeResponse.status !== "ok") {
    throw new Error(
      `Judging AI outputs failed: ${
        judgeResponse.status === "aborted"
          ? "aborted"
          : judgeResponse.status === "api-error"
            ? judgeResponse.message
            : judgeResponse.status
      }`,
    );
  }

  const toolCalls = getToolCallsFromLlmAssistantMessage({
    message: judgeResponse.message,
  });

  const toolCall = toolCalls[0];

  if (!toolCall) {
    logger.error("No tool call found in judge-ai-outputs response");
    return judgeAiOutputs({
      exchangeToReview,
      judgeModel,
      judgeAdditionalInstructions,
      testingParams,
      previousErrors: ["No tool call was found in your response"],
    });
  }

  if (!isJudgeVerdict(toolCall.input)) {
    logger.error("Tool call input is not a valid judge verdict");
    return judgeAiOutputs({
      exchangeToReview,
      judgeModel,
      judgeAdditionalInstructions,
      testingParams,
      previousErrors: [
        "Your response should contain all of 'score', 'feedback', and 'corrections'. 'Corrections' can be an empty array.",
      ],
    });
  }

  const errors: string[] = [];
  for (const correction of toolCall.input.corrections) {
    const existingValue = get(lastAiMessage, correction.jsonPath) as
      | JsonValue
      | undefined;

    if (
      correction.correctionType !== "correct-missing" &&
      existingValue === undefined
    ) {
      errors.push(
        `You provided a correction of type ${correction.correctionType} at path ${correction.jsonPath.join(
          ".",
        )} but there is no value at that path. Value must exist to be corrected or deleted. If you are providing a value that was missed, used the 'correct-missing' correction type.`,
      );
    } else if (
      correction.correctionType === "correct-missing" &&
      existingValue !== undefined
    ) {
      errors.push(
        `You provided a correction of type ${correction.correctionType} at path ${correction.jsonPath.join(
          ".",
        )} but there is a value at that path. To correct a value that is present but incorrect, used the 'correct-incorrect' correction type.`,
      );
    }
  }

  if (errors.length) {
    logger.error(`Errors in judge-ai-outputs: ${errors.join("\n")}`);
    return judgeAiOutputs({
      exchangeToReview,
      judgeModel,
      judgeAdditionalInstructions,
      testingParams,
      previousErrors: errors,
    });
  }

  return toolCall.input;
};
