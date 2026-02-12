import type {
  ActorEntityUuid,
  BaseUrl,
  DataTypeWithMetadata,
  EntityId,
  EntityTypeWithMetadata,
  MachineId,
  PropertyTypeWithMetadata,
} from "@blockprotocol/type-system";
import { splitEntityId } from "@blockprotocol/type-system";
import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";
import type { EntityQueryCursor, Filter } from "@local/hash-graph-client";
import type {
  CreateEmbeddingsParams,
  CreateEmbeddingsReturn,
} from "@local/hash-graph-sdk/embeddings";
import { deserializeQueryEntitiesResponse } from "@local/hash-graph-sdk/entity";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { ParseTextFromFileParams } from "@local/hash-isomorphic-utils/parse-text-from-file-types";
import {
  ActivityCancellationType,
  continueAsNew,
  executeChild,
  proxyActivities,
  workflowInfo,
} from "@temporalio/workflow";
import type { OpenAI } from "openai";

import type {
  createAiActivities,
  createGraphActivities,
} from "./activities.js";
import { runFlowWorkflow } from "./workflows/run-flow-workflow.js";

const aiActivities = proxyActivities<ReturnType<typeof createAiActivities>>({
  cancellationType: ActivityCancellationType.WAIT_CANCELLATION_COMPLETED,
  startToCloseTimeout: "3600 second", // 1 hour
  retry: {
    maximumAttempts: 1,
  },
});

const graphActivities = proxyActivities<
  ReturnType<typeof createGraphActivities>
>({
  startToCloseTimeout: "20 second",
  retry: {
    maximumAttempts: 3,
  },
});

export const createEmbeddings = async (
  params: CreateEmbeddingsParams,
): Promise<CreateEmbeddingsReturn> => {
  return await aiActivities.createEmbeddingsActivity(params);
};

type UpdateDataTypeEmbeddingsParams = {
  authentication: {
    actorId: ActorEntityUuid;
  };
} & (
  | {
      dataTypes: DataTypeWithMetadata[];
    }
  | {
      filter: Filter;
    }
);

export const updateDataTypeEmbeddings = async (
  params: UpdateDataTypeEmbeddingsParams,
): Promise<OpenAI.CreateEmbeddingResponse.Usage> => {
  const temporalAxes = {
    pinned: {
      axis: "transactionTime",
      timestamp: null,
    },
    variable: {
      axis: "decisionTime",
      interval: {
        start: null,
        end: null,
      },
    },
  } as const;

  let dataTypes: DataTypeWithMetadata[];

  const usage: OpenAI.CreateEmbeddingResponse.Usage = {
    prompt_tokens: 0,
    total_tokens: 0,
  };

  if ("dataTypes" in params) {
    dataTypes = params.dataTypes;
  } else {
    const response = await graphActivities.queryDataTypes({
      authentication: params.authentication,
      request: {
        filter: params.filter,
        temporalAxes,
      },
    });
    dataTypes = response.dataTypes;
  }

  for (const dataType of dataTypes) {
    const generatedEmbeddings =
      await aiActivities.createDataTypeEmbeddingsActivity({
        dataType,
      });

    await graphActivities.updateDataTypeEmbeddings({
      authentication: params.authentication,
      embedding: generatedEmbeddings.embedding,
      dataTypeId: dataType.schema.$id,
      updatedAtTransactionTime:
        dataType.metadata.temporalVersioning.transactionTime.start.limit,
      reset: true,
    });

    usage.prompt_tokens += generatedEmbeddings.usage.prompt_tokens;
    usage.total_tokens += generatedEmbeddings.usage.total_tokens;
  }

  return usage;
};

type UpdatePropertyTypeEmbeddingsParams = {
  authentication: {
    actorId: ActorEntityUuid;
  };
} & (
  | {
      propertyTypes: PropertyTypeWithMetadata[];
    }
  | {
      filter: Filter;
    }
);

export const updatePropertyTypeEmbeddings = async (
  params: UpdatePropertyTypeEmbeddingsParams,
): Promise<OpenAI.CreateEmbeddingResponse.Usage> => {
  const temporalAxes = {
    pinned: {
      axis: "transactionTime",
      timestamp: null,
    },
    variable: {
      axis: "decisionTime",
      interval: {
        start: null,
        end: null,
      },
    },
  } as const;

  let propertyTypes: PropertyTypeWithMetadata[];

  const usage: OpenAI.CreateEmbeddingResponse.Usage = {
    prompt_tokens: 0,
    total_tokens: 0,
  };

  if ("propertyTypes" in params) {
    propertyTypes = params.propertyTypes;
  } else {
    const response = await graphActivities.queryPropertyTypes({
      authentication: params.authentication,
      request: {
        filter: params.filter,
        temporalAxes,
      },
    });
    propertyTypes = response.propertyTypes;
  }

  for (const propertyType of propertyTypes) {
    const generatedEmbeddings =
      await aiActivities.createPropertyTypeEmbeddingsActivity({
        propertyType,
      });

    await graphActivities.updatePropertyTypeEmbeddings({
      authentication: params.authentication,
      embedding: generatedEmbeddings.embedding,
      propertyTypeId: propertyType.schema.$id,
      updatedAtTransactionTime:
        propertyType.metadata.temporalVersioning.transactionTime.start.limit,
      reset: true,
    });

    usage.prompt_tokens += generatedEmbeddings.usage.prompt_tokens;
    usage.total_tokens += generatedEmbeddings.usage.total_tokens;
  }

  return usage;
};

