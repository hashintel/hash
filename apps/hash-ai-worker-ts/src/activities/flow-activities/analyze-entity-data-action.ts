/**
 * Flow activity for analyzing entity data and transforming it with Python.
 * This is a thin wrapper around the core analyzeEntityData function.
 */
import type { AiFlowActionActivity } from "@local/hash-backend-utils/flows";
import type { Filter } from "@local/hash-graph-client";
import type { ChartType } from "@local/hash-isomorphic-utils/dashboard-types";
import type {
  AiActionStepOutput,
  InputNameForAiFlowAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import { getSimplifiedAiFlowActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import { StatusCode } from "@local/status";

import { analyzeEntityData } from "../shared/analyze-entity-data.js";
import { getFlowContext } from "../shared/get-flow-context.js";
import { graphApiClient } from "../shared/graph-api-client.js";

type ActionOutputs = AiActionStepOutput<"analyzeEntityData">[];

export const analyzeEntityDataAction: AiFlowActionActivity<
  "analyzeEntityData"
> = async ({ inputs }) => {
  const { structuralQuery, userGoal, targetChartType } =
    getSimplifiedAiFlowActionInputs({
      inputs,
      actionType: "analyzeEntityData",
    }) as {
      [K in InputNameForAiFlowAction<"analyzeEntityData">]: string | undefined;
    };

  const { userAuthentication, stepId, flowEntityId, webId } =
    await getFlowContext();

  if (!structuralQuery || !userGoal) {
    return {
      code: StatusCode.InvalidArgument,
      message: "structuralQuery and userGoal are required",
      contents: [],
    };
  }

  // Parse the structured query from JSON
  let filter: Filter;
  try {
    filter = JSON.parse(structuralQuery) as Filter;
  } catch {
    return {
      code: StatusCode.InvalidArgument,
      message: "Could not parse structuralQuery as JSON",
      contents: [],
    };
  }

  try {
    const { pythonScript, chartData, suggestedChartType, explanation } =
      await analyzeEntityData({
        structuralQuery: filter,
        userGoal,
        targetChartType: targetChartType as ChartType | undefined,
        authentication: userAuthentication,
        graphApiClient,
        webId,
        incurredInEntityId: flowEntityId,
        stepId,
      });

    const outputs: ActionOutputs = [
      {
        outputName: "pythonScript",
        payload: { kind: "Text", value: pythonScript },
      },
      {
        outputName: "chartData",
        payload: { kind: "Text", value: JSON.stringify(chartData) },
      },
      {
        outputName: "suggestedChartType",
        payload: { kind: "Text", value: suggestedChartType },
      },
      {
        outputName: "explanation",
        payload: { kind: "Text", value: explanation },
      },
    ];

    return {
      code: StatusCode.Ok,
      message: "Data analysis completed successfully",
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
