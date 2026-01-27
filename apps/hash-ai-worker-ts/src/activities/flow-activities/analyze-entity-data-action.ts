/**
 * Flow activity for analyzing entity data and transforming it with Python.
 * This activity executes a query and uses an LLM to generate Python code for data transformation.
 */
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
  into a format suitable for visualization (e.g. a table).

  You will receive:
  1. A structured query filter that retrieves entities
  2. The user's visualization goal
  3. A target chart type (or you'll suggest one)

  Your task is to write Python code that:
  1. Loads the entity data (provided as JSON)
  2. Processes, aggregates, or transforms it as needed
  3. Outputs a JSON array in a visualization-friendly format

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
    const requestId = Context.current().info.workflowExecution.workflowId;
    const dataFilePath = `/home/user/${requestId}_data.json`;
    await sandbox.filesystem.write(dataFilePath, dataJson);

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
  let pythonScript: string | null = null;
  let chartData: unknown[] = [];
  let suggestedChartType: ChartType = targetChartType as ChartType;
  let explanation = "";

  type MessageType = Parameters<typeof getLlmResponse>[0]["messages"];

  const callModel = async (
    messages: MessageType,
    iteration: number,
  ): Promise<void> => {
    if (iteration > maximumIterations) {
      // Use last successful result if available
      if (lastSuccessfulScript && lastSuccessfulOutput) {
        pythonScript = lastSuccessfulScript;
        chartData = lastSuccessfulOutput;
        explanation = "Auto-submitted after reaching iteration limit";
        return;
      }
      throw new Error(
        `Exceeded maximum iterations (${maximumIterations}) for data analysis`,
      );
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
          taskName: "analyze-entity-data",
        },
        userAccountId: userAuthentication.actorId,
        graphApiClient,
        incurredInEntities: [{ entityId: flowEntityId }],
        webId,
      },
    );

    if (llmResponse.status !== "ok") {
      throw new Error(`LLM error: ${llmResponse.status}`);
    }

    const { message } = llmResponse;
    const toolCalls = getToolCallsFromLlmAssistantMessage({ message });

    for (const toolCall of toolCalls) {
      const args = toolCall.input as Record<string, unknown>;

      switch (toolCall.name) {
        case "run_python": {
          const code = args.code as string;
          const codeExplanation = args.explanation as string;

          logger.debug(
            `Running Python code:\n${code}\nExplanation: ${codeExplanation}`,
          );

          try {
            const { stdout, stderr } = await runPythonCode(
              code,
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
              const parsedData = JSON.parse(stdout.trim()) as unknown[];
              lastSuccessfulScript = code;
              lastSuccessfulOutput = parsedData;

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
                          ${stringify(Array.isArray(parsedData) ? parsedData.slice(0, 5) : parsedData)}

                          Total items: ${Array.isArray(parsedData) ? parsedData.length : 1}

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
          } catch (error) {
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
                      content: `Execution error: ${error instanceof Error ? error.message : "Unknown"}`,
                    },
                  ],
                },
              ],
              iteration + 1,
            );
          }
        }

        case "submit_result": {
          pythonScript = args.pythonScript as string;
          suggestedChartType = args.suggestedChartType as ChartType;
          explanation = args.explanation as string;

          try {
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

            chartData = JSON.parse(stdout.trim()) as unknown[];
            return;
          } catch (error) {
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
                      content: `Final script error: ${error instanceof Error ? error.message : "Unknown"}\n\nPlease fix and try again.`,
                    },
                  ],
                },
              ],
              iteration + 1,
            );
          }
        }
      }
    }

    // No tool calls - prompt to use a tool
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

  try {
    await callModel(
      [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: dedent(`
                User's goal: "${userGoal}"
                ${targetChartType ? `Target chart type: ${targetChartType}` : "Please suggest an appropriate chart type."}

                Entity data is available at the path stored in DATA_FILE_PATH variable.

                Sample of the data structure:
                ${stringify(simpleEntities.slice(0, 3))}

                Available entity types:
                ${stringify(entityTypes)}

                Please write Python code to:
                1. Load the JSON data from the file at DATA_FILE_PATH
                  2. Transform it into a format suitable for visualization
                  3. Print the result as JSON to stdout
              `),
            },
          ],
        },
      ],
      1,
    );

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Variable set in recursive async function
    if (!pythonScript) {
      throw new Error("Failed to generate Python script");
    }

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
