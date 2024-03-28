import type { InputNameForAction } from "@local/hash-isomorphic-utils/flows/step-definitions";
import { StatusCode } from "@local/status";

import { internalApi } from "../shared/internal-api-client";
import type { FlowActionActivity } from "./types";

export const webSearchAction: FlowActionActivity = async ({ inputs }) => {
  const queryInput = inputs.find(
    ({ inputName }) =>
      inputName === ("query" satisfies InputNameForAction<"webSearch">),
  )!;

  const query = queryInput.payload.value as string;

  const {
    data: { webSearchResults },
  } = await internalApi.getWebSearchResults(query);

  const webPagesUrls = webSearchResults.map(({ url }) => url);

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
