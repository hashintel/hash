import { isInferenceModelName } from "@local/hash-isomorphic-utils/ai-inference-types";
import {
  getSimplifiedActionInputs,
  type OutputNameForAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import { StatusCode } from "@local/status";
import dedent from "dedent";
import type { ChatCompletionSystemMessageParam } from "openai/resources";

import { getWebPageActivity } from "../get-web-page-activity";
import { getLlmResponse } from "../shared/get-llm-response";
import { modelAliasToSpecificModel } from "../shared/openai-client";
import type { FlowActionActivity } from "./types";

const generateSummarizeWebPageSystemMessage = (params: {
  numberOfSentences: number;
}): ChatCompletionSystemMessageParam => ({
  role: "system",
  content: dedent(`
    You are a Web Page Summarizer.
    The user provides you with the URL, the title, and the text content of a web page,
    and you must respond with a ${params.numberOfSentences} sentence summary of 
    the web page.
  `),
});

export const getWebPageSummaryAction: FlowActionActivity = async ({
  inputs,
}) => {
  const { url, model, numberOfSentences } = getSimplifiedActionInputs({
    inputs,
    actionType: "getWebPageSummary",
  });

  if (!isInferenceModelName(model!)) {
    return {
      code: StatusCode.InvalidArgument,
      message: `Invalid inference model name: ${model}`,
      contents: [],
    };
  }

  const webPage = await getWebPageActivity({ url });

  const systemPrompt = generateSummarizeWebPageSystemMessage({
    numberOfSentences: numberOfSentences!,
  });

  const llmResponse = await getLlmResponse({
    messages: [
      systemPrompt,
      {
        role: "user",
        content: dedent(`
          URL: ${url}
          Title: ${webPage.title}
          Text: ${webPage.textContent} 
        `),
      },
    ],
    model: modelAliasToSpecificModel[model],
  });

  if (llmResponse.status !== "ok") {
    return {
      code: StatusCode.Internal,
      contents: [],
    };
  }

  const { choices } = llmResponse;

  const { message } = choices[0];

  const summary = message.content;

  if (!summary) {
    return {
      code: StatusCode.Internal,
      message: "No summary generated",
      contents: [],
    };
  }

  return {
    code: StatusCode.Ok,
    contents: [
      {
        outputs: [
          {
            outputName:
              "summary" satisfies OutputNameForAction<"getWebPageSummary">,
            payload: {
              kind: "Text",
              value: summary,
            },
          },
        ],
      },
    ],
  };
};
