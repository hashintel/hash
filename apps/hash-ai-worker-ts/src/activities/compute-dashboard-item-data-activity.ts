import { Context } from "@temporalio/activity";

import { getSimpleGraph } from "@local/hash-backend-utils/simplified-graph";
import { queryEntitySubgraph } from "@local/hash-graph-sdk/entity";
import {
  normalizeStructuralQuery,
  toApiTraversalPaths,
} from "@local/hash-isomorphic-utils/dashboard-types";
import {
  almostFullOntologyResolveDepths,
  currentTimeInstantTemporalAxes,
} from "@local/hash-isomorphic-utils/graph-queries";

import { runPythonCode } from "./shared/run-python-code.js";

import type {
  ComputeDashboardItemDataWorkflowParams,
  ComputeDashboardItemDataWorkflowResult,
} from "@local/hash-backend-utils/dashboards";
import type { FileStorageProvider } from "@local/hash-backend-utils/file-storage";
import type { GraphApi } from "@local/hash-graph-client";
import type { StructuralQueryDefinition } from "@local/hash-isomorphic-utils/dashboard-types";

/**
 * Cap the number of entities loaded for a dashboard item, to bound memory
 * usage in the worker and the size of the dataset passed to the Python
 * sandbox.
 *
 * The graph rejects queries whose limit exceeds its configured maximum
 * (`HASH_GRAPH_QUERY_ENTITY_LIMIT`, 1000 by default), so this must not be
 * raised above that without also raising the graph's limit.
 */
const MAXIMUM_ENTITY_COUNT = 1_000;

const SECONDS_BETWEEN_HEARTBEATS = 10;

/**
 * Compute a dashboard item's chart data without any LLM involvement:
 * run its stored structural query against the graph, transform the results
 * with its stored Python script in an E2B sandbox, and write the resulting
 * chart data to storage as an analysis artifact.
 */
export const computeDashboardItemDataActivity = async (
  {
    graphApiClient,
    storageProvider,
  }: { graphApiClient: GraphApi; storageProvider: FileStorageProvider },
  params: ComputeDashboardItemDataWorkflowParams,
): Promise<ComputeDashboardItemDataWorkflowResult> => {
  const { authentication, structuralQuery, pythonScript, storageKey } = params;

  const heartbeatInterval = setInterval(() => {
    Context.current().heartbeat();
  }, SECONDS_BETWEEN_HEARTBEATS * 1000);

  try {
    let queryDefinition: StructuralQueryDefinition | null;
    try {
      queryDefinition = normalizeStructuralQuery(JSON.parse(structuralQuery));
    } catch {
      throw new Error("Could not parse structuralQuery as JSON");
    }
    if (!queryDefinition) {
      throw new Error("structuralQuery is not a filter or query definition");
    }

    const { subgraph } = await queryEntitySubgraph(
      { graphApi: graphApiClient },
      authentication,
      {
        filter: queryDefinition.filter,
        temporalAxes: currentTimeInstantTemporalAxes,
        graphResolveDepths: almostFullOntologyResolveDepths,
        traversalPaths: toApiTraversalPaths(queryDefinition.traversalPaths),
        includeDrafts: false,
        includePermissions: false,
        limit: MAXIMUM_ENTITY_COUNT,
      },
    );

    const { entities: simpleEntities, entityTypes } = getSimpleGraph(subgraph);
    const entityDataJson = JSON.stringify({
      entities: simpleEntities,
      entityTypes,
    });

    const activityContext = Context.current();
    const requestId =
      activityContext.info.workflowExecution?.workflowId ??
      activityContext.info.activityId;

    const { stdout, stderr } = await runPythonCode({
      code: pythonScript,
      dataJson: entityDataJson,
      requestId,
    });

    let chartData: unknown[];
    try {
      chartData = JSON.parse(stdout.trim()) as unknown[];
    } catch {
      // Python warnings also land on stderr, so only surface it when the
      // script failed to produce parseable output.
      throw new Error(
        `Python script did not print valid JSON to stdout.${
          stderr ? ` stderr: ${stderr}` : ""
        }`,
      );
    }

    if (!Array.isArray(chartData)) {
      throw new Error(
        "Python script output is not a JSON array of chart data items",
      );
    }

    await storageProvider.uploadDirect({
      key: storageKey,
      body: JSON.stringify(chartData),
      contentType: "application/json",
    });

    return { itemCount: chartData.length, storageKey };
  } finally {
    clearInterval(heartbeatInterval);
  }
};
