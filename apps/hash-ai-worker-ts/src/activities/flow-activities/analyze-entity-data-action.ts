import { Context } from "@temporalio/activity";
import dedent from "dedent";

/**
 * Flow activity for analyzing entity data and transforming it with Python.
 * This activity executes a query and uses an LLM to generate Python code for data transformation.
 */
import {
  generateDashboardItemConfigHash,
  getDashboardItemDataStorageKey,
} from "@local/hash-backend-utils/dashboards";
import { getStorageProvider } from "@local/hash-backend-utils/flows/payload-storage";
import { getSimpleGraph } from "@local/hash-backend-utils/simplified-graph";
import { queryEntitySubgraph } from "@local/hash-graph-sdk/entity";
import {
  type ChartType,
  chartTypes,
} from "@local/hash-isomorphic-utils/dashboard-types";
import { getSimplifiedAiFlowActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import {
  almostFullOntologyResolveDepths,
  currentTimeInstantTemporalAxes,
} from "@local/hash-isomorphic-utils/graph-queries";
import { StatusCode } from "@local/status";

import { logger } from "../shared/activity-logger.js";
import { getFlowContext } from "../shared/get-flow-context.js";
import { getLlmResponse } from "../shared/get-llm-response.js";
import { getToolCallsFromLlmAssistantMessage } from "../shared/get-llm-response/llm-message.js";
import { graphApiClient } from "../shared/graph-api-client.js";
import { runPythonCode } from "../shared/run-python-code.js";
import { stringify } from "../shared/stringify.js";

import type { PermittedAnthropicModel } from "../shared/get-llm-response/anthropic-client.js";
import type { LlmToolDefinition } from "../shared/get-llm-response/types.js";
import type { AiFlowActionActivity } from "@local/hash-backend-utils/flows";
import type { Filter } from "@local/hash-graph-client";
import type {
  AiActionStepOutput,
  InputNameForAiFlowAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";

const model: PermittedAnthropicModel = "claude-opus-4-8";

const systemPrompt = dedent(`
  You are an expert data analyst. Your job is to transform raw entity data from a knowledge graph
  into chart-ready data for an ECharts-based renderer.

  You will receive:
  1. A structured query filter (in JSON format) that was used to retrieve entities
  2. The user's visualization goal
  3. A target chart type (or you'll suggest one)

  Your task is to write Python code that:
  1. Loads the entity data from the JSON file at the path in the DATA_FILE_PATH variable.
     The file contains {"entities": [...], "entityTypes": [...]} — entity properties are keyed
     by property *title* (e.g. "Annual Revenue"), and each entity's outgoing links are under
     "links" (link type titles, link properties, and the target entity's id only — linked
     entities' own properties are NOT included).
  2. Processes, aggregates, or transforms it as needed (group, sum, count, bucket, sort).
  3. Prints a single JSON array of flat objects to stdout — nothing else on stdout.

  ## Required output shape per chart type

  Every row must be a flat object whose keys are stable, descriptive, camelCase strings.
  The renderer picks one key as the category and one or more numeric keys as series.

  - bar / line: one category key (string, e.g. "month", "stage") plus one or more numeric value
    keys. Sort rows in a meaningful order (chronological for time, descending for rankings).
    Multiple numeric keys render as multiple series.
  - pie: exactly one category key (slice name) and one numeric key (slice value). Limit to at
    most ~12 slices — aggregate the tail into an "Other" slice.
  - scatter: two numeric keys (x and y), optionally a third numeric key (point size) and a
    category key (point label / grouping).
  - heatmap: two category keys (x and y buckets) and one numeric key (cell value), one row per
    cell.
  - map: rows must include "latitude" and "longitude" numeric keys, plus a category key for the
    point label and optionally a numeric key for point size.

  ## Choosing a chart type

  Strongly prefer bar and line charts — they are easier to read and compare than pie charts.
  Use line for trends over time, bar for comparisons and distributions across categories.
  Only suggest a pie chart if the user's goal explicitly asks for one (e.g. "pie chart",
  "donut"); for part-of-whole questions a bar chart sorted by value is the better default.

  ## Rules

  - Handle missing/null property values defensively — skip or default them, never crash.
  - Round monetary/large values to whole numbers.
  - Keep the output small: aggregate rather than emitting thousands of raw rows (aim for < 500).
  - Include comments explaining non-obvious transformation logic.
  - Warnings on stderr are fine; what matters is that stdout is exactly one valid JSON array.
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
          enum: chartTypes,
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

/**
 * Summarise the properties present across the queried entities: how often
 * each occurs, what value types it holds, and a few example values. This
 * gives the model a fuller picture of the dataset than a handful of sample
 * entities can.
 */
const generatePropertyStatistics = (
  entities: { properties: Record<string, unknown> }[],
): Record<
  string,
  { presentIn: number; valueTypes: string[]; examples: unknown[] }
> => {
  const statistics: Record<
    string,
    { presentIn: number; valueTypes: Set<string>; examples: unknown[] }
  > = {};

  for (const entity of entities) {
    for (const [propertyTitle, value] of Object.entries(entity.properties)) {
      statistics[propertyTitle] ??= {
        presentIn: 0,
        valueTypes: new Set(),
        examples: [],
      };
      const propertyStats = statistics[propertyTitle];

      propertyStats.presentIn += 1;
      propertyStats.valueTypes.add(
        Array.isArray(value) ? "array" : typeof value,
      );

      const example =
        typeof value === "string" && value.length > 100
          ? `${value.slice(0, 100)}…`
          : value;
      if (
        propertyStats.examples.length < 3 &&
        !propertyStats.examples.some(
          (existing) => JSON.stringify(existing) === JSON.stringify(example),
        )
      ) {
        propertyStats.examples.push(example);
      }
    }
  }

  return Object.fromEntries(
    Object.entries(statistics).map(([propertyTitle, stats]) => [
      propertyTitle,
      { ...stats, valueTypes: [...stats.valueTypes] },
    ]),
  );
};

const runPythonCodeForCurrentActivity = async (
  code: string,
  dataJson: string,
): Promise<{ stdout: string; stderr: string }> => {
  const activityContext = Context.current();
  const requestId =
    activityContext.info.workflowExecution?.workflowId ??
    activityContext.info.activityId;

  return runPythonCode({ code, dataJson, requestId });
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

  /**
   * The `targetChartType` input is either a single chart type, or a JSON
   * array of suggested chart types produced by the query-generation step.
   */
  let targetChartTypes: ChartType[] = [];
  if (targetChartType) {
    try {
      const parsed = JSON.parse(targetChartType) as unknown;
      targetChartTypes = Array.isArray(parsed)
        ? (parsed as ChartType[])
        : [parsed as ChartType];
    } catch {
      targetChartTypes = [targetChartType];
    }
  }

  let lastSuccessfulScript: string | null = null;
  let lastSuccessfulOutput: unknown[] | null = null;
  let pythonScript: string | null = null;
  let chartData: unknown[] = [];
  let suggestedChartType: ChartType = targetChartTypes[0] ?? "bar";
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

    /**
     * The model may make multiple tool calls in a single message. Every
     * tool_use block must receive a matching tool_result in the next user
     * message, otherwise the Anthropic API rejects the conversation.
     */
    const toolResults: { tool_use_id: string; content: string }[] = [];

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
            const { stdout, stderr } = await runPythonCodeForCurrentActivity(
              code,
              entityDataJson,
            );

            /**
             * Python warnings also land on stderr, so success is judged by
             * whether stdout parses as JSON — stderr alone is not a failure.
             */
            let parsedData: unknown;
            try {
              parsedData = JSON.parse(stdout.trim());
            } catch {
              toolResults.push({
                tool_use_id: toolCall.id,
                content: dedent(`
                  stdout is not valid JSON.

                  stdout: ${stdout || "(empty)"}
                  ${stderr ? `stderr: ${stderr}` : ""}

                  Please ensure your code prints exactly one JSON array to stdout.
                `),
              });
              break;
            }

            if (!Array.isArray(parsedData)) {
              toolResults.push({
                tool_use_id: toolCall.id,
                content: `Output is valid JSON but not an array. Print a JSON *array* of flat row objects to stdout.`,
              });
              break;
            }

            lastSuccessfulScript = code;
            lastSuccessfulOutput = parsedData;

            toolResults.push({
              tool_use_id: toolCall.id,
              content: dedent(`
                Code executed successfully!

                Output (first 5 items):
                ${stringify(parsedData.slice(0, 5))}

                Total items: ${parsedData.length}
                ${
                  stderr
                    ? `\nWarnings on stderr (informational): ${stderr}`
                    : ""
                }

                If this looks correct for the visualization goal, submit your final result.
                Otherwise, adjust your code and run again.
              `),
            });
          } catch (error) {
            toolResults.push({
              tool_use_id: toolCall.id,
              content: `Execution error: ${
                error instanceof Error ? error.message : "Unknown"
              }`,
            });
          }
          break;
        }

        case "submit_result": {
          pythonScript = args.pythonScript as string;
          suggestedChartType = args.suggestedChartType as ChartType;
          explanation = args.explanation as string;

          try {
            const { stdout, stderr } = await runPythonCodeForCurrentActivity(
              pythonScript,
              entityDataJson,
            );

            let parsedData: unknown;
            try {
              parsedData = JSON.parse(stdout.trim());
            } catch {
              toolResults.push({
                tool_use_id: toolCall.id,
                content: dedent(`
                  Final script's stdout is not valid JSON.

                  stdout: ${stdout || "(empty)"}
                  ${stderr ? `stderr: ${stderr}` : ""}

                  Please fix and try again.
                `),
              });
              break;
            }

            if (!Array.isArray(parsedData)) {
              toolResults.push({
                tool_use_id: toolCall.id,
                content:
                  "Final script's output is valid JSON but not an array. Print a JSON *array* of flat row objects to stdout, then submit again.",
              });
              break;
            }

            chartData = parsedData;
            return;
          } catch (error) {
            toolResults.push({
              tool_use_id: toolCall.id,
              content: `Final script error: ${
                error instanceof Error ? error.message : "Unknown"
              }\n\nPlease fix and try again.`,
            });
          }
          break;
        }
      }
    }

    if (toolResults.length > 0) {
      return callModel(
        [
          ...messages,
          message,
          {
            role: "user",
            content: toolResults.map(({ tool_use_id, content }) => ({
              type: "tool_result" as const,
              tool_use_id,
              content,
            })),
          },
        ],
        iteration + 1,
      );
    }

    // No tool calls - prompt to use a tool
    return callModel(
      [
        ...messages,
        message,
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
                ${
                  targetChartTypes.length > 0
                    ? `Suggested chart type(s), in order of preference: ${targetChartTypes.join(
                        ", ",
                      )}`
                    : "Please suggest an appropriate chart type."
                }

                The following structural query filter was used to retrieve the entities:
                ${structuralQuery}

                Entity data is available at the path stored in DATA_FILE_PATH variable.

                The dataset contains ${simpleEntities.length} entities.

                Property statistics across all entities (occurrence counts, value types, example values):
                ${stringify(generatePropertyStatistics(simpleEntities))}

                Sample of the data structure (first 3 entities):
                ${stringify(simpleEntities.slice(0, 3))}

                Available entity types:
                ${stringify(entityTypes)}

                Please write Python code to:
                1. Load the JSON data from the file at DATA_FILE_PATH
                2. Transform it into chart-ready rows per the output shape contract for the chart type
                3. Print the result as a JSON array to stdout
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

    /**
     * Proactively write the computed chart data to the analysis artifact
     * cache so the dashboard item's first render doesn't need a recompute.
     * The gateway derives the same key from the item's stored configuration.
     */
    try {
      const configHash = generateDashboardItemConfigHash({
        structuralQuery: filter,
        pythonScript,
      });
      await getStorageProvider().uploadDirect({
        key: getDashboardItemDataStorageKey({ webId, configHash }),
        body: JSON.stringify(chartData),
        contentType: "application/json",
      });
    } catch (error) {
      logger.warn(
        `Failed to write initial dashboard item data artifact: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
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
