/**
 * Flow activity for generating a structured query.
 * This is a thin wrapper around the core generateStructuredQuery function.
 */
import type { AiFlowActionActivity } from "@local/hash-backend-utils/flows";
import type {
  AiActionStepOutput,
  InputNameForAiFlowAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import { getSimplifiedAiFlowActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import { StatusCode } from "@local/status";

import { generateStructuralQuery } from "../shared/generate-structural-query.js";
import { getFlowContext } from "../shared/get-flow-context.js";
import { graphApiClient } from "../shared/graph-api-client.js";

type ActionOutputs = AiActionStepOutput<"generateStructuralQuery">[];

export const generateStructuralQueryAction: AiFlowActionActivity<
  "generateStructuralQuery"
> = async ({ inputs }) => {
  const { userGoal } = getSimplifiedAiFlowActionInputs({
    inputs,
    actionType: "generateStructuralQuery",
  }) as {
    [K in InputNameForAiFlowAction<"generateStructuralQuery">]: string;
  };

  const { userAuthentication, stepId, flowEntityId, webId } =
    await getFlowContext();

  try {
    const { structuralQuery, suggestedChartTypes, explanation } =
      await generateStructuralQuery({
        userGoal,
        webId,
        authentication: userAuthentication,
        graphApiClient,
        incurredInEntityId: flowEntityId,
        stepId,
      });

    const outputs: ActionOutputs = [
      {
        outputName: "structuralQuery",
        payload: {
          kind: "Text",
          value: JSON.stringify(structuralQuery),
        },
      },
      {
        outputName: "explanation",
        payload: {
          kind: "Text",
          value: explanation,
        },
      },
      {
        outputName: "suggestedChartTypes",
        payload: {
          kind: "Text",
          value: JSON.stringify(suggestedChartTypes),
        },
      },
    ];

    return {
      code: StatusCode.Ok,
      message: "Query generated successfully",
      contents: [{ outputs }],
    };
  } catch (error) {
    return {
      code: StatusCode.Internal,
      message: error instanceof Error ? error.message : "Unknown error",
      contents: [],
    };
  }
};
