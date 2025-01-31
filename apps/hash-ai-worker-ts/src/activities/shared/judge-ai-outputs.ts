import type { JsonValue } from "@blockprotocol/graph/types/entity";

import { getFlowContext } from "./get-flow-context.js";
import { getLlmResponse } from "./get-llm-response.js";
import { isPermittedGoogleAiModel } from "./get-llm-response/google-vertex-ai-client.js";
import {
  getToolCallsFromLlmAssistantMessage,
  type LlmUserMessage,
} from "./get-llm-response/llm-message.js";
import type { LlmParams, LlmToolDefinition } from "./get-llm-response/types.js";
import { graphApiClient } from "./graph-api-client.js";
import { judgeTestData } from "./judge-ai-output.optimize.ai.test.js";

type ExchangeToReview = Pick<LlmParams, "messages" | "tools" | "systemPrompt">;

type JudgeAiOutputsParams = {
  exchangeToReview: ExchangeToReview;
  judgeModel: LlmParams["model"];
  judgeAdditionalInstructions?: string;
};

type JudgeCorrection = {
  jsonPath: string[];
  mistakeType: "missed" | "incorrect";
  correctValue: JsonValue;
};

type JudgeVerdict = {
  score: number;
  feedback: string;
  corrections: JudgeCorrection[];
};

const judgeSystemPrompt = `# Task
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

# General feedback

You provide general feedback on the AI's answer. Consider primarily whether it is correct and complete.

You also provide a score out of 10. Please use whole numbers only.
`;

const generateJudgePrompt = ({
  exchangeToReview,
  judgeAdditionalInstructions,
}: Pick<
  JudgeAiOutputsParams,
  "exchangeToReview" | "judgeAdditionalInstructions"
>): LlmUserMessage => {
  let judgePrompt = `Please review the following exchange between a user and an AI and issue corrections, provide feedback, and a score out of 10.\n`;

  const { messages, tools, systemPrompt } = exchangeToReview;

  if (systemPrompt) {
    judgePrompt += `<SystemPrompt>The AI was provided with the following pre-task instructions: ${systemPrompt}</SystemPrompt>\n`;
  }

  if (tools?.length) {
    judgePrompt += `<Tools>The AI was provided with the following tools:\n${tools.map((tool) => `<Tool>${JSON.stringify(tool)}</Tool>`).join("\n\n")}</Tools>`;
  }

  judgePrompt += `<Messages>The following is the exchange between a user and the AI, finishing with the AI's response which you are judging:
${messages.map((message) => `<${message.role === "user" ? "User" : "AI"}Message>${JSON.stringify(message)}</${message.role === "user" ? "User" : "AI"}Message>`).join("\n")}\n</Messages>`;

  if (judgeAdditionalInstructions) {
    judgePrompt += `\n\n${judgeAdditionalInstructions}`;
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
            jsonPath: { type: "array", items: { type: "string" } },
            mistakeType: { enum: ["missed", "incorrect"] },
            correctValue: {
              type: ["string", "number", "boolean", "null", "array", "object"],
            },
          },
          required: ["jsonPath", "mistakeType", "correctValue"],
          additionalProperties: false,
        },
      },
    },
    required: ["score", "feedback", "corrections"],
    additionalProperties: false,
  },
};

export const judgeAiOutputs = async ({
  exchangeToReview,
  judgeModel,
  judgeAdditionalInstructions,
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

  const { flowEntityId, stepId, userAuthentication, webId } =
    await getFlowContext();

  const judgeResponse = await getLlmResponse(
    {
      messages: [judgePrompt],
      model: judgeModel,
      systemPrompt: judgeSystemPrompt,
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
    throw new Error("No tool call found");
  }

  return toolCall.input as JudgeVerdict;
};

console.log(
  JSON.stringify(
    await judgeAiOutputs({
      exchangeToReview: judgeTestData,
      judgeModel: "gemini-1.5-pro-002",
    }),
  ),
);