type UpdateEntityTypeEmbeddingsParams = {
  authentication: {
    actorId: ActorEntityUuid;
  };
} & (
  | {
      entityTypes: EntityTypeWithMetadata[];
    }
  | {
      filter: Filter;
    }
);

export const updateEntityTypeEmbeddings = async (
  params: UpdateEntityTypeEmbeddingsParams,
): Promise<OpenAI.CreateEmbeddingResponse.Usage> => {
  const temporalAxes = {
    pinned: {
      axis: "transactionTime",
      timestamp: null,
    },
    variable: {
      axis: "decisionTime",
      interval: {
        start: null,
        end: null,
      },
    },
  } as const;

  let entityTypes: EntityTypeWithMetadata[];

  const usage: OpenAI.CreateEmbeddingResponse.Usage = {
    prompt_tokens: 0,
    total_tokens: 0,
  };

  if ("entityTypes" in params) {
    entityTypes = params.entityTypes;
  } else {
    const response = await graphActivities.queryEntityTypes({
      authentication: params.authentication,
      request: {
        filter: params.filter,
        temporalAxes,
      },
    });
    entityTypes = response.entityTypes;
  }

  for (const entityType of entityTypes) {
    const generatedEmbeddings =
      await aiActivities.createEntityTypeEmbeddingsActivity({
        entityType,
      });

    await graphActivities.updateEntityTypeEmbeddings({
      authentication: params.authentication,
      entityTypeId: entityType.schema.$id,
      embedding: generatedEmbeddings.embedding,
      updatedAtTransactionTime:
        entityType.metadata.temporalVersioning.transactionTime.start.limit,
      reset: true,
    });

    usage.prompt_tokens += generatedEmbeddings.usage.prompt_tokens;
    usage.total_tokens += generatedEmbeddings.usage.total_tokens;
  }

  return usage;
};

/** Number of entities to fetch per query batch */
const ENTITY_BATCH_SIZE = 100;

type UpdateEntityEmbeddingsParams = {
  authentication: {
    actorId: ActorEntityUuid;
  };
  /**
   * Properties to exclude from embedding generation, keyed by entity type base URL.
   * Values are arrays of property type base URLs to exclude for that entity type.
   */
  embeddingExclusions?: Record<BaseUrl, BaseUrl[]>;
  /** Cursor for pagination (used with continueAsNew) */
  cursor?: EntityQueryCursor;
  /** Accumulated usage from previous continues */
  accumulatedUsage?: OpenAI.CreateEmbeddingResponse.Usage;
} & (
  | {
      entityIds: EntityId[];
    }
  | {
      filter: Filter;
    }
);

export const updateEntityEmbeddings = async (
  params: UpdateEntityEmbeddingsParams,
): Promise<OpenAI.CreateEmbeddingResponse.Usage> => {
  const usage: OpenAI.CreateEmbeddingResponse.Usage = {
    prompt_tokens: params.accumulatedUsage?.prompt_tokens ?? 0,
    total_tokens: params.accumulatedUsage?.total_tokens ?? 0,
  };

  // Case 1: Entity IDs provided directly - pass straight to activity
  if ("entityIds" in params) {
    if (params.entityIds.length === 0) {
      return usage;
    }

    // Activity handles everything: fetch, filter FlowRun/empty, create embeddings, store
    const embeddingUsage =
      await aiActivities.createAndStoreEntityEmbeddingsActivity({
        authentication: params.authentication,
        entityIds: params.entityIds,
        embeddingExclusions: params.embeddingExclusions,
      });

    usage.prompt_tokens += embeddingUsage.prompt_tokens;
    usage.total_tokens += embeddingUsage.total_tokens;
    return usage;
  }

  // Case 2: Filter provided - need to query for pagination
  const temporalAxes = {
    pinned: {
      axis: "transactionTime",
      timestamp: null,
    },
    variable: {
      axis: "decisionTime",
      interval: {
        start: null,
        end: null,
      },
    },
  } as const;

  // Exclude FlowRun and empty entities at query level for efficient pagination
  const filter: Filter = {
    all: [
      params.filter,
      {
        notEqual: [
          { path: ["type", "versionedUrl"] },
          { parameter: systemEntityTypes.flowRun.entityTypeId },
        ],
      },
      { notEqual: [{ path: ["properties"] }, { parameter: {} }] },
    ],
  };

  let cursor = params.cursor;

  // Process batches until Temporal suggests continuing as new or we run out of entities
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- cursor is reassigned in the loop
  while (true) {
    const serializedResponse = await graphActivities.queryEntities({
      authentication: params.authentication,
      request: {
        filter,
        temporalAxes,
        includeDrafts: false,
        includePermissions: false,
        cursor,
        limit: ENTITY_BATCH_SIZE,
      },
    });
    const response = deserializeQueryEntitiesResponse(serializedResponse);
    const entities = response.entities;

    if (entities.length === 0) {
      break;
    }

    // Extract entity IDs and pass batch to the activity
    const entityIds = entities.map(
      (entity) => entity.metadata.recordId.entityId,
    );

    // Activity handles: fetch, create embeddings, store
    const embeddingUsage =
      await aiActivities.createAndStoreEntityEmbeddingsActivity({
        authentication: params.authentication,
        entityIds,
        embeddingExclusions: params.embeddingExclusions,
      });

    usage.prompt_tokens += embeddingUsage.prompt_tokens;
    usage.total_tokens += embeddingUsage.total_tokens;

    if (!response.cursor) {
      break;
    }

    // Let Temporal decide when workflow history is getting too large
    if (workflowInfo().continueAsNewSuggested) {
      await continueAsNew<typeof updateEntityEmbeddings>({
        ...params,
        cursor: response.cursor,
        accumulatedUsage: usage,
      });
    }

    cursor = response.cursor;
  }

  return usage;
};

