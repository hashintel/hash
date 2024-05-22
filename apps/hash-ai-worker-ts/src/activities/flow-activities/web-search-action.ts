import { internalApiClient } from "@local/hash-backend-utils/internal-api-client";
import { getSimplifiedActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import { StatusCode } from "@local/status";
import { Context } from "@temporalio/activity";

import { logProgress } from "../shared/log-progress";
import type { FlowActionActivity } from "./types";

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
    /**
     * The coordinator agent using this method does not have the ability to directly
     * interact with PDFs, so we filter these out for now.
     *
     * @todo: account for PDFs being returned in search results in the coordinator agent
     * @see https://linear.app/hash/issue/H-2676/allow-pdfs-returned-in-search-results-to-be-parsed
     */
    .filter((url) => !url.endsWith(".pdf"))
    .slice(0, numberOfSearchResults);

  logProgress([
    {
      type: "QueriedWeb",
      query,
      recordedAt: new Date().toISOString(),
      stepId: Context.current().info.activityId,
    },
  ]);

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
