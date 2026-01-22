import type { AiFlowActionActivity } from "@local/hash-backend-utils/flows";
import { getSimpleGraph } from "@local/hash-backend-utils/simplified-graph";
import type { Filter } from "@local/hash-graph-client";
import { queryEntitySubgraph } from "@local/hash-graph-sdk/entity";
import type { ChartType } from "@local/hash-isomorphic-utils/dashboard-types";
import type {
  AiActionStepOutput,
  InputNameForAiFlowAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import { getSimplifiedAiFlowActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import {
  almostFullOntologyResolveDepths,
  currentTimeInstantTemporalAxes,
} from "@local/hash-isomorphic-utils/graph-queries";
import { StatusCode } from "@local/status";
import { Context } from "@temporalio/activity";
import dedent from "dedent";
import { CodeInterpreter } from "e2b";

import { logger } from "../shared/activity-logger.js";
import { getFlowContext } from "../shared/get-flow-context.js";
import { getLlmResponse } from "../shared/get-llm-response.js";
import {
  getToolCallsFromLlmAssistantMessage,
  mapLlmMessageToOpenAiMessages,
  mapOpenAiMessagesToLlmMessages,
} from "../shared/get-llm-response/llm-message.js";
import type { LlmToolDefinition } from "../shared/get-llm-response/types.js";
import { graphApiClient } from "../shared/graph-api-client.js";
import { openAiSeed } from "../shared/open-ai-seed.js";
import type { PermittedOpenAiModel } from "../shared/openai-client.js";
import { stringify } from "../shared/stringify.js";

const model: PermittedOpenAiModel = "gpt-4o-2024-08-06";

const systemPrompt = dedent(`
  You are an expert data analyst. Your job is to transform raw entity data from a knowledge graph
  into a format suitable for chart visualization with Apache ECharts.

  You will receive:
  1. A structured query filter that retrieves entities
  2. The user's visualization goal
  3. A target chart type (or you'll suggest one)

  Your task is to write Python code that:
  1. Loads the entity data (provided as JSON)
  2. Processes, aggregates, or transforms it as needed
  3. Outputs a JSON array suitable for Apache ECharts

  ECharts data format examples (array of objects with consistent keys):
  - Bar/Line: [{ "category": "Category A", "value": 100 }, { "category": "Category B", "value": 200 }]
  - Pie: [{ "name": "Slice 1", "value": 400 }, { "name": "Slice 2", "value": 300 }]
  - Multi-series: [{ "month": "Jan", "sales": 100, "revenue": 200 }, { "month": "Feb", "sales": 150, "revenue": 250 }]
  - Scatter: [{ "x": 10, "y": 20 }, { "x": 15, "y": 25 }]

  The data format is similar across chart types - an array of objects where:
  - One key is the category/x-axis value
  - Other keys are the numeric values for each series

  Your Python code should print the final JSON array to stdout.
  Include comments explaining your data transformation logic.
`);

type ToolName = "run_python" | "submit_result";

const tools: LlmToolDefinition<ToolName>[] = [
  {
    name: "run_python",
    description:
      "Execute Python code to transform the entity data. The code should print JSON to stdout.",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description:
            "Python code that processes the data and prints JSON to stdout",
        },
        explanation: {
          type: "string",
          description: "Explanation of what the code does",
        },
      },
      required: ["code", "explanation"],
      additionalProperties: false,
    },
  },
  {
    name: "submit_result",
    description:
      "Submit the final Python script and chart data once you're satisfied with the transformation.",
    inputSchema: {
      type: "object",
      properties: {
        pythonScript: {
          type: "string",
          description: "The final Python script for data transformation",
        },
        suggestedChartType: {
          type: "string",
          enum: ["bar", "line", "pie", "scatter", "heatmap", "map"],
          description: "The recommended chart type for this data",
        },
        explanation: {
          type: "string",
          description: "Explanation of the data transformation approach",
        },
      },
      required: ["pythonScript", "suggestedChartType", "explanation"],
      additionalProperties: false,
    },
  },
];

const runPythonCode = async (
  code: string,
  dataJson: string,
): Promise<{ stdout: string; stderr: string }> => {
  const sandbox = await CodeInterpreter.create();

  try {
    // Upload the data file to the sandbox
    const requestId = Context.current().info.workflowExecution.workflowId;
    const dataFilePath = `/home/user/${requestId}_data.json`;
    await sandbox.filesystem.write(dataFilePath, dataJson);

    // Inject the data file path into the code
    const codeWithDataPath = `DATA_FILE_PATH = "${dataFilePath}"\n${code}`;

    const response = await sandbox.runPython(codeWithDataPath);
    return {
      stdout: response.stdout,
      stderr: response.stderr,
    };
  } finally {
    await sandbox.close();
  }
};

