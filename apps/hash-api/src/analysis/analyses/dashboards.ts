import {
  WorkflowExecutionAlreadyStartedError,
  WorkflowIdReusePolicy,
} from "@temporalio/client";

import {
  COMPUTE_DASHBOARD_ITEM_DATA_WORKFLOW,
  generateDashboardItemConfigHash,
  getDashboardItemDataMetadataStorageKey,
  getDashboardItemDataStorageKey,
} from "@local/hash-backend-utils/dashboards";
import { getWebMachineId } from "@local/hash-backend-utils/machine-actors";
import { queryEntities } from "@local/hash-graph-sdk/entity";
import { normalizeStructuralQuery } from "@local/hash-isomorphic-utils/dashboard-types";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import { logger } from "../../logger";
import {
  AnalysisArgError,
  AnalysisExecutionError,
  AnalysisNotFoundError,
} from "../shared/errors";

import type {
  AnalysisResolutionContext,
  NamedAnalysis,
} from "../shared/analysis-registry";
import type { JsonObject } from "@blockprotocol/core";
import type { ComputeDashboardItemDataWorkflowParams } from "@local/hash-backend-utils/dashboards";
import type { DashboardItemDataGenerationMetadata } from "@local/hash-isomorphic-utils/dashboard-types";

/**
 * How long a computed chart data artifact is considered fresh. Older
 * artifacts are still served (stale-while-revalidate), with a background
 * recompute kicked off so the next view is up to date.
 */
const DASHBOARD_ITEM_DATA_TTL_MS = 15 * 60 * 1000;

/** Client poll hint while a computation is in flight. */
const COMPUTING_RETRY_AFTER_MS = 3_000;

type ComputeWorkflowState = "started" | "running" | "completed";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const getRootErrorMessage = (error: unknown): string => {
  let rootCause = error;

  while (rootCause instanceof Error && rootCause.cause instanceof Error) {
    rootCause = rootCause.cause;
  }

  return rootCause instanceof Error ? rootCause.message : String(rootCause);
};

const loadGenerationMetadata = async (
  ctx: AnalysisResolutionContext,
  metadataStorageKey: string,
): Promise<DashboardItemDataGenerationMetadata | null> => {
  const artifact = await ctx.loadArtifact(metadataStorageKey);
  if (!artifact) {
    return null;
  }

  try {
    const value = JSON.parse(
      artifact.toString("utf8"),
    ) as DashboardItemDataGenerationMetadata;
    return {
      ...(typeof value.generatedAt === "string"
        ? { generatedAt: value.generatedAt }
        : {}),
      ...(typeof value.generationDurationMs === "number" &&
      value.generationDurationMs >= 0
        ? { generationDurationMs: value.generationDurationMs }
        : {}),
    };
  } catch {
    return null;
  }
};

const createAnalysisMetadata = ({
  generationMetadata,
  lastModified,
  isRefreshing,
  refreshAfter,
}: {
  generationMetadata: DashboardItemDataGenerationMetadata | null;
  lastModified: Date | null;
  isRefreshing: boolean;
  refreshAfter?: string;
}): JsonObject => ({
  ...(generationMetadata?.generatedAt || lastModified
    ? {
        generatedAt:
          generationMetadata?.generatedAt ?? lastModified!.toISOString(),
      }
    : {}),
  ...(generationMetadata?.generationDurationMs !== undefined
    ? { generationDurationMs: generationMetadata.generationDurationMs }
    : {}),
  isRefreshing,
  ...(refreshAfter ? { refreshAfter } : {}),
});

/**
 * Start the (idempotent) compute workflow for a dashboard item configuration.
 * The workflow id is derived from the config hash and source artifact version,
 * so concurrent requests for the same computation deduplicate. A terminal
 * execution is never silently replaced: its result is inspected and failures
 * are surfaced to the caller.
 */
