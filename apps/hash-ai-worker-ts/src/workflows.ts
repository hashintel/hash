import {
  type ActorEntityUuid,
  type BaseUrl,
  type DataTypeWithMetadata,
  type Entity,
  type EntityTypeWithMetadata,
  extractBaseUrl,
  type PropertyTypeWithMetadata,
} from "@blockprotocol/type-system";
import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";
import type {
  Entity as GraphApiEntity,
  EntityQueryCursor,
  Filter,
} from "@local/hash-graph-client";
import type {
  CreateEmbeddingsParams,
  CreateEmbeddingsReturn,
} from "@local/hash-graph-sdk/embeddings";
import {
  deserializeQueryEntitiesResponse,
  HashEntity,
} from "@local/hash-graph-sdk/entity";
import {
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { ParseTextFromFileParams } from "@local/hash-isomorphic-utils/parse-text-from-file-types";
import {
  ActivityCancellationType,
  proxyActivities,
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

type UpdateEntityEmbeddingsParams = {
  authentication: {
    actorId: ActorEntityUuid;
  };
} & (
  | {
      entities: GraphApiEntity[];
    }
  | {
      filter: Filter;
    }
);

export const updateEntityEmbeddings = async (
  params: UpdateEntityEmbeddingsParams,
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

  let entities: Entity[];
  let cursor: EntityQueryCursor | undefined | null = undefined;

  const usage: OpenAI.CreateEmbeddingResponse.Usage = {
    prompt_tokens: 0,
    total_tokens: 0,
  };

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (true) {
    if ("entities" in params) {
      entities = params.entities.map((entity) => new HashEntity(entity));
    } else {
      const serializedResponse = await graphActivities.queryEntities({
        authentication: params.authentication,
        request: {
          filter: params.filter,
          temporalAxes,
          includeDrafts: true,
          includePermissions: false,
          cursor,
          limit: 100,
        },
      });
      const response = deserializeQueryEntitiesResponse(serializedResponse);
      cursor = response.cursor;
      entities = response.entities;
    }

    if (entities.length === 0) {
      break;
    }

    for (const entity of entities) {
      /**
       * Don't try to create embeddings for `FlowRun` entities, due to the size
       * of their property values.
       *
       * @todo: consider having a general approach for declaring which entity/property
       * types should be skipped when generating embeddings.
       */
      if (
        entity.metadata.entityTypeIds.includes(
          systemEntityTypes.flowRun.entityTypeId,
        )
      ) {
        continue;
      }

      // TODO: The subgraph library does not have the required methods to do this client side so for simplicity we're
      //       just making another request here. We should add the required methods to the library and do this client
      //       side.
      const { subgraph } = await graphActivities.queryEntityTypeSubgraph({
        authentication: params.authentication,
        request: {
          filter: {
            any: entity.metadata.entityTypeIds.map((entityTypeId) => ({
              equal: [{ path: ["versionedUrl"] }, { parameter: entityTypeId }],
            })),
          },
          graphResolveDepths: {
            inheritsFrom: 255,
            constrainsPropertiesOn: 1,
          },
          traversalPaths: [],
          temporalAxes,
        },
      });

      const propertyTypes = await graphActivities.getSubgraphPropertyTypes({
        subgraph,
      });

      const generatedEmbeddings =
        await aiActivities.createEntityEmbeddingsActivity({
          entityProperties: entity.properties,
          propertyTypes,
        });

      if (generatedEmbeddings.embeddings.length > 0) {
        await graphActivities.updateEntityEmbeddings({
          authentication: params.authentication,
          entityId: entity.metadata.recordId.entityId,
          embeddings: generatedEmbeddings.embeddings,
          updatedAtTransactionTime:
            entity.metadata.temporalVersioning.transactionTime.start.limit,
          updatedAtDecisionTime:
            entity.metadata.temporalVersioning.decisionTime.start.limit,
          reset: true,
        });
      }

      usage.prompt_tokens += generatedEmbeddings.usage.prompt_tokens;
      usage.total_tokens += generatedEmbeddings.usage.total_tokens;
    }

    if (!cursor) {
      break;
    }
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
        all: [
          {
            exists: { path: ["embedding"] },
          },
          {
            equal: [{ path: ["version"] }, { parameter: "latest" }],
          },
        ],
      },
    });

export const updateAllPropertyTypeEmbeddings =
  async (): Promise<OpenAI.CreateEmbeddingResponse.Usage> =>
    await updatePropertyTypeEmbeddings({
      authentication: {
        actorId: publicUserAccountId,
      },
      filter: {
        all: [
          {
            exists: { path: ["embedding"] },
          },
          {
            equal: [{ path: ["version"] }, { parameter: "latest" }],
          },
        ],
      },
    });

export const updateAllEntityTypeEmbeddings =
  async (): Promise<OpenAI.CreateEmbeddingResponse.Usage> =>
    await updateEntityTypeEmbeddings({
      authentication: {
        actorId: publicUserAccountId,
      },
      filter: {
        all: [
          {
            exists: { path: ["embedding"] },
          },
          {
            equal: [{ path: ["version"] }, { parameter: "latest" }],
          },
        ],
      },
    });

export const updateAllEntityEmbeddings =
  async (): Promise<OpenAI.CreateEmbeddingResponse.Usage> => {
    const accountIds = await graphActivities.getUserAccountIds();

    const usage: OpenAI.CreateEmbeddingResponse.Usage = {
      prompt_tokens: 0,
      total_tokens: 0,
    };

    for (const accountId of accountIds) {
      const this_usage = await updateEntityEmbeddings({
        authentication: { actorId: accountId },
        filter: {
          all: [
            {
              exists: { path: ["embedding"] },
            },
            {
              // Only embeddings for non-empty properties are generated
              notEqual: [{ path: ["properties"] }, { parameter: {} }],
            },
          ],
        },
      });
      usage.prompt_tokens += this_usage.prompt_tokens;
      usage.total_tokens += this_usage.total_tokens;
    }

    return usage;
  };

export const parseTextFromFile = async (
  params: ParseTextFromFileParams,
): Promise<void> => {
  await aiActivities.parseTextFromFileActivity(params);
};

export const runFlow = runFlowWorkflow;
