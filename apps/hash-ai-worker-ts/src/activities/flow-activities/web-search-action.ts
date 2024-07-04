import { internalApiClient } from "@local/hash-backend-utils/internal-api-client";
import { getSimplifiedActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import { StatusCode } from "@local/status";

import type { FlowActionActivity } from "./types.js";

export const webSearchAction: FlowActionActivity = async ({ inputs }) => {
  const { query, numberOfSearchResults } = getSimplifiedActionInputs({
    inputs,
    actionType: "webSearch",
  });

  const {
    data: { webSearchResults },
  } = await internalApiClient.getWebSearchResults(query);

  const webPagesUrls = webSearchResults
    .map(({ url }) => url)
    .slice(0, numberOfSearchResults);

  return {
    code: StatusCode.Ok,
    contents: [
      {
        outputs: [
          {
            outputName: "webPageUrls",
            payload: {
              kind: "Text",
              value: webPagesUrls,
            },
          },
        ],
      },
    ],
  };
};