const startComputeWorkflow = async (params: {
  ctx: AnalysisResolutionContext;
  configHash: string;
  sourceArtifactLastModified: Date | null;
  structuralQuery: unknown;
  pythonScript: string;
  storageKey: string;
  metadataStorageKey: string;
}): Promise<ComputeWorkflowState> => {
  const {
    ctx,
    configHash,
    sourceArtifactLastModified,
    structuralQuery,
    pythonScript,
    storageKey,
    metadataStorageKey,
  } = params;

  const webMachineId = await getWebMachineId(
    { graphApi: ctx.graphApi },
    { actorId: ctx.actorId },
    { webId: ctx.webId },
  );
  if (!webMachineId) {
    throw new Error(`Could not find the web machine for web "${ctx.webId}"`);
  }

  const workflowId = `compute-dashboard-item-${ctx.webId}-${configHash}${
    sourceArtifactLastModified ? `-${sourceArtifactLastModified.getTime()}` : ""
  }`;

  try {
    await ctx.temporalClient.workflow.start(
      COMPUTE_DASHBOARD_ITEM_DATA_WORKFLOW,
      {
        taskQueue: "ai",
        args: [
          {
            authentication: { actorId: webMachineId },
            webId: ctx.webId,
            structuralQuery: JSON.stringify(structuralQuery),
            pythonScript,
            storageKey,
            metadataStorageKey,
          } satisfies ComputeDashboardItemDataWorkflowParams,
        ],
        workflowId,
        workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE,
        // A failed script must not repeatedly create paid sandboxes. Retrying
        // requires a changed configuration or source artifact version.
        retry: { maximumAttempts: 1 },
      },
    );
    return "started";
  } catch (error) {
    if (error instanceof WorkflowExecutionAlreadyStartedError) {
      const handle = ctx.temporalClient.workflow.getHandle(workflowId);
      const description = await handle.describe();

      if (
        description.status.name === "RUNNING" ||
        description.status.name === "PAUSED"
      ) {
        return "running";
      }

      try {
        await handle.result();
      } catch (resultError) {
        throw new AnalysisExecutionError(
          `Dashboard item computation failed: ${getRootErrorMessage(
            resultError,
          )}`,
        );
      }

      return "completed";
    }
    throw error;
  }
};

/**
 * Resolve a dashboard item's chart data: serve the cached artifact keyed by a
 * hash of the item's (query, script) configuration, computing it server-side
 * via a Temporal workflow when missing, forced, or stale.
 *
 * Args:
 * - `itemUuid` (required): entity uuid of the DashboardItem within the web
 * - `force` (optional boolean): recompute even if a fresh artifact exists
 */
