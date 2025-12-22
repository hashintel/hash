import type { Url } from "@blockprotocol/type-system";
import type { FlowActionActivity } from "@local/hash-backend-utils/flows";
import { isInferenceModelName } from "@local/hash-isomorphic-utils/ai-inference-types";
import {
  getSimplifiedAiFlowActionInputs,
  type OutputNameForAiFlowAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import { StatusCode } from "@local/status";
import dedent from "dedent";

import { getWebPageActivity } from "../get-web-page-activity.js";
import { getFlowContext } from "../shared/get-flow-context.js";
import { getLlmResponse } from "../shared/get-llm-response.js";
import { getTextContentFromLlmMessage } from "../shared/get-llm-response/llm-message.js";
import { graphApiClient } from "../shared/graph-api-client.js";
import { inferenceModelAliasToSpecificModel } from "../shared/inference-model-alias-to-llm-model.js";

const generateSummarizeWebPageSystemPrompt = (params: {
  numberOfSentences: number;
}): string =>
  dedent(`
    You are a Web Page Summarizer.
    The user provides you with the URL, the title, and the HTML content of a web page,
    and you must respond with a ${params.numberOfSentences} sentence summary of
    the contents of the web page. Describe what information the web page includes.
    Don't include any prefix, introduction, or other surrounding text – just the summary directly.

    Mention the types of entities that are described in the page, e.g.
    - 'The page mentions AI companies'
    - 'The page mentions people who do X'
    - 'The page mentions products relating to Y'
  `);

export const getWebPageSummaryAction: FlowActionActivity = async ({
  inputs,
}) => {
  const { url, model, numberOfSentences } = getSimplifiedAiFlowActionInputs({
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

  const webPage = await getWebPageActivity({
    url: url as Url,
    sanitizeForLlm: true,
  });
  if ("error" in webPage) {
    return {
      code: StatusCode.Unavailable,
      message: webPage.error,
      contents: [],
    };
  }

  const systemPrompt = generateSummarizeWebPageSystemPrompt({
    numberOfSentences: numberOfSentences!,
  });

  const { userAuthentication, flowEntityId, stepId, webId } =
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
              Text: ${webPage.innerText}
            `),
            },
          ],
        },
      ],
      model: inferenceModelAliasToSpecificModel[model],
    },
    {
      customMetadata: {
        stepId,
        taskName: "summarize-web-page",
      },
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
              "summary" satisfies OutputNameForAiFlowAction<"getWebPageSummary">,
            payload: {
              kind: "Text",
              value: summary,
            },
          },
          {
            outputName:
              "title" satisfies OutputNameForAiFlowAction<"getWebPageSummary">,
            payload: {
              kind: "Text",
              value: webPage.title,
            },
          },
        ],
      },
    ],
  };
};
