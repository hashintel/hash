import { typedEntries } from "@local/advanced-types/typed-entries";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { systemPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import {
  OrganizationProperties,
  UserProperties,
} from "@local/hash-isomorphic-utils/system-types/shared";
import {
  Entity,
  EntityId,
  entityIdFromOwnedByIdAndEntityUuid,
  EntityUuid,
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
  Subgraph,
} from "@local/hash-subgraph";
import {
  getEntityTypeById,
  getOutgoingLinksForEntity,
  getPropertyTypeForEntity,
  mapGraphApiSubgraphToSubgraph,
} from "@local/hash-subgraph/stdlib";
import { Session } from "@ory/client";
import { RequestHandler } from "express";

import { ImpureGraphContext } from "../../graph/context-types";
import { getLatestEntityById } from "../../graph/knowledge/primitive/entity";
import { User } from "../../graph/knowledge/system-types/user";
import { VaultClient } from "../../vault";
import { getUserSimpleWebs, SimpleWeb } from "./shared/webs";

// @todo make this not required –– possibly related to https://github.com/vega/ts-json-schema-generator/issues/1851
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      context: ImpureGraphContext<true, true> & {
        vaultClient?: VaultClient;
      };
      session: Session | undefined;
      user: User | undefined;
    }
  }
}

export type GptQueryEntitiesRequestBody = {
  /**
   * The titles of specific types of entities to retrieve. Types are typically capitalized, e.g. User, Organization.
   * You may omit this field to retrieve all entities visible to the user, but this may be a slow operation.
   * If types is omitted, a 'webs' or 'entityIds' filter should be provided to limit the number of entities returned.
   */
  types?: string[];
  /**
   * Limit the response to entities within the specified webs, identified by the web's uuid.
   * A 'web' belongs to a user or an organization, and entities belong to specific webs.
   * A user may refer to 'my web' or 'Acme Corp's web' to refer to the web they are interested in.
   * They may also refer to 'my graph' or 'Acme's graph'.
   */
  webIds?: string[];
  /**
   * Limit the response to the entities with the specified entityIds.
   * Use this filter if you want to explore the graph rooted at specific entities.
   */
  entityIds?: string[];
  /**
   * The depth of the graph to explore from the entities matched by the filter.
   * For example, a depth of 2 will return the entities of the requested type / webs / entityIds,
   * plus any entities linking to or from them, and any entities linking to or from _those_ entities.
   * A depth of 0 will return only the entities matched by the filter.
   *
   * Users will typically benefit from having MORE data returned, so err on the side of not specifying a lower depth
   * unless it seems particularly beneficial to do so.
   *
   * If a given entity has no links in the return data, it may be that it DOES have links in the graph,
   * but the traversal depth was not sufficient to reach them.
   *
   * @default 4
   */
  traversalDepth?: number;
  /**
   * Whether or not to include draft entities
   * @default false
   */
  includeDrafts?: boolean;
};

type BaseSimpleEntityFields = {
  /** Whether or not the entity is archived */
  archived: boolean;
  /** The unique id for the entity, to identify it for future requests or as the target of links from other entities */
  entityId: string;
  entityType: {
    title: string;
    description: string;
  };
  properties: {
    [key: string]: {
      propertyDescription: string;
      propertyTitle: string;
      value: unknown;
    };
  };
};

export type SimpleLink = BaseSimpleEntityFields & {
  /** The unique entityId of the target of this link. */
  targetEntityId: string;
};

export type SimpleEntity = BaseSimpleEntityFields & {
  /**
   * Links from the entity to other entities. The link itself can have properties, containing data about the relationship.
   */
  links: SimpleLink[];
  /**
   * The web that the entity belongs to
   */
  web: SimpleWeb;
};

export type GptQueryEntitiesResponseBody =
  | { error: string }
  | {
      /**
       * Entities returned by the query. As well as those entities matching the filter, the response may include
       * entities linked to those entities, under the 'links' property of the source entity.
       * The extent to which the graph is explored is determined by the 'traversalDepth' parameter.
       * If the return data contains no links from an entity, it may be that there ARE links in the graph,
       * but the traversalDepths were insufficient to reach them. Another query rooted at the entity,
       * or with higher traversal depths, may reveal more links.
       *
       * Entities' properties are returned under the 'properties' property, with the property title as the key.
       * Properties have a title and description explaining the property, and a value.
       *
       * Each entity has an 'entityType' it belongs to, with a title and description explaining them.
       */
      entities: SimpleEntity[];
    };

const createBaseSimpleEntityFields = (
  subgraph: Subgraph,
  entity: Entity,
): BaseSimpleEntityFields => {
  const typeSchema = getEntityTypeById(subgraph, entity.metadata.entityTypeId);
  if (!typeSchema) {
    throw new Error("Entity type not found in subgraph");
  }

  const entityType: SimpleEntity["entityType"] = {
    title: typeSchema.schema.title,
    description: typeSchema.schema.description ?? "",
  };

  const properties: SimpleEntity["properties"] = {};
  for (const [propertyBaseUrl, propertyValue] of typedEntries(
    entity.properties,
  )) {
    const { propertyType } = getPropertyTypeForEntity(
      subgraph,
      entity.metadata.entityTypeId,
      propertyBaseUrl,
    );
    properties[propertyType.title] = {
      propertyDescription: propertyType.description ?? "",
      propertyTitle: propertyType.title,
      value: propertyValue,
    };
  }

  return {
    archived: entity.metadata.archived,
    entityId: entity.metadata.recordId.entityId,
    entityType,
    properties,
  };
};

