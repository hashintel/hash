import type {
  AiFlowActionDefinitionId,
  InputNameForAiFlowAction,
  OutputNameForAiFlowAction,
} from "./action-definitions.js";
import type { FlowDefinition } from "./types.js";
import type { EntityUuid } from "@blockprotocol/type-system";

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
export const configureDashboardItemFlowDefinition: FlowDefinition<AiFlowActionDefinitionId> =
  {
    name: "Configure Dashboard Item",
    type: "ai",
    flowDefinitionId: "configure-dashboard-item" as EntityUuid,
    description:
      "Generate query, analyze data, and create chart configuration for a dashboard item",
    trigger: {
      triggerDefinitionId: "userTrigger",
      description: "User provides a goal for the dashboard chart",
      kind: "trigger",
      outputs: [
        {
          payloadKind: "Text",
          name: "userGoal",
          array: false,
          required: true,
        },
      ],
    },
    steps: [
      {
        stepId: "1",
        kind: "action",
        actionDefinitionId: "generateStructuralQuery",
        description: "Generate a structural query based on the user's goal",
        inputSources: [
          {
            inputName:
              "userGoal" satisfies InputNameForAiFlowAction<"generateStructuralQuery">,
            kind: "step-output",
            sourceStepId: "trigger",
            sourceStepOutputName: "userGoal",
          },
        ],
      },
      {
        stepId: "2",
        kind: "action",
        actionDefinitionId: "analyzeEntityData",
        description:
          "Analyze entity data and generate Python transformation script",
        inputSources: [
          {
            inputName:
              "structuralQuery" satisfies InputNameForAiFlowAction<"analyzeEntityData">,
            kind: "step-output",
            sourceStepId: "1",
            sourceStepOutputName:
              "structuralQuery" satisfies OutputNameForAiFlowAction<"generateStructuralQuery">,
          },
          {
            inputName:
              "userGoal" satisfies InputNameForAiFlowAction<"analyzeEntityData">,
            kind: "step-output",
            sourceStepId: "trigger",
            sourceStepOutputName: "userGoal",
          },
          {
            inputName:
              "targetChartType" satisfies InputNameForAiFlowAction<"analyzeEntityData">,
            kind: "step-output",
            sourceStepId: "1",
            sourceStepOutputName:
              "suggestedChartTypes" satisfies OutputNameForAiFlowAction<"generateStructuralQuery">,
          },
        ],
      },
      {
        stepId: "3",
        kind: "action",
        actionDefinitionId: "generateChartConfig",
        description: "Generate ECharts configuration",
        inputSources: [
          {
            inputName:
              "chartData" satisfies InputNameForAiFlowAction<"generateChartConfig">,
            kind: "step-output",
            sourceStepId: "2",
            sourceStepOutputName:
              "chartData" satisfies OutputNameForAiFlowAction<"analyzeEntityData">,
          },
          {
            inputName:
              "chartType" satisfies InputNameForAiFlowAction<"generateChartConfig">,
            kind: "step-output",
            sourceStepId: "2",
            sourceStepOutputName:
              "suggestedChartType" satisfies OutputNameForAiFlowAction<"analyzeEntityData">,
          },
          {
            inputName:
              "userGoal" satisfies InputNameForAiFlowAction<"generateChartConfig">,
            kind: "step-output",
            sourceStepId: "trigger",
            sourceStepOutputName: "userGoal",
          },
        ],
      },
    ],
    outputs: [
      {
        stepId: "1",
        stepOutputName:
          "structuralQuery" satisfies OutputNameForAiFlowAction<"generateStructuralQuery">,
        name: "structuralQuery" as const,
        payloadKind: "Text",
        array: false,
        required: true,
      },
      {
        stepId: "2",
        stepOutputName:
          "pythonScript" satisfies OutputNameForAiFlowAction<"analyzeEntityData">,
        name: "pythonScript" as const,
        payloadKind: "Text",
        array: false,
        required: true,
      },
      {
        stepId: "2",
        stepOutputName:
          "chartData" satisfies OutputNameForAiFlowAction<"analyzeEntityData">,
        name: "chartData" as const,
        payloadKind: "Text",
        array: false,
        required: true,
      },
      {
        stepId: "2",
        stepOutputName:
          "suggestedChartType" satisfies OutputNameForAiFlowAction<"analyzeEntityData">,
        name: "chartType" as const,
        payloadKind: "Text",
        array: false,
        required: true,
      },
      {
        stepId: "3",
        stepOutputName:
          "chartConfig" satisfies OutputNameForAiFlowAction<"generateChartConfig">,
        name: "chartConfig" as const,
        payloadKind: "Text",
        array: false,
        required: true,
      },
    ],
  };

