import { Context } from "@temporalio/activity";

import { queryAllEntitySubgraphPages } from "@local/hash-backend-utils/query-all-entity-subgraph-pages";
import { getSimpleGraph } from "@local/hash-backend-utils/simplified-graph";
import {
  type DashboardItemDataGenerationMetadata,
  normalizeStructuralQuery,
  type StructuralQueryDefinition,
  toApiTraversalPaths,
} from "@local/hash-isomorphic-utils/dashboard-types";
import {
  almostFullOntologyResolveDepths,
  currentTimeInstantTemporalAxes,
} from "@local/hash-isomorphic-utils/graph-queries";

import { runPythonCode } from "./shared/run-python-code.js";
import { scopeFilterToWeb } from "./shared/scope-filter-to-web.js";

import type {
  ComputeDashboardItemDataWorkflowParams,
  ComputeDashboardItemDataWorkflowResult,
} from "@local/hash-backend-utils/dashboards";
import type { FileStorageProvider } from "@local/hash-backend-utils/file-storage";
import type { GraphApi } from "@local/hash-graph-client";

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
  const {
    authentication,
    webId,
    structuralQuery,
    pythonScript,
    storageKey,
    metadataStorageKey,
  } = params;
  const generationStartedAt = Date.now();

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

    const subgraph = await queryAllEntitySubgraphPages(
      { graphApi: graphApiClient },
      authentication,
      {
        filter: scopeFilterToWeb(queryDefinition.filter, webId),
        temporalAxes: currentTimeInstantTemporalAxes,
        graphResolveDepths: almostFullOntologyResolveDepths,
        traversalPaths: toApiTraversalPaths(queryDefinition.traversalPaths),
        includeDrafts: false,
        includePermissions: false,
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

    const chartDataJson = JSON.stringify(chartData);
    const generatedAt = new Date();

    const metadata: DashboardItemDataGenerationMetadata = {
      generatedAt: generatedAt.toISOString(),
      generationDurationMs: generatedAt.getTime() - generationStartedAt,
    };
    const metadataJson: string = JSON.stringify(metadata);
    await storageProvider.uploadDirect({
      key: metadataStorageKey,
      body: metadataJson,
      contentType: "application/json",
    });

    /**
     * Write chart data last: its LastModified timestamp acts as the completion
     * marker observed by the analysis gateway.
     */
    await storageProvider.uploadDirect({
      key: storageKey,
      body: chartDataJson,
      contentType: "application/json",
    });

    return { itemCount: chartData.length, storageKey };
  } finally {
    clearInterval(heartbeatInterval);
  }
};
