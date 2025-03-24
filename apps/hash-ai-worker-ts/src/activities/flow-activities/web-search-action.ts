import type { Url } from "@blockprotocol/type-system";
import { internalApiClient } from "@local/hash-backend-utils/internal-api-client";
import {
  getSimplifiedActionInputs,
  type OutputNameForAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import type { StepOutput } from "@local/hash-isomorphic-utils/flows/types";
import type { GetWebSearchResults200ResponseWebSearchResultsInner } from "@local/internal-api-client";
import type { Status } from "@local/status";
import { StatusCode } from "@local/status";
import { backOff } from "exponential-backoff";

import type { FlowActionActivity } from "./types.js";

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

export const webSearchAction: FlowActionActivity = async ({ inputs }) => {
  const { query, numberOfSearchResults } = getSimplifiedActionInputs({
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
            outputName:
              "webSearchResult" satisfies OutputNameForAction<"webSearch">,
            payload: {
              kind: "WebSearchResult",
              value: mapWebSearchResults(webPages),
            },
          },
        ],
      },
    ],
  } satisfies Status<{ outputs: StepOutput[] }>;
};
