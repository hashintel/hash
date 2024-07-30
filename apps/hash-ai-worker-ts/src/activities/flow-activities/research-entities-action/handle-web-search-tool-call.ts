import {
  actionDefinitions,
  type InputNameForAction,
  type OutputNameForAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import type {
  StepInput,
  WebSearchResult,
} from "@local/hash-isomorphic-utils/flows/types";
import { StatusCode } from "@local/status";
import { Context } from "@temporalio/activity";

import { logProgress } from "../../shared/log-progress.js";
import { getWebPageSummaryAction } from "../get-web-page-summary-action.js";
import { webSearchAction } from "../web-search-action.js";
import type { CoordinatorToolCallArguments } from "./coordinator-tools.js";
import type { ResourceSummary } from "./types.js";

export const handleWebSearchToolCall = async (params: {
  input: CoordinatorToolCallArguments["webSearch"];
}): Promise<ResourceSummary[] | { error: string }> => {
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
    return {
      error: `Failed to perform web search: ${JSON.stringify(response)}`,
    };
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
      outputName ===
      ("webSearchResult" satisfies OutputNameForAction<"webSearch">),
  );

  if (!webPageUrlsOutput) {
    return {
      error: `No web page URLs output was found when calling "webSearch" for the query ${query}.`,
    };
  }

  const searchResults = webPageUrlsOutput.payload.value as WebSearchResult[];

  const webPageUrlsWithSummaries = (
    await Promise.all(
      searchResults.map(async (webPage) => {
        const { url, title } = webPage;

        const webPageSummaryResponse = await getWebPageSummaryAction({
          inputs: [
            {
              inputName:
                "url" satisfies InputNameForAction<"getWebPageSummary">,
              payload: { kind: "Text", value: url },
            },
            ...actionDefinitions.getWebPageSummary.inputs.flatMap<StepInput>(
              ({ name, default: defaultValue }) =>
                !defaultValue || name === "url"
                  ? []
                  : [{ inputName: name, payload: defaultValue }],
            ),
          ],
        });

        if (response.code !== StatusCode.Ok) {
          return {
            error: `An unexpected error occurred trying to summarize the web page at url ${url}.`,
          };
        }

        const responseContent = webPageSummaryResponse.contents[0];

        const webPageSummaryOutputs = responseContent?.outputs;

        const summaryOutput = webPageSummaryOutputs?.find(
          ({ outputName }) =>
            outputName ===
            ("summary" satisfies OutputNameForAction<"getWebPageSummary">),
        );

        if (!summaryOutput) {
          return {
            error: `An unexpected error occurred trying to summarize the web page at url ${url}.`,
          };
        }

        const summary = summaryOutput.payload.value as string;

        return {
          fromSearchQuery: query,
          title,
          url,
          summary,
        };
      }),
    )
  ).filter((result): result is ResourceSummary => !("error" in result));

  return webPageUrlsWithSummaries;
};