export const gptQueryEntities: RequestHandler<
  Record<string, never>,
  GptQueryEntitiesResponseBody,
  GptQueryEntitiesRequestBody
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
> = async (req, res) => {
  const { user } = req;

  if (!user) {
    res.status(401).send({ error: "No authenticated user" });
    return;
  }

  if (!user.shortname) {
    res.status(401).send({ error: "User has not completed signup." });
    return;
  }

  const { types, entityIds, webIds, traversalDepth, includeDrafts } = req.body;

  const depth = traversalDepth ?? 2;

  const queryResponse: GptQueryEntitiesResponseBody = await req.context.graphApi
    .getEntitiesByQuery(user.accountId, {
      query: {
        filter: {
          all: [
            ...(types
              ? [
                  {
                    any: types.map((type) => ({
                      equal: [
                        {
                          path: [
                            "type",
                            // Sometimes the GPT sends the type's id instead of a title
                            type.startsWith("http://") ||
                            type.startsWith("https://")
                              ? "versionedUrl"
                              : "title",
                          ],
                        },
                        { parameter: type },
                      ],
                    })),
                  },
                ]
              : []),
            ...(entityIds
              ? [
                  {
                    any: entityIds.map((entityId) => ({
                      equal: [
                        { path: ["uuid"] },
                        {
                          parameter: extractEntityUuidFromEntityId(
                            entityId as EntityId,
                          ),
                        },
                      ],
                    })),
                  },
                ]
              : []),
            ...(webIds
              ? [
                  {
                    any: webIds.map((webId) => ({
                      equal: [{ path: ["ownedById"] }, { parameter: webId }],
                    })),
                  },
                ]
              : []),
            { equal: [{ path: ["archived"] }, { parameter: false }] },
          ],
        },
        includeDrafts: includeDrafts ?? false,
        temporalAxes: currentTimeInstantTemporalAxes,
        graphResolveDepths: {
          inheritsFrom: { outgoing: 255 },
          constrainsValuesOn: { outgoing: 255 },
          constrainsPropertiesOn: { outgoing: 255 },
          constrainsLinksOn: { outgoing: 255 },
          constrainsLinkDestinationsOn: { outgoing: 255 },
          isOfType: { outgoing: 1 },
          hasLeftEntity: { incoming: depth, outgoing: depth },
          hasRightEntity: { incoming: depth, outgoing: depth },
        },
      },
    })
    .then(async (response) => {
      const entities: SimpleEntity[] = [];

      const subgraph = mapGraphApiSubgraphToSubgraph(response.data.subgraph);

      const resolvedWebs = await getUserSimpleWebs(
        req.context,
        {
          actorId: user.accountId,
        },
        { user },
      );

      const vertices = Object.values(subgraph.vertices)
        .map((vertex) => Object.values(vertex))
        .flat();

      for (const vertex of vertices) {
        if (vertex.kind === "entity") {
          if (vertex.inner.linkData) {
            /**
             * We add links under a 'links' property on the source entity, to make it easier for the model to identify
             * them.
             */
            continue;
          }

          const webOwnedById = extractOwnedByIdFromEntityId(
            vertex.inner.metadata.recordId.entityId as EntityId,
          );

          let web = resolvedWebs.find(
            (resolvedWeb) => resolvedWeb.uuid === webOwnedById,
          );

          if (!web) {
            const owningEntity = await getLatestEntityById(
              req.context,
              { actorId: user.accountId },
              {
                entityId: entityIdFromOwnedByIdAndEntityUuid(
                  webOwnedById,
                  webOwnedById as unknown as EntityUuid,
                ),
              },
            );

            const isUser =
              owningEntity.metadata.entityTypeId.includes("/user/");

            web = {
              type: isUser ? "User" : "Organization",
              name: (
                owningEntity.properties as
                  | UserProperties
                  | OrganizationProperties
              )[systemPropertyTypes.shortname.propertyTypeBaseUrl]!,
              uuid: webOwnedById,
            };

            resolvedWebs.push(web);
          }

          const baseFields = createBaseSimpleEntityFields(
            subgraph,
            vertex.inner,
          );

          const links: SimpleEntity["links"] = [];
          const linksFromEntity = getOutgoingLinksForEntity(
            subgraph,
            vertex.inner.metadata.recordId.entityId,
          );
          for (const link of linksFromEntity) {
            if (!link.linkData) {
              throw new Error(
                `Link with entityId ${link.metadata.recordId.entityId} has no linkData`,
              );
            }
            links.push({
              ...createBaseSimpleEntityFields(subgraph, link),
              targetEntityId: link.linkData.rightEntityId,
            });
          }

          const entity = {
            ...baseFields,
            links,
            web,
          };

          entities.push(entity);
        }
      }

      return {
        entities,
      };
    });

  res.status(200).json(queryResponse);
};
