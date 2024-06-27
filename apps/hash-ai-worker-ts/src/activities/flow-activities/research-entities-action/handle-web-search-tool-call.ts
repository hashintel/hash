import {
  actionDefinitions,
  type InputNameForAction,
  type OutputNameForAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import type { StepInput } from "@local/hash-isomorphic-utils/flows/types";
import { StatusCode } from "@local/status";
import { Context } from "@temporalio/activity";

import { logProgress } from "../../shared/log-progress";
import { getWebPageSummaryAction } from "../get-web-page-summary-action";
import { webSearchAction } from "../web-search-action";
import type { CoordinatorToolCallArguments } from "./coordinator-tools";

export const handleWebSearchToolCall = async (params: {
  input: CoordinatorToolCallArguments["webSearch"];
}): Promise<{ output: string }> => {
  const { query, explanation } = params.input;

  const response = await webSearchAction({
    inputs: [
      {
        inputName: "query" satisfies InputNameForAction<"webSearch">,
        payload: { kind: "Text", value: query },
      },
      {
        inputName:
          "numberOfSearchResults" satisfies InputNameForAction<"webSearch">,
        payload: { kind: "Number", value: 5 },
      },
    ],
  });

  if (response.code !== StatusCode.Ok) {
    throw new Error(
      `Failed to perform web search: ${JSON.stringify(response)}`,
    );
  }

  logProgress([
    {
      type: "QueriedWeb",
      query,
      recordedAt: new Date().toISOString(),
      stepId: Context.current().info.activityId,
      explanation,
    },
  ]);

  const { outputs: webSearchOutputs } = response.contents[0]!;

  const webPageUrlsOutput = webSearchOutputs.find(
    ({ outputName }) =>
      outputName === ("webPageUrls" satisfies OutputNameForAction<"webSearch">),
  );

  if (!webPageUrlsOutput) {
    throw new Error(
      `No web page URLs output was found when calling "webSearch" for the query ${query}.`,
    );
  }

  const webPageUrls = webPageUrlsOutput.payload.value as string[];

  const webPageUrlsWithSummaries = await Promise.all(
    webPageUrls.map(async (webPageUrl) => {
      const webPageSummaryResponse = await getWebPageSummaryAction({
        inputs: [
          {
            inputName: "url" satisfies InputNameForAction<"getWebPageSummary">,
            payload: { kind: "Text", value: webPageUrl },
          },
          ...actionDefinitions.getWebPageSummary.inputs.flatMap<StepInput>(
            ({ name, default: defaultValue }) =>
              !defaultValue || name === "url"
                ? []
                : [{ inputName: name, payload: defaultValue }],
          ),
        ],
      });

      /**
       * @todo: potential optimization, if the content of the web page cannot be accessed it probably
       * isn't relevant to provide as a search result for the agent. We could consider filtering these
       * out, and instead returning additional other web search results.
       */
      if (response.code !== StatusCode.Ok) {
        return {
          webPageUrl,
          summary: `An unexpected error occurred trying to summarize the web page at url ${webPageUrl}.`,
        };
      }

      const { outputs: webPageSummaryOutputs } =
        webPageSummaryResponse.contents[0]!;

      const summaryOutput = webPageSummaryOutputs.find(
        ({ outputName }) =>
          outputName ===
          ("summary" satisfies OutputNameForAction<"getWebPageSummary">),
      );

      if (!summaryOutput) {
        throw new Error(
          `No summary output was found when calling "getSummariesOfWebPages" for the web page at url ${webPageUrl}.`,
        );
      }

      const summary = summaryOutput.payload.value as string;

      return {
        webPageUrl,
        summary,
      };
    }),
  );

  return {
    output: webPageUrlsWithSummaries
      .map(
        ({ webPageUrl, summary }, index) => `
-------------------- SEARCH RESULT ${index + 1} --------------------
URL: ${webPageUrl}
Summary: ${summary}`,
      )
      .join("\n"),
  };
};
