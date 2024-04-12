import {
  getSimplifiedActionInputs,
  type OutputNameForAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import { StatusCode } from "@local/status";

import { getWebPageActivity } from "../get-web-page-activity";
import type { FlowActionActivity } from "./types";

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
