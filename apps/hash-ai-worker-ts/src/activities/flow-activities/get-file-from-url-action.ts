import type { GraphApi } from "@local/hash-graph-client";
import {
  getSimplifiedActionInputs,
  // type OutputNameForAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import { StatusCode } from "@local/status";

import { fetchFileFromUrl } from "../shared/fetch-file-from-url";
import type { FlowActionActivity } from "./types";

export const getFileFromUrlAction: FlowActionActivity<{
  graphApiClient: GraphApi;
}> = async ({ inputs }) => {
  const { url } = getSimplifiedActionInputs({
    inputs,
    actionType: "getFileFromUrl",
  });

  const _fileBuffer = await fetchFileFromUrl(url);

  return {
    code: StatusCode.Ok,
    contents: [
      {
        outputs: [
          // {
          //   outputName:
          //     "fileEntity" satisfies OutputNameForAction<"getFileFromUrl">,
          //   payload: {
          //     kind: "Entity",
          //     value: fileEntity,
          //   },
          // },
        ],
      },
    ],
  };
};