export const updateAllDataTypeEmbeddings =
  async (): Promise<OpenAI.CreateEmbeddingResponse.Usage> =>
    await updateDataTypeEmbeddings({
      authentication: {
        actorId: publicUserAccountId,
      },
      filter: {
        equal: [{ path: ["version"] }, { parameter: "latest" }],
      },
    });

export const updateAllPropertyTypeEmbeddings =
  async (): Promise<OpenAI.CreateEmbeddingResponse.Usage> =>
    await updatePropertyTypeEmbeddings({
      authentication: {
        actorId: publicUserAccountId,
      },
      filter: {
        equal: [{ path: ["version"] }, { parameter: "latest" }],
      },
    });

export const updateAllEntityTypeEmbeddings =
  async (): Promise<OpenAI.CreateEmbeddingResponse.Usage> =>
    await updateEntityTypeEmbeddings({
      authentication: {
        actorId: publicUserAccountId,
      },
      filter: {
        equal: [{ path: ["version"] }, { parameter: "latest" }],
      },
    });

/** Number of webs to process in parallel per batch */
const WEBS_PER_BATCH = 10;

type UpdateAllEntityEmbeddingsParams = {
  /** Accumulated usage from previous continues */
  accumulatedUsage?: OpenAI.CreateEmbeddingResponse.Usage;
  /**
   * Properties to exclude from embedding generation, keyed by entity type base URL.
   * Values are arrays of property type base URLs to exclude for that entity type.
   */
  embeddingExclusions?: Record<BaseUrl, BaseUrl[]>;
  /** Cursor for paginating through system machines (used with continueAsNew) */
  machineCursor?: EntityQueryCursor;
};

export const updateAllEntityEmbeddings = async (
  params?: UpdateAllEntityEmbeddingsParams,
): Promise<OpenAI.CreateEmbeddingResponse.Usage> => {
  const usage: OpenAI.CreateEmbeddingResponse.Usage = {
    prompt_tokens: params?.accumulatedUsage?.prompt_tokens ?? 0,
    total_tokens: params?.accumulatedUsage?.total_tokens ?? 0,
  };

  let machineCursor = params?.machineCursor;

  // Process batches of webs, paginating through system machines
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- cursor is reassigned in the loop
  while (true) {
    const { machineIds, cursor: nextCursor } =
      await graphActivities.getSystemMachineIds({
        cursor: machineCursor,
        limit: WEBS_PER_BATCH,
      });

    if (machineIds.length === 0) {
      break;
    }

    // Execute batch of child workflows in parallel
    const results = await Promise.all(
      machineIds.map((systemMachineId) => {
        const [webId, machineActorId] = splitEntityId(systemMachineId);
        return executeChild(updateEntityEmbeddings, {
          args: [
            {
              authentication: { actorId: machineActorId as MachineId },
              filter: {
                equal: [{ path: ["webId"] }, { parameter: webId }],
              },
              embeddingExclusions: params?.embeddingExclusions,
            },
          ],
          workflowId: `update-entity-embeddings-${workflowInfo().workflowId}-${webId}`,
        });
      }),
    );

    for (const webUsage of results) {
      usage.prompt_tokens += webUsage.prompt_tokens;
      usage.total_tokens += webUsage.total_tokens;
    }

    if (!nextCursor) {
      break;
    }

    // Let Temporal decide when workflow history is getting too large
    if (workflowInfo().continueAsNewSuggested) {
      await continueAsNew<typeof updateAllEntityEmbeddings>({
        accumulatedUsage: usage,
        embeddingExclusions: params?.embeddingExclusions,
        machineCursor: nextCursor,
      });
    }

    machineCursor = nextCursor;
  }

  return usage;
};

export const parseTextFromFile = async (
  params: ParseTextFromFileParams,
): Promise<void> => {
  await aiActivities.parseTextFromFileActivity(params);
};

export const runFlow = runFlowWorkflow;
