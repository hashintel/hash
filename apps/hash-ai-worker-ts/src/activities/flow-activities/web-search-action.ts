import { getSimplifiedActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import { StatusCode } from "@local/status";

import { internalApi } from "../shared/internal-api-client";
import type { FlowActionActivity } from "./types";

export const webSearchAction: FlowActionActivity = async ({ inputs }) => {
  const { query, numberOfSearchResults } = getSimplifiedActionInputs({
    inputs,
    actionType: "webSearch",
  });

  const {
    data: { webSearchResults },
  } = await internalApi.getWebSearchResults(query);

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
