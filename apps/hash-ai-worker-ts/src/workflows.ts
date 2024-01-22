import type { Filter } from "@local/hash-graph-client";
import type { InferEntitiesCallerParams } from "@local/hash-isomorphic-utils/ai-inference-types";
import type { AccountId, Entity } from "@local/hash-subgraph";
import { CancelledFailure } from "@temporalio/common";
import {
  ActivityCancellationType,
  ActivityFailure,
  isCancellation,
  proxyActivities,
} from "@temporalio/workflow";
import { CreateEmbeddingResponse } from "openai/resources";

import { createAiActivities, createGraphActivities } from "./activities";

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
  startToCloseTimeout: "10 second",
  retry: {
    maximumAttempts: 3,
  },
});

export const inferEntities = async (params: InferEntitiesCallerParams) => {
  try {
    return await aiActivities.inferEntitiesActivity(params);
  } catch (err) {
    if (isCancellation(err) && ActivityFailure.is(err)) {
      if (
        "cause" in (err as Error) &&
        CancelledFailure.is(err.cause) &&
        typeof err.cause.details[0] === "object" &&
        err.cause.details[0] !== null &&
        "code" in err.cause.details[0]
      ) {
        /**
         * We've been given a cancellation failure with the return in the cause's details, return it.
         *
         * Ideally we'd throw the `CancelledFailure` error here, so that Temporal treats it as a cancellation,
         * but the client doesn't see the `details` if we do that for some reason.
         * @see https://temporalio.slack.com/archives/C01DKSMU94L/p1705927971571849
         */
        return err.cause.details[0];
      }
    }
    throw err;
  }
};

type UpdateEntityEmbeddingsParams = {
  authentication: {
    actorId: AccountId;
  };
} & (
  | {
      entities: Entity[];
    }
  | {
      filter: Filter;
    }
);

export const updateEntityEmbeddings = async (
  params: UpdateEntityEmbeddingsParams,
): Promise<CreateEmbeddingResponse.Usage> => {
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

  if ("entities" in params) {
    entities = params.entities;
  } else {
    const subgraph = await graphActivities.getEntitiesByQuery({
      authentication: params.authentication,
      query: {
        filter: params.filter,
        graphResolveDepths: {
          inheritsFrom: { outgoing: 0 },
          constrainsValuesOn: { outgoing: 0 },
          constrainsPropertiesOn: { outgoing: 0 },
          constrainsLinksOn: { outgoing: 0 },
          constrainsLinkDestinationsOn: { outgoing: 0 },
          isOfType: { outgoing: 0 },
          hasLeftEntity: { incoming: 0, outgoing: 0 },
          hasRightEntity: { incoming: 0, outgoing: 0 },
        },
        temporalAxes,
        includeDrafts: true,
      },
    });

    entities = await graphActivities.getSubgraphEntities({
      subgraph,
    });
  }

  const usage: CreateEmbeddingResponse.Usage = {
    prompt_tokens: 0,
    total_tokens: 0,
  };

  for (const entity of entities) {
    // TODO: The subgraph library does not have the required methods to do this client side so for simplicity we're
    //       just making another request here. We should add the required methods to the library and do this client
    //       side.
    const subgraph = await graphActivities.getEntityTypesByQuery({
      authentication: params.authentication,
      query: {
        filter: {
          equal: [
            { path: ["versionedUrl"] },
            { parameter: entity.metadata.entityTypeId },
          ],
        },
        graphResolveDepths: {
          inheritsFrom: { outgoing: 255 },
          constrainsValuesOn: { outgoing: 0 },
          constrainsPropertiesOn: { outgoing: 1 },
          constrainsLinksOn: { outgoing: 0 },
          constrainsLinkDestinationsOn: { outgoing: 0 },
          isOfType: { outgoing: 0 },
          hasLeftEntity: { incoming: 0, outgoing: 0 },
          hasRightEntity: { incoming: 0, outgoing: 0 },
        },
        temporalAxes,
        includeDrafts: false,
      },
    });

    const propertyTypes = await graphActivities.getSubgraphPropertyTypes({
      subgraph,
    });

    const generatedEmbeddings = await aiActivities.createEmbeddingsActivity({
      entityProperties: entity.properties,
      propertyTypes,
    });

    if (generatedEmbeddings.embeddings.length > 0) {
      await graphActivities.updateEntityEmbeddings({
        authentication: params.authentication,
        embeddings: generatedEmbeddings.embeddings.map((embedding) => ({
          ...embedding,
          entityId: entity.metadata.recordId.entityId,
        })),
        updatedAtTransactionTime:
          entity.metadata.temporalVersioning.transactionTime.start.limit,
        updatedAtDecisionTime:
          entity.metadata.temporalVersioning.decisionTime.start.limit,
      });
    }

    usage.prompt_tokens += generatedEmbeddings.usage.prompt_tokens;
    usage.total_tokens += generatedEmbeddings.usage.total_tokens;
  }

  return usage;
};