export const refineDashboardItemFlowDefinition: FlowDefinition<AiFlowActionDefinitionId> =
  {
    name: "Refine Dashboard Item",
    type: "ai",
    flowDefinitionId: "refine-dashboard-item" as EntityUuid,
    description:
      "Plan and apply a scoped refinement to an existing dashboard item",
    trigger: {
      triggerDefinitionId: "userTrigger",
      description:
        "User provides a refinement instruction and existing dashboard configuration",
      kind: "trigger",
      outputs: [
        "userGoal",
        "refinementInstruction",
        "existingStructuralQuery",
        "existingPythonScript",
        "existingChartType",
        "existingChartConfig",
      ].map((name) => ({
        payloadKind: "Text" as const,
        name,
        array: false,
        required: true,
      })),
    },
    steps: [
      {
        stepId: "plan",
        kind: "action",
        actionDefinitionId: "planDashboardRefinement",
        description: "Determine which configuration stages need refinement",
        inputSources: [
          "userGoal",
          "refinementInstruction",
          "existingStructuralQuery",
          "existingPythonScript",
          "existingChartType",
          "existingChartConfig",
        ].map((inputName) => ({
          inputName:
            inputName as InputNameForAiFlowAction<"planDashboardRefinement">,
          kind: "step-output" as const,
          sourceStepId: "trigger",
          sourceStepOutputName: inputName,
        })),
      },
      {
        stepId: "1",
        kind: "action",
        actionDefinitionId: "generateStructuralQuery",
        description: "Preserve or refine the structural query",
        inputSources: [
          {
            inputName:
              "userGoal" satisfies InputNameForAiFlowAction<"generateStructuralQuery">,
            kind: "step-output",
            sourceStepId: "trigger",
            sourceStepOutputName: "userGoal",
          },
          {
            inputName:
              "refinementInstruction" satisfies InputNameForAiFlowAction<"generateStructuralQuery">,
            kind: "step-output",
            sourceStepId: "trigger",
            sourceStepOutputName: "refinementInstruction",
          },
          {
            inputName:
              "existingStructuralQuery" satisfies InputNameForAiFlowAction<"generateStructuralQuery">,
            kind: "step-output",
            sourceStepId: "trigger",
            sourceStepOutputName: "existingStructuralQuery",
          },
          {
            inputName:
              "existingChartType" satisfies InputNameForAiFlowAction<"generateStructuralQuery">,
            kind: "step-output",
            sourceStepId: "trigger",
            sourceStepOutputName: "existingChartType",
          },
          {
            inputName:
              "refinementScope" satisfies InputNameForAiFlowAction<"generateStructuralQuery">,
            kind: "step-output",
            sourceStepId: "plan",
            sourceStepOutputName:
              "refinementScope" satisfies OutputNameForAiFlowAction<"planDashboardRefinement">,
          },
        ],
      },
      {
        stepId: "2",
        kind: "action",
        actionDefinitionId: "analyzeEntityData",
        description: "Preserve or refine data analysis",
        inputSources: [
          {
            inputName:
              "structuralQuery" satisfies InputNameForAiFlowAction<"analyzeEntityData">,
            kind: "step-output",
            sourceStepId: "1",
            sourceStepOutputName:
              "structuralQuery" satisfies OutputNameForAiFlowAction<"generateStructuralQuery">,
          },
          {
            inputName:
              "targetChartType" satisfies InputNameForAiFlowAction<"analyzeEntityData">,
            kind: "step-output",
            sourceStepId: "1",
            sourceStepOutputName:
              "suggestedChartTypes" satisfies OutputNameForAiFlowAction<"generateStructuralQuery">,
          },
          ...["userGoal", "refinementInstruction", "existingPythonScript"].map(
            (inputName) => ({
              inputName:
                inputName as InputNameForAiFlowAction<"analyzeEntityData">,
              kind: "step-output" as const,
              sourceStepId: "trigger",
              sourceStepOutputName: inputName,
            }),
          ),
          {
            inputName:
              "refinementScope" satisfies InputNameForAiFlowAction<"analyzeEntityData">,
            kind: "step-output",
            sourceStepId: "plan",
            sourceStepOutputName:
              "refinementScope" satisfies OutputNameForAiFlowAction<"planDashboardRefinement">,
          },
        ],
      },
      {
        stepId: "3",
        kind: "action",
        actionDefinitionId: "generateChartConfig",
        description: "Preserve or refine chart configuration",
        inputSources: [
          {
            inputName:
              "chartData" satisfies InputNameForAiFlowAction<"generateChartConfig">,
            kind: "step-output",
            sourceStepId: "2",
            sourceStepOutputName:
              "chartData" satisfies OutputNameForAiFlowAction<"analyzeEntityData">,
          },
          {
            inputName:
              "chartType" satisfies InputNameForAiFlowAction<"generateChartConfig">,
            kind: "step-output",
            sourceStepId: "2",
            sourceStepOutputName:
              "suggestedChartType" satisfies OutputNameForAiFlowAction<"analyzeEntityData">,
          },
          ...["userGoal", "refinementInstruction", "existingChartConfig"].map(
            (inputName) => ({
              inputName:
                inputName as InputNameForAiFlowAction<"generateChartConfig">,
              kind: "step-output" as const,
              sourceStepId: "trigger",
              sourceStepOutputName: inputName,
            }),
          ),
          {
            inputName:
              "refinementScope" satisfies InputNameForAiFlowAction<"generateChartConfig">,
            kind: "step-output",
            sourceStepId: "plan",
            sourceStepOutputName:
              "refinementScope" satisfies OutputNameForAiFlowAction<"planDashboardRefinement">,
          },
        ],
      },
    ],
    outputs: configureDashboardItemFlowDefinition.outputs,
  };
