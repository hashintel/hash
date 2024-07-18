import { typedValues } from "@local/advanced-types/typed-entries";
import type { SimpleEntityType } from "@local/hash-backend-utils/simplified-graph";
import { getSimpleEntityType } from "@local/hash-backend-utils/simplified-graph";
import type {
  CreateEmbeddingsParams,
  CreateEmbeddingsReturn,
} from "@local/hash-isomorphic-utils/ai-inference-types";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { mapGraphApiSubgraphToSubgraph } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type { RequestHandler } from "express";

import { stringifyResults } from "./shared/stringify-results";

export type GptQueryTypesRequestBody = {
  /**
   * Limit the response to types within the specified webs, identified by the web's uuid.
   * Note that a user may have entities of types from outside their web.
   */
  webUuids?: string[];
  /**
   * A natural language text query that looks for entity types which are semantically close to the query.
   */
  query?: string;
};

export type GptQueryTypesResponseBody =
  | { error: string }
  | {
      /**
       * The entity types that various entities in this response belong to.
       * Each describes the properties and outgoing links that an entity of this type may have.
       * They also have a unique id, which contains the name of the web that the entity type belongs to prefixed by an
       * @, e.g. `@hash`
       */
      entityTypes: string;
    };

export const gptQueryTypes: RequestHandler<
  Record<string, never>,
  GptQueryTypesResponseBody,
  GptQueryTypesRequestBody
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
> = async (req, res) => {
  const { user } = req;

  if (!user) {
    res.status(401).send({ error: "No authenticated user" });
    return;
  }

  if (!user.isAccountSignupComplete) {
    res.status(401).send({ error: "User has not completed signup." });
    return;
  }

  const { query, webUuids } = req.body;

  const semanticSearchString = query
    ? await req.context.temporalClient.workflow
        .execute<
          (params: CreateEmbeddingsParams) => Promise<CreateEmbeddingsReturn>
        >("createEmbeddings", {
          taskQueue: "ai",
          args: [
            {
              input: [query],
            },
          ],
          workflowId: generateUuid(),
        })
        .then(({ embeddings }) => embeddings[0])
    : null;

  const queryResponse: GptQueryTypesResponseBody = await req.context.graphApi
    .getEntityTypeSubgraph(user.accountId, {
      filter: {
        all: [
          ...(webUuids?.length
            ? [
                {
                  any: webUuids.map((webUuid) => ({
                    equal: [{ path: ["ownedById"] }, { parameter: webUuid }],
                  })),
                },
              ]
            : []),
          ...(semanticSearchString
            ? [
                {
                  cosineDistance: [
                    { path: ["embedding"] },
                    { parameter: semanticSearchString },
                    { parameter: 0.9 },
                  ],
                },
              ]
            : []),
        ],
      },
      includeDrafts: false,
      temporalAxes: currentTimeInstantTemporalAxes,
      graphResolveDepths: {
        inheritsFrom: { outgoing: 255 },
        constrainsValuesOn: { outgoing: 255 },
        constrainsPropertiesOn: { outgoing: 255 },
        constrainsLinksOn: { outgoing: 255 },
        constrainsLinkDestinationsOn: { outgoing: 255 },
        isOfType: { outgoing: 1 },
        hasLeftEntity: { incoming: 0, outgoing: 0 },
        hasRightEntity: { incoming: 0, outgoing: 0 },
      },
    })
    .then(async ({ data: response }) => {
      const entityTypes: SimpleEntityType[] = [];

      const subgraph = mapGraphApiSubgraphToSubgraph(
        response.subgraph,
        user.accountId,
      );

      const vertices = typedValues(subgraph.vertices)
        .map((vertex) => typedValues(vertex))
        .flat();

      for (const vertex of vertices) {
        if (vertex.kind === "entityType") {
          const entityType = entityTypes.find(
            (type) => type.entityTypeId === vertex.inner.schema.$id,
          );

          if (!entityType) {
            entityTypes.push(
              getSimpleEntityType(subgraph, vertex.inner.schema.$id),
            );
          }
        }
      }

      return {
        entityTypes: `
          ---- Entity Types ----
        ${stringifyResults(entityTypes)}`,
      };
    });

  res.status(200).json(queryResponse);
};