const maximumIterations = 8;

type ActionOutputs = AiActionStepOutput<"analyzeDashboardData">[];

export const analyzeDashboardDataAction: AiFlowActionActivity<
  "analyzeDashboardData"
> = async ({ inputs }) => {
  const { structuredQuery, userGoal, targetChartType } =
    getSimplifiedAiFlowActionInputs({
      inputs,
      actionType: "analyzeDashboardData",
    }) as {
      [K in InputNameForAiFlowAction<"analyzeDashboardData">]:
        | string
        | undefined;
    };

  const { userAuthentication, stepId, flowEntityId, webId } =
    await getFlowContext();

  if (!structuredQuery || !userGoal) {
    return {
      code: StatusCode.InvalidArgument,
      message: "structuredQuery and userGoal are required",
      contents: [],
    };
  }

  // Parse the structured query from JSON
  let filter: Filter;
  try {
    filter = JSON.parse(structuredQuery) as Filter;
  } catch {
    return {
      code: StatusCode.InvalidArgument,
      message: "Invalid structuredQuery JSON",
      contents: [],
    };
  }

  // Execute the query to get entity data
  const { subgraph } = await queryEntitySubgraph(
    { graphApi: graphApiClient },
    userAuthentication,
    {
      filter,
      temporalAxes: currentTimeInstantTemporalAxes,
      graphResolveDepths: almostFullOntologyResolveDepths,
      traversalPaths: [],
      includeDrafts: false,
      includePermissions: false,
    },
  );

  // Convert to simple graph format for LLM
  const { entities: simpleEntities, entityTypes } = getSimpleGraph(subgraph);
  const entityDataJson = JSON.stringify({
    entities: simpleEntities,
    entityTypes,
  });

  let lastSuccessfulScript: string | null = null;
  let lastSuccessfulOutput: unknown[] | null = null;

  type MessageType = Parameters<typeof getLlmResponse>[0]["messages"];

  const callModel = async (
    messages: MessageType,
    iteration: number,
  ): Promise<ReturnType<AiFlowActionActivity<"analyzeDashboardData">>> => {
    if (iteration > maximumIterations) {
      if (lastSuccessfulScript && lastSuccessfulOutput) {
        const outputs: ActionOutputs = [
          {
            outputName: "pythonScript",
            payload: { kind: "Text", value: lastSuccessfulScript },
          },
          {
            outputName: "chartData",
            payload: {
              kind: "Text",
              value: JSON.stringify(lastSuccessfulOutput),
            },
          },
          {
            outputName: "suggestedChartType",
            payload: { kind: "Text", value: targetChartType ?? "bar" },
          },
          {
            outputName: "explanation",
            payload: {
              kind: "Text",
              value: "Auto-submitted after reaching iteration limit",
            },
          },
        ];
        return {
          code: StatusCode.Ok,
          message: "Used last successful script after max iterations",
          contents: [{ outputs }],
        };
      }
      return {
        code: StatusCode.ResourceExhausted,
        message: `Exceeded maximum iterations (${maximumIterations})`,
        contents: [],
      };
    }

    const llmResponse = await getLlmResponse(
      {
        model,
        systemPrompt,
        messages,
        temperature: 0,
        seed: openAiSeed,
        tools,
      },
      {
        customMetadata: {
          stepId,
          taskName: "analyze-dashboard-data",
        },
        userAccountId: userAuthentication.actorId,
        graphApiClient,
        incurredInEntities: [{ entityId: flowEntityId }],
        webId,
      },
    );

    if (llmResponse.status !== "ok") {
      return {
        code: StatusCode.Internal,
        message: "Error calling LLM",
        contents: [],
      };
    }

    const { message } = llmResponse;
    const toolCalls = getToolCallsFromLlmAssistantMessage({ message });

    for (const toolCall of toolCalls) {
      const args = toolCall.input as Record<string, unknown>;

      switch (toolCall.name) {
        case "run_python": {
          const code = args.code as string;
          const explanation = args.explanation as string;

          logger.debug(
            `Running Python code:\n${code}\nExplanation: ${explanation}`,
          );

          const { stdout, stderr } = await runPythonCode(code, entityDataJson);

          if (stderr) {
            return callModel(
              [
                ...messages,
                ...mapOpenAiMessagesToLlmMessages({
                  messages: mapLlmMessageToOpenAiMessages({ message }),
                }),
                {
                  role: "user",
                  content: [
                    {
                      type: "tool_result",
                      tool_use_id: toolCall.id,
                      content: `Error running code: ${stderr}\n\nPlease fix the error and try again.`,
                    },
                  ],
                },
              ],
              iteration + 1,
            );
          }

          // Try to parse the output as JSON
          try {
            const chartData = JSON.parse(stdout.trim()) as unknown[];
            lastSuccessfulScript = code;
            lastSuccessfulOutput = chartData;

            return callModel(
              [
                ...messages,
                ...mapOpenAiMessagesToLlmMessages({
                  messages: mapLlmMessageToOpenAiMessages({ message }),
                }),
                {
                  role: "user",
                  content: [
                    {
                      type: "tool_result",
                      tool_use_id: toolCall.id,
                      content: dedent(`
                        Code executed successfully!

                        Output (first 5 items):
                        ${stringify(Array.isArray(chartData) ? chartData.slice(0, 5) : chartData)}

                        Total items: ${Array.isArray(chartData) ? chartData.length : 1}

                        If this looks correct for the visualization goal, submit your final result.
                        Otherwise, adjust your code and run again.
                      `),
                    },
                  ],
                },
              ],
              iteration + 1,
            );
          } catch {
            return callModel(
              [
                ...messages,
                ...mapOpenAiMessagesToLlmMessages({
                  messages: mapLlmMessageToOpenAiMessages({ message }),
                }),
                {
                  role: "user",
                  content: [
                    {
                      type: "tool_result",
                      tool_use_id: toolCall.id,
                      content: `Output is not valid JSON: ${stdout}\n\nPlease ensure your code prints valid JSON to stdout.`,
                    },
                  ],
                },
              ],
              iteration + 1,
            );
          }
        }

        case "submit_result": {
          const pythonScript = args.pythonScript as string;
          const suggestedChartType = args.suggestedChartType as ChartType;
          const explanation = args.explanation as string;

          // Run the final script to get the chart data
          const { stdout, stderr } = await runPythonCode(
            pythonScript,
            entityDataJson,
          );

          if (stderr) {
            return callModel(
              [
                ...messages,
                ...mapOpenAiMessagesToLlmMessages({
                  messages: mapLlmMessageToOpenAiMessages({ message }),
                }),
                {
                  role: "user",
                  content: [
                    {
                      type: "tool_result",
                      tool_use_id: toolCall.id,
                      content: `Final script has errors: ${stderr}\n\nPlease fix and try again.`,
                    },
                  ],
                },
              ],
              iteration + 1,
            );
          }

          try {
            const chartData = JSON.parse(stdout.trim()) as unknown[];
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
          } catch {
            return callModel(
              [
                ...messages,
                ...mapOpenAiMessagesToLlmMessages({
                  messages: mapLlmMessageToOpenAiMessages({ message }),
                }),
                {
                  role: "user",
                  content: [
                    {
                      type: "tool_result",
                      tool_use_id: toolCall.id,
                      content: `Final script output is not valid JSON. Please fix and try again.`,
                    },
                  ],
                },
              ],
              iteration + 1,
            );
          }
        }

        default: {
          return callModel(
            [
              ...messages,
              ...mapOpenAiMessagesToLlmMessages({
                messages: mapLlmMessageToOpenAiMessages({ message }),
              }),
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `Unknown tool: ${toolCall.name}. Please use one of the available tools.`,
                  },
                ],
              },
            ],
            iteration + 1,
          );
        }
      }
    }

    // No tool calls
    return callModel(
      [
        ...messages,
        ...mapOpenAiMessagesToLlmMessages({
          messages: mapLlmMessageToOpenAiMessages({ message }),
        }),
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Please use the run_python tool to transform the data, or submit_result when done.",
            },
          ],
        },
      ],
      iteration + 1,
    );
  };

  return callModel(
    [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: dedent(`
              User's visualization goal: "${userGoal}"
              ${targetChartType ? `Target chart type: ${targetChartType}` : "Please suggest an appropriate chart type."}

              Entity data is available at the path stored in DATA_FILE_PATH variable.

              Sample of the data structure:
              ${stringify(simpleEntities.slice(0, 3))}

              Available entity types:
              ${stringify(entityTypes)}

              Please write Python code to:
              1. Load the JSON data from the file at DATA_FILE_PATH
              2. Transform it into a format suitable for Apache ECharts
              3. Print the result as JSON to stdout
            `),
          },
        ],
      },
    ],
    1,
  );
};
