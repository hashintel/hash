import { Context } from "@temporalio/activity";
import dedent from "dedent";

/**
 * Flow activity for analyzing entity data and transforming it with Python.
 * This activity executes a query and uses an LLM to generate Python code for data transformation.
 */
import {
  generateDashboardItemConfigHash,
  getDashboardItemDataMetadataStorageKey,
  getDashboardItemDataStorageKey,
} from "@local/hash-backend-utils/dashboards";
import { getStorageProvider } from "@local/hash-backend-utils/flows/payload-storage";
import { getWebMachineId } from "@local/hash-backend-utils/machine-actors";
import { queryAllEntitySubgraphPages } from "@local/hash-backend-utils/query-all-entity-subgraph-pages";
import { getSimpleGraph } from "@local/hash-backend-utils/simplified-graph";
import {
  type ChartType,
  chartTypes,
  normalizeStructuralQuery,
  type StructuralQueryDefinition,
  toApiTraversalPaths,
} from "@local/hash-isomorphic-utils/dashboard-types";
import { getSimplifiedAiFlowActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import {
  almostFullOntologyResolveDepths,
  currentTimeInstantTemporalAxes,
} from "@local/hash-isomorphic-utils/graph-queries";
import { StatusCode } from "@local/status";

import { logger } from "../shared/activity-logger.js";
import { runAgenticToolLoop } from "../shared/agentic-tool-loop.js";
import { getFlowContext } from "../shared/get-flow-context.js";
import { graphApiClient } from "../shared/graph-api-client.js";
import { runPythonCode } from "../shared/run-python-code.js";
import { scopeFilterToWeb } from "../shared/scope-filter-to-web.js";
import { stringify } from "../shared/stringify.js";

import type { PermittedAnthropicModel } from "../shared/get-llm-response/anthropic-client.js";
import type { LlmToolDefinition } from "../shared/get-llm-response/types.js";
import type { AiFlowActionActivity } from "@local/hash-backend-utils/flows";
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
  1. Loads the entity data from the JSON file at the absolute path in the pre-defined Python
     string variable DATA_FILE_PATH. Use it directly:
       with open(DATA_FILE_PATH, encoding="utf-8") as data_file:
           data = json.load(data_file)
     Do not read DATA_FILE_PATH from os.environ, take its basename, remove its directory, replace
     it with a relative path, or hardcode a filename.
     The file contains {"entities": [...], "entityTypes": [...]} — entity properties are keyed
     by property *title* (e.g. "Annual Revenue"), and each entity's outgoing links are under
     "links" (link type titles, link properties, and the target entity's "targetEntityId").
     When the query includes traversal paths, connected entities appear as additional
     top-level entries in "entities" (distinguishable by their "entityTypes"). "links" sit on
     the SOURCE side of each relationship: to join A → B, match A's links[].targetEntityId
     against B's entityId. For relationships pointing INTO the queried entities, the connected
     entity is the one whose links reference them. Without traversal, linked entities' own
     properties are NOT included, only their ids.
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

  Only suggest a pie chart if the user's goal explicitly asks for one (e.g. "pie chart",
  "donut"); for part-of-whole questions a bar chart sorted by value is the better default.

  ## Rules

  - Handle missing/null property values defensively — skip or default them, never crash.
  - Round monetary/large values to an appropriate number of significant figures.
  - Keep the output small: aggregate rather than emitting thousands of raw rows (aim for < 500).
  - Include comments explaining non-obvious transformation logic.
  - Warnings on stderr are fine; what matters is that stdout is exactly one valid JSON array.
`);

type ToolName = "run_python" | "submit_result";

const tools: LlmToolDefinition<ToolName>[] = [
  {
    name: "run_python",
    description:
      'Execute Python code to transform the entity data. Load the input with `with open(DATA_FILE_PATH, encoding="utf-8") as data_file:` — DATA_FILE_PATH is a pre-defined Python string containing the absolute path; use it directly, not via os.environ or basename. The code should print JSON to stdout.',
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
      "Submit the final Python script and chart data once you're satisfied with the transformation. The script must use the pre-defined absolute DATA_FILE_PATH Python variable directly (not os.environ, basename, or a relative/hardcoded path).",
    inputSchema: {
      type: "object",
      properties: {
        pythonScript: {
          type: "string",
          description: "The final Python script for data transformation",
        },
        suggestedChartType: {
          type: "string",
          enum: [...chartTypes],
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
  const {
    structuralQuery,
    userGoal,
    targetChartType,
    refinementInstruction,
    existingPythonScript,
    refinementScope,
  } = getSimplifiedAiFlowActionInputs({
    inputs,
    actionType: "analyzeEntityData",
  }) as {
    [K in InputNameForAiFlowAction<"analyzeEntityData">]: string | undefined;
  };

  const { userAuthentication, stepId, flowEntityId, webId } =
    await getFlowContext();

  const webMachineId = await getWebMachineId(
    { graphApi: graphApiClient },
    userAuthentication,
    { webId },
  );
  if (!webMachineId) {
    throw new Error(`Could not find the web machine for web "${webId}"`);
  }
  const webMachineAuthentication = { actorId: webMachineId };

  if (!structuralQuery || !userGoal) {
    return {
      code: StatusCode.InvalidArgument,
      message: "structuralQuery and userGoal are required",
      contents: [],
    };
  }

  // Parse the structured query (bare filter or { filter, traversalPaths })
  let queryDefinition: StructuralQueryDefinition | null;
  try {
    queryDefinition = normalizeStructuralQuery(JSON.parse(structuralQuery));
  } catch {
    queryDefinition = null;
  }
  if (!queryDefinition) {
    return {
      code: StatusCode.InvalidArgument,
      message: "Could not parse structuralQuery as a filter or definition",
      contents: [],
    };
  }

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
      targetChartTypes = [targetChartType as ChartType];
    }
  }

  let lastSuccessfulScript: string | null = null;
  let lastSuccessfulOutput: unknown[] | null = null;

  /**
   * The chart type from the most recent submit_result attempt (initially the
   * caller's preference), used when auto-submitting the last successful run
   * at the iteration limit.
   */
  let fallbackChartType: ChartType = targetChartTypes[0] ?? "bar";

  type LoopResult = {
    pythonScript: string;
    chartData: unknown[];
    suggestedChartType: ChartType;
    explanation: string;
  };

  try {
    // Execute the query to get entity data
    const subgraph = await queryAllEntitySubgraphPages(
      { graphApi: graphApiClient },
      webMachineAuthentication,
      {
        filter: scopeFilterToWeb(queryDefinition.filter, webId),
        temporalAxes: currentTimeInstantTemporalAxes,
        graphResolveDepths: almostFullOntologyResolveDepths,
        traversalPaths: toApiTraversalPaths(queryDefinition.traversalPaths),
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

    let analysisResult: LoopResult;
    if (refinementScope && ["chart", "none"].includes(refinementScope)) {
      if (!existingPythonScript) {
        throw new Error("Existing Python script is required for refinement");
      }
      const { stdout, stderr } = await runPythonCodeForCurrentActivity(
        existingPythonScript,
        entityDataJson,
      );
      let chartData: unknown;
      try {
        chartData = JSON.parse(stdout.trim());
      } catch {
        throw new Error(
          `Existing Python script did not produce valid JSON.${
            stderr ? ` stderr: ${stderr}` : ""
          }`,
        );
      }
      if (!Array.isArray(chartData)) {
        throw new Error("Existing Python script output is not a JSON array");
      }
      analysisResult = {
        pythonScript: existingPythonScript,
        chartData,
        suggestedChartType: targetChartTypes[0] ?? "bar",
        explanation: "Existing data analysis preserved by refinement plan",
      };
    } else {
      analysisResult = await runAgenticToolLoop<ToolName, LoopResult>({
        model,
        systemPrompt,
        tools,
        maximumIterations,
        noToolCallNudge:
          "Please use the run_python tool to transform the data, or submit_result when done.",
        usageTrackingParams: {
          customMetadata: {
            stepId,
            taskName: "analyze-entity-data",
          },
          userAccountId: userAuthentication.actorId,
          graphApiClient,
          incurredInEntities: [{ entityId: flowEntityId }],
          webId,
        },
        onIterationLimit: () => {
          // Use last successful result if available
          if (lastSuccessfulScript && lastSuccessfulOutput) {
            return {
              pythonScript: lastSuccessfulScript,
              chartData: lastSuccessfulOutput,
              suggestedChartType: fallbackChartType,
              explanation: "Auto-submitted after reaching iteration limit",
            };
          }
          throw new Error(
            `Exceeded maximum iterations (${maximumIterations}) for data analysis`,
          );
        },
        handleToolCall: async (toolCall) => {
          const args = toolCall.input as Record<string, unknown>;

          switch (toolCall.name) {
            case "run_python": {
              const code = args.code as string;
              const codeExplanation = args.explanation as string;

              logger.debug(
                `Running Python code:\n${code}\nExplanation: ${codeExplanation}`,
              );

              try {
                const { stdout, stderr } =
                  await runPythonCodeForCurrentActivity(code, entityDataJson);

                /**
                 * Python warnings also land on stderr, so success is judged by
                 * whether stdout parses as JSON — stderr alone is not a failure.
                 */
                let parsedData: unknown;
                try {
                  parsedData = JSON.parse(stdout.trim());
                } catch {
                  return {
                    kind: "tool-result",
                    content: dedent(`
                      stdout is not valid JSON.

                      stdout: ${stdout || "(empty)"}
                      ${stderr ? `stderr: ${stderr}` : ""}

                      Please ensure your code prints exactly one JSON array to stdout.
                    `),
                  };
                }

                if (!Array.isArray(parsedData)) {
                  return {
                    kind: "tool-result",
                    content: `Output is valid JSON but not an array. Print a JSON *array* of flat row objects to stdout.`,
                  };
                }

                lastSuccessfulScript = code;
                lastSuccessfulOutput = parsedData;

                return {
                  kind: "tool-result",
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
                };
              } catch (error) {
                return {
                  kind: "tool-result",
                  content: `Execution error: ${
                    error instanceof Error ? error.message : "Unknown"
                  }`,
                };
              }
            }

            case "submit_result": {
              const submittedScript = args.pythonScript as string;
              const submittedChartType = args.suggestedChartType as ChartType;

              fallbackChartType = submittedChartType;

              try {
                const { stdout, stderr } =
                  await runPythonCodeForCurrentActivity(
                    submittedScript,
                    entityDataJson,
                  );

                let parsedData: unknown;
                try {
                  parsedData = JSON.parse(stdout.trim());
                } catch {
                  return {
                    kind: "tool-result",
                    content: dedent(`
                      Final script's stdout is not valid JSON.

                      stdout: ${stdout || "(empty)"}
                      ${stderr ? `stderr: ${stderr}` : ""}

                      Please fix and try again.
                    `),
                  };
                }

                if (!Array.isArray(parsedData)) {
                  return {
                    kind: "tool-result",
                    content:
                      "Final script's output is valid JSON but not an array. Print a JSON *array* of flat row objects to stdout, then submit again.",
                  };
                }

                return {
                  kind: "complete",
                  result: {
                    pythonScript: submittedScript,
                    chartData: parsedData,
                    suggestedChartType: submittedChartType,
                    explanation: args.explanation as string,
                  },
                };
              } catch (error) {
                return {
                  kind: "tool-result",
                  content: `Final script error: ${
                    error instanceof Error ? error.message : "Unknown"
                  }\n\nPlease fix and try again.`,
                };
              }
            }
          }
        },
        initialMessages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: dedent(`
                User's goal: "${userGoal}"
                ${
                  refinementInstruction && existingPythonScript
                    ? dedent(`
                        Refinement instruction: "${refinementInstruction}"

                        Existing Python script:
                        ${existingPythonScript}

                        Refine the existing analysis only as required. You may submit the existing
                        script unchanged if it remains appropriate.
                      `)
                    : ""
                }
                ${
                  targetChartTypes.length > 0
                    ? `Suggested chart type(s), in order of preference: ${targetChartTypes.join(
                        ", ",
                      )}`
                    : "Please suggest an appropriate chart type."
                }

                The following structural query (filter, plus any traversal paths that pull in
                connected entities) was used to retrieve the entities:
                ${structuralQuery}

                Entity data is available at the absolute path stored in the pre-defined Python
                string variable DATA_FILE_PATH. Open that variable directly — do not read it from
                os.environ, take its basename, or replace it with a relative path.

                The dataset contains ${simpleEntities.length} entities.

                Property statistics across all entities (occurrence counts, value types, example values):
                ${stringify(generatePropertyStatistics(simpleEntities))}

                Sample of the data structure (first 3 entities):
                ${stringify(simpleEntities.slice(0, 3))}

                Available entity types:
                ${stringify(entityTypes)}

                Please write Python code to:
                1. Load the JSON data with:
                   with open(DATA_FILE_PATH, encoding="utf-8") as data_file:
                       data = json.load(data_file)
                2. Transform it into chart-ready rows per the output shape contract for the chart type
                3. Print the result as a JSON array to stdout
              `),
              },
            ],
          },
        ],
      });
    }

    const { pythonScript, chartData, suggestedChartType, explanation } =
      analysisResult;

    /**
     * Proactively write the computed chart data to the analysis artifact
     * cache so the dashboard item's first render doesn't need a recompute.
     * The gateway derives the same key from the item's stored configuration.
     */
    try {
      const configHash = generateDashboardItemConfigHash({
        structuralQuery: queryDefinition,
        pythonScript,
      });
      await getStorageProvider().uploadDirect({
        key: getDashboardItemDataStorageKey({ webId, configHash }),
        body: JSON.stringify(chartData),
        contentType: "application/json",
      });
      await getStorageProvider().uploadDirect({
        key: getDashboardItemDataMetadataStorageKey({ webId, configHash }),
        body: JSON.stringify({ generatedAt: new Date().toISOString() }),
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
