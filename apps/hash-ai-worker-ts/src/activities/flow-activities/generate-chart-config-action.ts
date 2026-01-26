/**
 * Flow activity for generating chart configuration.
 * This is a thin wrapper around the core generateChartConfig function.
 */
import type { AiFlowActionActivity } from "@local/hash-backend-utils/flows";
import type { ChartType } from "@local/hash-isomorphic-utils/dashboard-types";
import type {
  AiActionStepOutput,
  InputNameForAiFlowAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import { getSimplifiedAiFlowActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import { StatusCode } from "@local/status";

import { generateChartConfig } from "../shared/generate-chart-config.js";
import { getFlowContext } from "../shared/get-flow-context.js";
import { graphApiClient } from "../shared/graph-api-client.js";

type ActionOutputs = AiActionStepOutput<"generateChartConfig">[];

export const generateChartConfigAction: AiFlowActionActivity<
  "generateChartConfig"
> = async ({ inputs }) => {
  const { chartData, chartType, userGoal } = getSimplifiedAiFlowActionInputs({
    inputs,
    actionType: "generateChartConfig",
  }) as {
    [K in InputNameForAiFlowAction<"generateChartConfig">]: string;
  };

  const { userAuthentication, stepId, flowEntityId, webId } =
    await getFlowContext();

  // Parse chartData from JSON string
  let parsedChartData: unknown[];
  try {
    parsedChartData = JSON.parse(chartData) as unknown[];
  } catch {
    return {
      code: StatusCode.InvalidArgument,
      message: "Invalid chartData JSON",
      contents: [],
    };
  }

  try {
    const { chartConfig, explanation } = await generateChartConfig({
      chartData: parsedChartData,
      chartType: chartType as ChartType,
      userGoal,
      authentication: userAuthentication,
      graphApiClient,
      webId,
      incurredInEntityId: flowEntityId,
      stepId,
    });

    const outputs: ActionOutputs = [
      {
        outputName: "chartConfig",
        payload: { kind: "Text", value: JSON.stringify(chartConfig) },
      },
      {
        outputName: "explanation",
        payload: { kind: "Text", value: explanation },
      },
    ];

    return {
      code: StatusCode.Ok,
      message: "Chart configuration generated successfully",
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
