import { isInferenceModelName } from "@local/hash-isomorphic-utils/ai-inference-types";
import {
  getSimplifiedActionInputs,
  type OutputNameForAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import { StatusCode } from "@local/status";
import dedent from "dedent";

import { getWebPageActivity } from "../get-web-page-activity";
import { getFlowContext } from "../shared/get-flow-context";
import { getLlmResponse } from "../shared/get-llm-response";
import { getTextContentFromLlmMessage } from "../shared/get-llm-response/llm-message";
import { modelAliasToSpecificModel } from "../shared/openai-client";
import type { FlowActionActivity } from "./types";

const generateSummarizeWebPageSystemPrompt = (params: {
  numberOfSentences: number;
}): string =>
  dedent(`
    You are a Web Page Summarizer.
    The user provides you with the URL, the title, and the text content of a web page,
    and you must respond with a ${params.numberOfSentences} sentence summary of 
    the web page.
  `);

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

  const systemPrompt = generateSummarizeWebPageSystemPrompt({
    numberOfSentences: numberOfSentences!,
  });

  const { userAuthentication, graphApiClient, flowEntityId, webId } =
    await getFlowContext();

  const llmResponse = await getLlmResponse(
    {
      systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: dedent(`
              URL: ${url}
              Title: ${webPage.title}
              Text: ${webPage.textContent} 
            `),
            },
          ],
        },
      ],
      model: modelAliasToSpecificModel[model],
    },
    {
      userAccountId: userAuthentication.actorId,
      graphApiClient,
      incurredInEntities: [{ entityId: flowEntityId }],
      webId,
    },
  );

  if (llmResponse.status !== "ok") {
    return {
      code: StatusCode.Internal,
      contents: [],
    };
  }

  const { message } = llmResponse;

  const summary = getTextContentFromLlmMessage({ message });

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
