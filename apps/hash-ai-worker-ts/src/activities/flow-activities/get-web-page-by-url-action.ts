import type { Url } from "@blockprotocol/type-system";
import type { AiFlowActionActivity } from "@local/hash-backend-utils/flows";
import { getSimplifiedAiFlowActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import { StatusCode } from "@local/status";

import { getWebPageActivity } from "../get-web-page-activity.js";

export const getWebPageByUrlAction: AiFlowActionActivity<
  "getWebPageByUrl"
> = async ({ inputs }) => {
  const { url } = getSimplifiedAiFlowActionInputs({
    inputs,
    actionType: "getWebPageByUrl",
  });

  /**
   * @todo: consider moving implementation directly into this method,
   * once legacy AI inference temporal workflows have been replaced
   * by HASH flows.
   */
  const webPage = await getWebPageActivity({ url: url as Url });
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
            outputName: "webPage",
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
