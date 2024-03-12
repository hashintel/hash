import { typedEntries, typedKeys } from "@local/advanced-types/typed-entries";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { systemPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";
import {
  OrganizationProperties,
  UserProperties,
} from "@local/hash-isomorphic-utils/system-types/shared";
import {
  Entity,
  EntityId,
  entityIdFromOwnedByIdAndEntityUuid,
  EntityUuid,
  extractDraftIdFromEntityId,
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
  Subgraph,
} from "@local/hash-subgraph";
import {
  getEntityTypeById,
  getOutgoingLinksForEntity,
  getPropertyTypeById,
  getPropertyTypeForEntity,
  mapGraphApiSubgraphToSubgraph,
} from "@local/hash-subgraph/stdlib";
import { RequestHandler } from "express";

import { getLatestEntityById } from "../../graph/knowledge/primitive/entity";
import { getUserSimpleWebs, SimpleWeb } from "./shared/webs";

const stringifyResults = (
  items: SimpleWeb[] | SimpleEntityType[] | SimpleEntity[],
) =>
  items
    .map((item) =>
      Object.entries(item)
        .map(([key, value]) => `${key}: ${stringifyPropertyValue(value)}`)
        .join("\n"),
    )
    .join("---------------\n");

export type GptQueryEntitiesRequestBody = {
  /**
   * The titles of specific types of entities to retrieve. Types are typically capitalized, e.g. User, Organization.
   * You may omit this field to retrieve all entities visible to the user, but this may be a slow operation.
   * If types is omitted, a 'webs' or 'entityUuids' filter should be provided to limit the number of entities returned.
   */
  types?: string[];
  /**
   * Limit the response to entities within the specified webs, identified by the web's uuid.
   * A 'web' belongs to a user or an organization, and entities belong to specific webs.
   * A user may refer to 'my web' or 'Acme Corp's web' to refer to the web they are interested in.
   * They may also refer to 'my graph' or 'Acme's graph'.
   */
  webUuids?: string[];
  /**
   * Limit the response to the entities with the specified entityUuids.
   * Use this filter if you want to explore the graph rooted at specific entities.
   */
  entityUuids?: string[];
  /**
   * The depth of the graph to explore from the entities matched by the filter.
   * For example, a depth of 2 will return the entities of the requested type / webs / entityUuids,
   * plus any entities linking to or from them, and any entities linking to or from _those_ entities.
   * A depth of 0 will return only the entities matched by the filter.
   *
   * Users will typically benefit from having MORE data returned, so err on the side of not specifying a lower depth
   * unless it seems particularly beneficial to do so.
   *
   * If a given entity has no links in the return data, it may be that it DOES have links in the graph,
   * but the traversal depth was not sufficient to reach them.
   *
   * If an API response is too large, it is worth repeating it with a lower or 0 traversalDepth.
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

/**
 * A simplified object representing an entity type, which will be converted to plain text for the response.
 */
export type SimpleEntityType = {
  /** The entity type's title / name */
  title: string;
  /** A description of the entity type */
  description: string;
  /**
   * The properties that entities of this type may have – the keys are the property titles, and the values are the property
   * descriptions.
   */
  properties: Record<string, string>;
  /**
   * The links that entities of this type may have – the keys are the link titles, and the values are the link
   * descriptions.
   */
  links: Record<string, string>;
  /**
   * The unique id for this entity type. The name of the web it belongs to can be found in this id prefixed by an @,
   * e.g. `@hash` or `@alice`
   */
  entityTypeId: string;
};

type BaseSimpleEntityFields = {
  /** Whether or not the entity is in draft */
  draft: boolean;
  /** The unique id for the entity, to identify it for future requests or as the target of links from other entities */
  entityUuid: string;
  /** The title of the entity type this entity belongs to */
  entityType: string;
  /** The properties of the entity, with the property title as the key */
  properties: Record<string, unknown>;
};

export type SimpleLink = BaseSimpleEntityFields & {
  /** The unique entityUuid of the target of this link. */
  targetEntityUuid: string;
};

export type SimpleEntity = BaseSimpleEntityFields & {
  /**
   * Links from the entity to other entities. The link itself can have properties, containing data about the
   * relationship.
   */
  links: SimpleLink[];
  /**
   * The web that the entity belongs to
   */
  webUuid: string;
};

export type GptQueryEntitiesResponseBody =
  | { error: string }
  | {
      /**
       * Entities returned by the query. Each has:
       *
       * draft: Whether or not the entity is in draft
       * entityUuid: The unique id for the entity, to identify it for future requests or as the target of links from other entities
       * entityType: the title of the type it belongs to, which are further expanded on under 'entityTypes'
       * properties: the properties of the entity
       * links: outgoing links from the entity
       * webUuid: the uuid of the web that the entity belongs to
       *
       * The extent to which the graph is explored is determined by the 'traversalDepth' parameter.
       * If the return data contains no links from an entity, it may be that there ARE links in the graph,
       * but the traversalDepths were insufficient to reach them. Another query rooted at the entity,
       * or with higher traversal depths, may reveal more links.
       *
       * Each entity has an 'entityType' it belongs to, details of which can be found in the 'Entity Types' section.
       */
      entities: string;
      /**
       * The entity types that various entities in this response belong to.
       * Each describes the properties and outgoing links that an entity of this type may have.
       * They also have a unique id, which contains the name of the web that the entity type belongs to prefixed by an @, e.g. `@hash`
       */
      entityTypes: string;
      /** The webs that various entities in this response belong to */
      webs: string;
    };

const createBaseSimpleEntityFields = (
  subgraph: Subgraph,
  entity: Entity,
): BaseSimpleEntityFields => {
  const typeSchema = getEntityTypeById(subgraph, entity.metadata.entityTypeId);
  if (!typeSchema) {
    throw new Error("Entity type not found in subgraph");
  }

  const properties: SimpleEntity["properties"] = {};
  for (const [propertyBaseUrl, propertyValue] of typedEntries(
    entity.properties,
  )) {
    const { propertyType } = getPropertyTypeForEntity(
      subgraph,
      entity.metadata.entityTypeId,
      propertyBaseUrl,
    );
    properties[propertyType.title] = propertyValue;
  }

  return {
    draft: !!extractDraftIdFromEntityId(entity.metadata.recordId.entityId),
    entityUuid: extractEntityUuidFromEntityId(
      entity.metadata.recordId.entityId,
    ),
    entityType: typeSchema.schema.title,
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

  const { types, entityUuids, webUuids, traversalDepth, includeDrafts } =
    req.body;

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
            ...(entityUuids
              ? [
                  {
                    any: entityUuids.map((entityUuid) => ({
                      equal: [
                        { path: ["uuid"] },
                        {
                          parameter: entityUuid,
                        },
                      ],
                    })),
                  },
                ]
              : []),
            ...(webUuids
              ? [
                  {
                    any: webUuids.map((webUuid) => ({
                      equal: [{ path: ["ownedById"] }, { parameter: webUuid }],
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
      const entityTypes: SimpleEntityType[] = [];
      const webs: SimpleWeb[] = await getUserSimpleWebs(
        req.context,
        {
          actorId: user.accountId,
        },
        { user },
      );

      const subgraph = mapGraphApiSubgraphToSubgraph(response.data.subgraph);

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

          /**
           * Resolve details of the web that the entity belongs to
           */
          const webOwnedById = extractOwnedByIdFromEntityId(
            vertex.inner.metadata.recordId.entityId as EntityId,
          );

          let web = webs.find(
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

            webs.push(web);
          }

          /**
           * Resolve details of the entity type that the entity belongs to
           */
          const entityType = entityTypes.find(
            (type) => type.entityTypeId === vertex.inner.metadata.entityTypeId,
          );
          if (!entityType) {
            const typeSchema = getEntityTypeById(
              subgraph,
              vertex.inner.metadata.entityTypeId,
            )?.schema;
            if (!typeSchema) {
              throw new Error("Entity type not found in subgraph");
            }

            const properties: SimpleEntityType["properties"] = {};
            for (const [_baseUrl, propertySchema] of typedEntries(
              typeSchema.properties,
            )) {
              const propertyTypeId =
                "$ref" in propertySchema
                  ? propertySchema.$ref
                  : propertySchema.items.$ref;

              const propertyType = getPropertyTypeById(
                subgraph,
                propertyTypeId,
              );
              if (!propertyType) {
                throw new Error("Property type not found in subgraph");
              }

              properties[propertyType.schema.title] =
                propertyType.schema.description ?? "";
            }

            const links: SimpleEntityType["links"] = {};
            for (const linkTypeId of typedKeys(typeSchema.links ?? {})) {
              const linkType = getEntityTypeById(subgraph, linkTypeId);
              if (!linkType) {
                throw new Error("Link type not found in subgraph");
              }

              links[linkType.schema.title] = linkType.schema.description ?? "";
            }

            entityTypes.push({
              title: typeSchema.title,
              description: typeSchema.description ?? "",
              entityTypeId: vertex.inner.metadata.entityTypeId,
              properties,
              links,
            });
          }

          /**
           * Create the entity object
           */
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
              targetEntityUuid: extractEntityUuidFromEntityId(
                link.linkData.rightEntityId,
              ),
            });
          }

          const entity = {
            ...baseFields,
            links,
            webUuid: webOwnedById,
          };

          entities.push(entity);
        }
      }

      return {
        entities: `
          ---- Entities returned by the query ----
        ${stringifyResults(entities)}`,
        entityTypes: `
          ---- Entity Types ----
        ${stringifyResults(entityTypes)}`,
        webs: `
          ---- Webs ----
          ${stringifyResults(webs)}`,
      };
    });

  res.status(200).json(queryResponse);
};
