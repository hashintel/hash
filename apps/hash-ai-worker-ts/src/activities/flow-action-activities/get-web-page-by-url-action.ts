import type {
  InputNameForAction,
  OutputNameForAction,
} from "@local/hash-isomorphic-utils/flows/step-definitions";
import type { Payload } from "@local/hash-isomorphic-utils/flows/types";
import { StatusCode } from "@local/status";

import { getWebPageActivity } from "../get-web-page-activity";
import type { FlowActionActivity } from "./types";

export const getWebPageByUrlAction: FlowActionActivity = async ({ inputs }) => {
  /** @todo: implement validation for inputs */

  const urlStepInput = inputs.find(
    ({ inputName }) =>
      inputName === ("url" satisfies InputNameForAction<"getWebPageByUrl">),
  )!;

  const url = (urlStepInput.payload as Payload).value as string;

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
