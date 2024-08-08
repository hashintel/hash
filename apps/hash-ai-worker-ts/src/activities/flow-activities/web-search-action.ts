import { internalApiClient } from "@local/hash-backend-utils/internal-api-client";
import {
  getSimplifiedActionInputs,
  type OutputNameForAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import { StatusCode } from "@local/status";
import { backOff } from "exponential-backoff";

import type { FlowActionActivity } from "./types.js";

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
              value: webPages,
            },
          },
        ],
      },
    ],
  };
};
