import {
  getSimplifiedActionInputs,
  type OutputNameForAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import { StatusCode } from "@local/status";

import { getWebPageActivity } from "../get-web-page-activity.js";
import type { FlowActionActivity } from "./types.js";

export const getWebPageByUrlAction: FlowActionActivity = async ({ inputs }) => {
  const { url } = getSimplifiedActionInputs({
    inputs,
    actionType: "getWebPageByUrl",
  });

  /**
   * @todo: consider moving implementation directly into this method,
   * once legacy AI inference temporal workflows have been replaced
   * by HASH flows.
   */
  const webPage = await getWebPageActivity({ url });
  if ("error" in webPage) {
    return {
      code: StatusCode.Unavailable,
      message: webPage.error,
      contents: [],
    };
  }

  return {
    code: StatusCode.Ok,
    contents: [
      {
        outputs: [
          {
            outputName:
              "webPage" satisfies OutputNameForAction<"getWebPageByUrl">,
            payload: {
              kind: "WebPage",
              value: webPage,
            },
          },
        ],
      },
    ],
  };
};
