import { typedValues } from "@local/advanced-types/typed-entries";
import { getSimpleEntityType } from "@local/hash-backend-utils/simplified-graph";
import { queryEntityTypeSubgraph } from "@local/hash-graph-sdk/entity-type";
import {
  almostFullOntologyResolveDepths,
  currentTimeInstantTemporalAxes,
} from "@local/hash-isomorphic-utils/graph-queries";

import { stringifyResults } from "./shared/stringify-results";

import type { SimpleEntityType } from "@local/hash-backend-utils/simplified-graph";
import type { RequestHandler } from "express";

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

  const { webUuids } = req.body;

  // TODO(BE-624): semantic search is disabled here, so the `query` field is currently accepted but
  // ignored. The `cosineDistance` filter was removed because it is no longer supported on the
  // generic filter — migrate this endpoint to the dedicated `searchEntityTypes` endpoint to restore it.
  const queryResponse: GptQueryTypesResponseBody =
    await queryEntityTypeSubgraph(
      req.context.graphApi,
      { actorId: user.accountId },
      {
        filter: {
          all: [
            ...(webUuids?.length
              ? [
                  {
                    any: webUuids.map((webUuid) => ({
                      equal: [{ path: ["webId"] }, { parameter: webUuid }],
                    })),
                  },
                ]
              : []),
          ],
        },
        temporalAxes: currentTimeInstantTemporalAxes,
        graphResolveDepths: {
          ...almostFullOntologyResolveDepths,
          constrainsLinkDestinationsOn: 4,
          constrainsLinksOn: 4,
        },
        traversalPaths: [],
      },
    ).then(async ({ subgraph }) => {
      const entityTypes: SimpleEntityType[] = [];

      const vertices = typedValues(subgraph.vertices).flatMap((vertex) =>
        typedValues(vertex),
      );

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
