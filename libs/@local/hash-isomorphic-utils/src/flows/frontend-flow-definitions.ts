import { typedActionDefinitions as actions } from "./action-definitions.js";
import { defineFlow, flowInput, type StepOutputs } from "./define-flow.js";

import type { TypedActionDefinitions } from "./action-definitions.js";

/**
 * The outputs the frontend reads from both dashboard item flows.
 */
const dashboardItemOutputs = ({
  query,
  analysis,
  chart,
}: {
  query: StepOutputs<TypedActionDefinitions["generateStructuralQuery"]>;
  analysis: StepOutputs<TypedActionDefinitions["analyzeEntityData"]>;
  chart: StepOutputs<TypedActionDefinitions["generateChartConfig"]>;
}) => ({
  structuralQuery: query.structuralQuery,
  pythonScript: analysis.pythonScript,
  chartData: analysis.chartData,
  chartType: analysis.suggestedChartType,
  chartConfig: chart.chartConfig,
});

/**
 * Flow definition for configuring a dashboard item.
 *
 * This flow:
 * 1. Takes a user goal for what they want to visualize
 * 2. Generates a structural query to fetch relevant entities
 * 3. Analyzes the entity data and transforms it for visualization
 * 4. Generates ECharts configuration for the chart
 *
 * The frontend is responsible for:
 * - Saving the user goal to the dashboard item entity before starting the flow
 * - Polling for flow completion
 * - Extracting outputs and updating the dashboard item entity with results
 */
export const configureDashboardItemFlow = defineFlow(
  {
    /* configure-dashboard-item */
    flowDefinitionId: "bf7f36a2-221e-5e7d-9879-289c1f56c148",
    name: "Configure Dashboard Item",
    description:
      "Generate query, analyze data, and create chart configuration for a dashboard item",
    inputs: {
      userGoal: flowInput("Text"),
    },
  },
  ({ inputs, step }) => {
    const query = step("1", actions.generateStructuralQuery, {
      description: "Generate a structural query based on the user's goal",
      inputs: { userGoal: inputs.userGoal },
    });

    const analysis = step("2", actions.analyzeEntityData, {
      description:
        "Analyze entity data and generate Python transformation script",
      inputs: {
        structuralQuery: query.outputs.structuralQuery,
        userGoal: inputs.userGoal,
        targetChartType: query.outputs.suggestedChartTypes,
      },
    });

    const chart = step("3", actions.generateChartConfig, {
      description: "Generate ECharts configuration",
      inputs: {
        chartData: analysis.outputs.chartData,
        chartType: analysis.outputs.suggestedChartType,
        userGoal: inputs.userGoal,
      },
    });

    return {
      outputs: dashboardItemOutputs({
        query: query.outputs,
        analysis: analysis.outputs,
        chart: chart.outputs,
      }),
    };
  },
);

export const refineDashboardItemFlow = defineFlow(
  {
    /* refine-dashboard-item */
    flowDefinitionId: "6216ef71-5b7b-5468-bf12-9a34e30604b5",
    name: "Refine Dashboard Item",
    description:
      "Plan and apply a scoped refinement to an existing dashboard item",
    inputs: {
      userGoal: flowInput("Text"),
      refinementInstruction: flowInput("Text"),
      existingStructuralQuery: flowInput("Text"),
      existingPythonScript: flowInput("Text"),
      existingChartType: flowInput("Text"),
      existingChartConfig: flowInput("Text"),
    },
  },
  ({ inputs, step }) => {
    const plan = step("plan", actions.planDashboardRefinement, {
      description: "Determine which configuration stages need refinement",
      inputs,
    });

    const query = step("1", actions.generateStructuralQuery, {
      description: "Preserve or refine the structural query",
      inputs: {
        userGoal: inputs.userGoal,
        refinementInstruction: inputs.refinementInstruction,
        existingStructuralQuery: inputs.existingStructuralQuery,
        existingChartType: inputs.existingChartType,
        refinementScope: plan.outputs.refinementScope,
      },
    });

    const analysis = step("2", actions.analyzeEntityData, {
      description: "Preserve or refine data analysis",
      inputs: {
        structuralQuery: query.outputs.structuralQuery,
        targetChartType: query.outputs.suggestedChartTypes,
        userGoal: inputs.userGoal,
        refinementInstruction: inputs.refinementInstruction,
        existingPythonScript: inputs.existingPythonScript,
        refinementScope: plan.outputs.refinementScope,
      },
    });

    const chart = step("3", actions.generateChartConfig, {
      description: "Preserve or refine chart configuration",
      inputs: {
        chartData: analysis.outputs.chartData,
        chartType: analysis.outputs.suggestedChartType,
        userGoal: inputs.userGoal,
        refinementInstruction: inputs.refinementInstruction,
        existingChartConfig: inputs.existingChartConfig,
        refinementScope: plan.outputs.refinementScope,
      },
    });

    return {
      outputs: dashboardItemOutputs({
        query: query.outputs,
        analysis: analysis.outputs,
        chart: chart.outputs,
      }),
    };
  },
);
