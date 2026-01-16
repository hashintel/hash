import type { Url } from "@blockprotocol/type-system";
import type { AiFlowActionActivity } from "@local/hash-backend-utils/flows";
import { internalApiClient } from "@local/hash-backend-utils/internal-api-client";
import { getSimplifiedAiFlowActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import type { GetWebSearchResults200ResponseWebSearchResultsInner } from "@local/internal-api-client";
import { StatusCode } from "@local/status";
import { backOff } from "exponential-backoff";

export type GetWebSearchResultsResponse = Omit<
  GetWebSearchResults200ResponseWebSearchResultsInner,
  "url"
> & {
  url: Url;
};

const mapWebSearchResults = (
  webSearchResults: GetWebSearchResults200ResponseWebSearchResultsInner[],
): GetWebSearchResultsResponse[] =>
  webSearchResults.map(
    (webSearchResult) => webSearchResult as GetWebSearchResultsResponse,
  );

export const webSearchAction: AiFlowActionActivity<"webSearch"> = async ({
  inputs,
}) => {
  const { query, numberOfSearchResults } = getSimplifiedAiFlowActionInputs({
    inputs,
    actionType: "webSearch",
  });

  const {
    data: { webSearchResults },
  } = await backOff(() => internalApiClient.getWebSearchResults(query), {
    jitter: "full",
    numOfAttempts: 3,
    startingDelay: 1_000,
  });

  const webPages = webSearchResults.slice(0, numberOfSearchResults);

  return {
    code: StatusCode.Ok,
    contents: [
      {
        outputs: [
          {
            outputName: "webSearchResult",
            payload: {
              kind: "WebSearchResult",
              value: mapWebSearchResults(webPages),
            },
          },
        ],
      },
    ],
  };
};
