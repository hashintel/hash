import "../../shared/testing-utilities/mock-get-flow-context.js";
import { expect, test } from "vitest";
import type { actionDefinitions,InputNameForAction  } from "@local/hash-isomorphic-utils/flows/action-definitions";
import type { StepInput } from "@local/hash-isomorphic-utils/flows/types";

import { getWebPageSummaryAction } from "./get-web-page-summary-action.js";

test.skip(
  "test getWebPageSummaryAction",
  async () => {
    const url = "https://www.amazon.com/stores/author/B072YR2LJP";

    const status = await getWebPageSummaryAction({
      inputs: [
        {
          inputName: "url" satisfies InputNameForAction<"getWebPageSummary">,
          payload: { kind: "Text", value: url },
        },
        ...actionDefinitions.getWebPageSummary.inputs.flatMap<StepInput>(
          ({ name, default: defaultValue }) =>
            !defaultValue || name === "url"
              ? []
              : [{ inputName: name, payload: defaultValue }],
        ),
      ],
    });

    expect(status).toBeDefined();
  },
  {
    timeout: 10 * 60 * 1000,
  },
);