const dashboardItemData: NamedAnalysis = {
  name: "dashboardItemData",
  resolve: async (ctx) => {
    const itemUuid = ctx.args.itemUuid;
    if (typeof itemUuid !== "string" || !UUID_PATTERN.test(itemUuid)) {
      throw new AnalysisArgError(
        "Argument 'itemUuid' must be a valid entity uuid",
      );
    }
    const force = ctx.args.force === true;
    const refreshAfter =
      typeof ctx.args.refreshAfter === "string"
        ? new Date(ctx.args.refreshAfter)
        : null;
    if (refreshAfter && Number.isNaN(refreshAfter.getTime())) {
      throw new AnalysisArgError(
        "Argument 'refreshAfter' must be a valid ISO timestamp",
      );
    }

    const { entities } = await queryEntities(
      { graphApi: ctx.graphApi },
      { actorId: ctx.actorId },
      {
        filter: {
          all: [
            { equal: [{ path: ["uuid"] }, { parameter: itemUuid }] },
            { equal: [{ path: ["webId"] }, { parameter: ctx.webId }] },
            {
              equal: [
                { path: ["type", "baseUrl"] },
                {
                  parameter: systemEntityTypes.dashboardItem.entityTypeBaseUrl,
                },
              ],
            },
          ],
        },
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
        includePermissions: false,
      },
    );

    const itemEntity = entities[0];
    if (!itemEntity) {
      throw new AnalysisNotFoundError(`Unknown dashboard item "${itemUuid}"`);
    }

    const configurationStatus =
      itemEntity.properties[
        systemPropertyTypes.configurationStatus.propertyTypeBaseUrl
      ];

    /**
     * The entity may still carry its previous query and script while a new AI
     * configuration flow is running. Do not compute that stale configuration;
     * ask the client to poll until the flow atomically stores its outputs and
     * marks the item ready.
     */
    if (configurationStatus === "configuring") {
      return { status: "computing", retryAfterMs: COMPUTING_RETRY_AFTER_MS };
    }

    const structuralQuery = normalizeStructuralQuery(
      itemEntity.properties[
        systemPropertyTypes.structuralQuery.propertyTypeBaseUrl
      ],
    );
    const pythonScript =
      itemEntity.properties[
        systemPropertyTypes.pythonScript.propertyTypeBaseUrl
      ];

    if (
      configurationStatus !== "ready" ||
      !structuralQuery ||
      typeof pythonScript !== "string"
    ) {
      throw new AnalysisNotFoundError(
        `Dashboard item "${itemUuid}" is not fully configured`,
      );
    }

    const configHash = generateDashboardItemConfigHash({
      structuralQuery,
      pythonScript,
    });
    const storageKey = getDashboardItemDataStorageKey({
      webId: ctx.webId,
      configHash,
    });
    const metadataStorageKey = getDashboardItemDataMetadataStorageKey({
      webId: ctx.webId,
      configHash,
    });

    const lastModified = await ctx.getArtifactLastModified(storageKey);
    const generationMetadata = await loadGenerationMetadata(
      ctx,
      metadataStorageKey,
    );

    const waitingForForcedRefresh =
      refreshAfter !== null &&
      (!lastModified || lastModified.getTime() <= refreshAfter.getTime());

    if (!lastModified || force || waitingForForcedRefresh) {
      const sourceArtifactLastModified = refreshAfter ?? lastModified;
      const workflowState = await startComputeWorkflow({
        ctx,
        configHash,
        sourceArtifactLastModified,
        structuralQuery,
        pythonScript,
        storageKey,
        metadataStorageKey,
      });

      if (workflowState === "completed") {
        const completedArtifactLastModified =
          await ctx.getArtifactLastModified(storageKey);

        if (!completedArtifactLastModified) {
          throw new AnalysisExecutionError(
            "Dashboard item computation completed without producing a chart data artifact",
          );
        }
        const completedGenerationMetadata = await loadGenerationMetadata(
          ctx,
          metadataStorageKey,
        );

        return {
          status: "ready",
          artifacts: [{ name: "chartData", key: storageKey }],
          metadata: createAnalysisMetadata({
            generationMetadata: completedGenerationMetadata,
            lastModified: completedArtifactLastModified,
            isRefreshing: false,
          }),
        };
      }

      return {
        status: "computing",
        retryAfterMs: COMPUTING_RETRY_AFTER_MS,
        metadata: createAnalysisMetadata({
          generationMetadata,
          lastModified,
          isRefreshing: true,
          refreshAfter: sourceArtifactLastModified?.toISOString(),
        }),
      };
    }

    const isStale =
      Date.now() - lastModified.getTime() > DASHBOARD_ITEM_DATA_TTL_MS;
    if (isStale) {
      // Stale: serve the cached artifact but refresh it in the background.
      startComputeWorkflow({
        ctx,
        configHash,
        sourceArtifactLastModified: lastModified,
        structuralQuery,
        pythonScript,
        storageKey,
        metadataStorageKey,
      }).catch((error: unknown) => {
        logger.warn(
          `Failed to start background dashboard item recompute [itemUuid=${itemUuid}]: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
    }

    return {
      status: "ready",
      artifacts: [{ name: "chartData", key: storageKey }],
      metadata: createAnalysisMetadata({
        generationMetadata,
        lastModified,
        isRefreshing: isStale,
      }),
    };
  },
};

export const dashboardAnalyses: readonly NamedAnalysis[] = [dashboardItemData];
