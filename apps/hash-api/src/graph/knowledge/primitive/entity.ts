import type { VersionedUrl } from "@blockprotocol/type-system";
import { typedEntries, typedKeys } from "@local/advanced-types/typed-entries";
import type {
  AllFilter,
  EntityMetadata,
  EntityPermission,
  EntityStructuralQuery,
  Filter,
  GraphResolveDepths,
  ModifyRelationshipOperation,
} from "@local/hash-graph-client";
import type {
  CreateEmbeddingsParams,
  CreateEmbeddingsReturn,
} from "@local/hash-isomorphic-utils/ai-inference-types";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type {
  UserPermissions,
  UserPermissionsOnEntities,
} from "@local/hash-isomorphic-utils/types";
import type {
  AccountGroupId,
  AccountId,
  BaseUrl,
  Entity,
  EntityAuthorizationRelationship,
  EntityId,
  EntityPropertiesObject,
  EntityRelationAndSubject,
  EntityRootType,
  EntityUuid,
  OwnedById,
  Subgraph,
} from "@local/hash-subgraph";
import {
  extractDraftIdFromEntityId,
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
  isEntityVertex,
  splitEntityId,
} from "@local/hash-subgraph";
import {
  getRoots,
  mapGraphApiEntityMetadataToMetadata,
  mapGraphApiSubgraphToSubgraph,
} from "@local/hash-subgraph/stdlib";
import type { LinkEntity } from "@local/hash-subgraph/type-system-patch";
import { ApolloError } from "apollo-server-errors";

import { publicUserAccountId } from "../../../auth/public-user-account-id";
import type {
  EntityDefinition,
  LinkedEntityDefinition,
} from "../../../graphql/api-types.gen";
import type { TemporalClient } from "../../../temporal";
import { genId, linkedTreeFlatten } from "../../../util";
import type { ImpureGraphFunction } from "../../context-types";
import { afterCreateEntityHooks } from "./entity/after-create-entity-hooks";
import { afterUpdateEntityHooks } from "./entity/after-update-entity-hooks";
import { beforeCreateEntityHooks } from "./entity/before-create-entity-hooks";
import { beforeUpdateEntityHooks } from "./entity/before-update-entity-hooks";
import type { CreateLinkEntityParams } from "./link-entity";
import { createLinkEntity, isEntityLinkEntity } from "./link-entity";

export type CreateEntityParams = {
  ownedById: OwnedById;
  properties: EntityPropertiesObject;
  entityTypeId: VersionedUrl;
  outgoingLinks?: Omit<CreateLinkEntityParams, "leftEntityId">[];
  entityUuid?: EntityUuid;
  draft?: boolean;
  relationships: EntityRelationAndSubject[];
};

/** @todo: potentially directly export this from the subgraph package */
export type PropertyValue = EntityPropertiesObject[BaseUrl];

/**
 * Create an entity.
 *
 * @param params.ownedById - the id of the account who owns the entity
 * @param params.entityType - the type of the entity
 * @param params.properties - the properties object of the entity
 * @param params.actorId - the id of the account that is creating the entity
 * @param params.entityUuid (optional) - the uuid of the entity, automatically generated if left undefined
 */
export const createEntity: ImpureGraphFunction<
  CreateEntityParams,
  Promise<Entity>
> = async (context, authentication, params) => {
  const {
    ownedById,
    entityTypeId,
    outgoingLinks,
    entityUuid: overrideEntityUuid,
    draft = false,
  } = params;

  const { graphApi } = context;
  const { actorId } = authentication;

  let properties = params.properties;

  for (const beforeCreateHook of beforeCreateEntityHooks) {
    if (beforeCreateHook.entityTypeId === entityTypeId) {
      const { properties: hookReturnedProperties } =
        await beforeCreateHook.callback({
          context,
          properties,
          authentication,
        });

      properties = hookReturnedProperties;
    }
  }

  const { data: metadata } = await graphApi.createEntity(actorId, {
    ownedById,
    entityTypeIds: [entityTypeId],
    properties,
    entityUuid: overrideEntityUuid,
    draft,
    relationships: params.relationships,
  });

  const entity = {
    properties,
    metadata: mapGraphApiEntityMetadataToMetadata(metadata),
  };

  for (const createOutgoingLinkParams of outgoingLinks ?? []) {
    await createLinkEntity(context, authentication, {
      ...createOutgoingLinkParams,
      leftEntityId: entity.metadata.recordId.entityId,
    });
  }

  for (const afterCreateHook of afterCreateEntityHooks) {
    if (afterCreateHook.entityTypeId === entity.metadata.entityTypeId) {
      void afterCreateHook.callback({
        context,
        entity,
        authentication,
      });
    }
  }

  return entity;
};

/**
 * Get entities by a structural query.
 *
 * @param params.query the structural query to filter entities by.
 */
export const getEntities: ImpureGraphFunction<
  {
    query: EntityStructuralQuery;
    temporalClient?: TemporalClient;
  },
  Promise<Subgraph<EntityRootType>>
> = async ({ graphApi }, { actorId }, { query, temporalClient }) => {
  /**
   * Convert any strings provided under a top-level 'cosineDistance' filter into embeddings
   * This doesn't deal with 'cosineDistance' inside a nested filter (e.g. 'any'), so for now
   * this is only good for single-string inputs.
   */
  for (const [filterName, expression] of Object.entries(query.filter)) {
    if (filterName === "cosineDistance") {
      if (
        Array.isArray(expression) &&
        expression[1] &&
        "parameter" in expression[1] &&
        typeof expression[1].parameter === "string"
      ) {
        if (!temporalClient) {
          throw new Error(
            "Cannot query cosine distance without temporal client",
          );
        }

        const stringInputValue = expression[1].parameter;
        const { embeddings } = await temporalClient.workflow.execute<
          (params: CreateEmbeddingsParams) => Promise<CreateEmbeddingsReturn>
        >("createEmbeddings", {
          taskQueue: "ai",
          args: [
            {
              input: [stringInputValue],
            },
          ],
          workflowId: genId(),
        });
        expression[1].parameter = embeddings[0];
      }
    }
  }

  return await graphApi
    .getEntitiesByQuery(actorId, { query })
    .then(({ data }) => {
      const subgraph = mapGraphApiSubgraphToSubgraph<EntityRootType>(
        data.subgraph,
      );
      // filter archived entities from the vertices until we implement archival by timestamp, not flag: remove after H-349
      for (const [entityId, editionMap] of typedEntries(subgraph.vertices)) {
        const latestEditionTimestamp = typedKeys(editionMap).sort().pop()!;

        if (
          // @ts-expect-error - The subgraph vertices are entity vertices so `Timestamp` is the correct type to get
          //                    the latest revision
          (editionMap[latestEditionTimestamp]!.inner.metadata as EntityMetadata)
            .archived &&
          // if the vertex is in the roots of the query, then it is intentionally included
          !subgraph.roots.find((root) => root.baseId === entityId)
        ) {
          delete subgraph.vertices[entityId];
        }
      }

      return subgraph;
    });
};

/**
 * Get the latest edition of an entity by its entityId. See notes on params.
 *
 * This function does NOT implement:
 * 1. The ability to get the latest draft version without knowing its id.
 * 2. The ability to get ALL versions of an entity at a given timestamp, i.e. if there is a live and one or more drafts
 *    – use {@link getEntities} instead, includeDrafts, and match on its ownedById and uuid
 *
 * @param params.entityId the id of the entity, in one of the following formats:
 *    - `[webUuid]~[entityUuid]` for the 'live', non-draft version of the entity
 *    - `[webUuid]~[entityUuid]~[draftUuid]` for a specific draft series identified by the draftUuid.
 *    - Each entity may have either no live version and a single draft series, or one live version and zero to many
 *   draft series representing potential updates to the entity.
 *
 * @throws Error if one of the following is true:
 *   1. if the entityId does not exist or is inaccessible to the requesting user
 *   2. if there is somehow more than one edition for the requested entityId at the current time, which is an internal
 *   fault
 */
export const getLatestEntityById: ImpureGraphFunction<
  {
    entityId: EntityId;
  },
  Promise<Entity>
> = async (context, authentication, params) => {
  const { entityId } = params;

  const [ownedById, entityUuid, draftId] = splitEntityId(entityId);

  const allFilter: AllFilter["all"] = [
    {
      equal: [{ path: ["uuid"] }, { parameter: entityUuid }],
    },
    {
      equal: [{ path: ["ownedById"] }, { parameter: ownedById }],
    },
    { equal: [{ path: ["archived"] }, { parameter: false }] },
  ];

  if (draftId) {
    /**
     * If the requested entityId includes a draftId, we know we're looking for a specific draft
     */
    allFilter.push({
      equal: [{ path: ["draftId"] }, { parameter: draftId }],
    });
  } else {
    /**
     * If the entityId does NOT contain a draftId, EXCLUDE any draft versions of the entity.
     * Otherwise, a request for an entityId unqualified by a draftId might return a live version
     * and one or more draft versions, which is currently an error in the function.
     *
     * We could alternatively handle this and prioritise a specific version, e.g.
     * - the live version
     * - the latest version by the time the edition was created, whether that is a draft or live
     * ...whether the prioritisation is fixed behavior or varied by parameter.
     */
    allFilter.push({
      equal: [
        { path: ["draftId"] },
        // @ts-expect-error -- Support null in Path parameter in structural queries in Node
        //                     see https://linear.app/hash/issue/H-1207
        null,
      ],
    });
  }

  const [entity, ...unexpectedEntities] = await getEntities(
    context,
    authentication,
    {
      query: {
        filter: {
          all: allFilter,
        },
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: !!draftId,
      },
    },
  ).then(getRoots);

  if (unexpectedEntities.length > 0) {
    const errorMessage = `Latest entity with entityId ${entityId} returned more than one result with ids: ${unexpectedEntities.map((entity) => entity.metadata.recordId.entityId).join(", ")}`;
    throw new Error(errorMessage);
  }

  if (!entity) {
    throw new Error(
      `Entity with entityId ${entityId} doesn't exist or cannot be accessed by requesting user.`,
    );
  }

  return entity;
};

/**
 * Check whether the requested entityId exists and is accessible by the requesting user.
 * Useful when creating links to check that a given entityId is a valid link target without needing its contents.
 *
 * If the existence of ONLY a draft version is acceptable, pass includeDrafts: true.
 *
 * @param params.entityId the id of the entity, in one of the following formats:
 *    - `[webUuid]~[entityUuid]` for the 'live', non-draft version of the entity
 *    - `[webUuid]~[entityUuid]~[draftUuid]` for a specific draft series identified by the draftUuid.
 *    - Each entity may have either no live version and a single draft series, or one live version and zero to many
 *   draft series representing potential updates to the entity.
 * @param params.includeDrafts
 *    - count the existence of a draft as the entity existing.
 *    - this parameter will be treated as `true` if an entityId CONTAINING a draftUuid is passed
 *    - useful for when creating a draft link or link to/from a draft entity, because a draft source/target is permissible
 *
 * @returns true if at least one version of the entity exists
 * @throws Error if the entity does not exist as far as the requesting user is concerned
 */
export const canUserReadEntity: ImpureGraphFunction<
  {
    entityId: EntityId;
    includeDrafts: boolean;
  },
  Promise<boolean>
> = async (context, authentication, params) => {
  const { entityId, includeDrafts } = params;

  const [ownedById, entityUuid, draftId] = splitEntityId(entityId);

  const allFilter: AllFilter["all"] = [
    {
      equal: [{ path: ["uuid"] }, { parameter: entityUuid }],
    },
    {
      equal: [{ path: ["ownedById"] }, { parameter: ownedById }],
    },
    { equal: [{ path: ["archived"] }, { parameter: false }] },
  ];

  if (draftId) {
    /**
     * If the requested entityId includes a draftId, we know we're looking for a specific draft
     */
    allFilter.push({
      equal: [{ path: ["draftId"] }, { parameter: draftId }],
    });
  }

  const entities = await getEntities(context, authentication, {
    query: {
      filter: {
        all: allFilter,
      },
      graphResolveDepths: zeroedGraphResolveDepths,
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: !!draftId || includeDrafts,
    },
  }).then(getRoots);

  if (entities.length === 0) {
    throw new Error(
      `Entity with entityId ${entityId} doesn't exist or cannot be accessed by requesting user.`,
    );
  }

  return true;
};

/**
 * Create an entity along with any new/existing entities specified through links.
 *
 * @param params.ownedById - the id of owner of the entity
 * @param params.entityTypeId - the id of the entity's type
 * @param params.entityProperties - the properties of the entity
 * @param params.linkedEntities (optional) - the linked entity definitions of the entity
 * @param params.actorId - the id of the account that is creating the entity
 */
export const createEntityWithLinks: ImpureGraphFunction<
  {
    ownedById: OwnedById;
    entityTypeId: VersionedUrl;
    properties: EntityPropertiesObject;
    linkedEntities?: LinkedEntityDefinition[];
    relationships: EntityRelationAndSubject[];
    draft?: boolean;
  },
  Promise<Entity>,
  false,
  true
> = async (context, authentication, params) => {
  const {
    ownedById,
    entityTypeId,
    properties,
    linkedEntities,
    relationships,
    draft,
  } = params;

  const entitiesInTree = linkedTreeFlatten<
    EntityDefinition,
    LinkedEntityDefinition,
    "linkedEntities",
    "entity"
  >(
    {
      entityTypeId,
      entityProperties: properties,
      linkedEntities,
    },
    "linkedEntities",
    "entity",
  );

  /**
   * @todo Once the graph API validates the required links of entities on creation, this may have to be reworked in
   *   order to create valid entities. this code currently creates entities first, then links them together. See
   *   https://app.asana.com/0/1202805690238892/1203046447168478/f
   */
  const entities = await Promise.all(
    entitiesInTree.map(async (definition) => {
      const { existingEntityId, parentIndex, meta, ...creationParameters } =
        definition;

      if (
        !existingEntityId &&
        (!definition.entityProperties || !definition.entityTypeId)
      ) {
        throw new Error(
          `One of existingEntityId or (entityProperties && entityTypeId) must be provided in linked entity definition: ${JSON.stringify(definition)}`,
        );
      }

      /**
       * This will throw an error if existingEntityId does not have a draftId and there is no live version of the entity being linked to.
       * We currently only use this field for updating block collections, which do not link to draft entities, but would need changing if we change this.
       * H-2430 which would introduce draft/live versions of pages which may affect this.
       */
      const entity = existingEntityId
        ? await getLatestEntityById(context, authentication, {
            entityId: existingEntityId,
          })
        : await createEntity(context, authentication, {
            properties: definition.entityProperties!,
            entityTypeId: definition.entityTypeId!,
            ownedById,
            relationships,
            draft,
          });

      return {
        link: meta
          ? {
              parentIndex,
              meta,
            }
          : undefined,
        entity,
      };
    }),
  );

  let rootEntity: Entity;
  if (entities[0]) {
    // First element will be the root entity.
    rootEntity = entities[0].entity;
  } else {
    throw new ApolloError(
      "Could not create entity tree",
      "INTERNAL_SERVER_ERROR",
    );
  }

  await Promise.all(
    entities.map(async ({ link, entity }) => {
      if (link) {
        const parentEntity = entities[link.parentIndex];
        if (!parentEntity) {
          throw new ApolloError("Could not find parent entity");
        }

        // links are created as an outgoing link from the parent entity to the children.
        await createLinkEntity(context, authentication, {
          linkEntityTypeId: link.meta.linkEntityTypeId,
          leftEntityId: parentEntity.entity.metadata.recordId.entityId,
          rightEntityId: entity.metadata.recordId.entityId,
          ownedById,
          relationships,
          draft,
        });
      }
    }),
  );

  return rootEntity;
};

/**
 * Update an entity.
 *
 * @param entity - the entity being updated
 * @param params.properties - the properties object of the entity
 * @param params.actorId - the id of the account that is updating the entity
 */
export const updateEntity: ImpureGraphFunction<
  {
    entity: Entity;
    entityTypeId?: VersionedUrl;
    properties: EntityPropertiesObject;
    draft?: boolean;
  },
  Promise<Entity>,
  false,
  true
> = async (context, authentication, params) => {
  const { entity, properties, entityTypeId } = params;

  for (const beforeUpdateHook of beforeUpdateEntityHooks) {
    if (beforeUpdateHook.entityTypeId === entity.metadata.entityTypeId) {
      await beforeUpdateHook.callback({
        context,
        entity,
        updatedProperties: properties,
        authentication,
      });
    }
  }

  const { graphApi } = context;
  const { actorId } = authentication;

  const { data: metadata } = await graphApi.updateEntity(actorId, {
    entityId: entity.metadata.recordId.entityId,
    /**
     * @todo: this field could be optional when updating an entity
     *
     * @see https://app.asana.com/0/1201095311341924/1203285029221330/f
     * */
    entityTypeIds: [entityTypeId ?? entity.metadata.entityTypeId],
    archived: entity.metadata.archived,
    draft:
      params.draft ??
      !!extractDraftIdFromEntityId(entity.metadata.recordId.entityId),
    properties,
  });

  for (const afterUpdateHook of afterUpdateEntityHooks) {
    if (afterUpdateHook.entityTypeId === entity.metadata.entityTypeId) {
      void afterUpdateHook.callback({
        context,
        entity,
        updatedProperties: properties,
        authentication,
      });
    }
  }

  return {
    ...entity,
    metadata: mapGraphApiEntityMetadataToMetadata(metadata),
    properties,
  };
};

export const archiveEntity: ImpureGraphFunction<
  {
    entity: Entity;
  },
  Promise<void>
> = async ({ graphApi }, { actorId }, params) => {
  const { entity } = params;
  await graphApi.updateEntity(actorId, {
    entityId: entity.metadata.recordId.entityId,
    archived: true,
    /**
     * @todo: these fields shouldn't be required when archiving an entity
     *
     * @see https://app.asana.com/0/1201095311341924/1203285029221330/f
     * */
    draft: !!extractDraftIdFromEntityId(entity.metadata.recordId.entityId),
    entityTypeIds: [entity.metadata.entityTypeId],
    properties: entity.properties,
  });
};

export const unarchiveEntity: ImpureGraphFunction<
  {
    entity: Entity;
  },
  Promise<void>
> = async ({ graphApi }, { actorId }, params) => {
  const { entity } = params;
  await graphApi.updateEntity(actorId, {
    entityId: entity.metadata.recordId.entityId,
    /**
     * @todo: these fields shouldn't be required when archiving an entity
     *
     * @see https://app.asana.com/0/1201095311341924/1203285029221330/f
     * */
    archived: false,
    draft: !!extractDraftIdFromEntityId(entity.metadata.recordId.entityId),
    entityTypeIds: [entity.metadata.entityTypeId],
    properties: entity.properties,
  });
};

/**
 * Update multiple top-level properties on an entity.
 *
 * @param entity - the entity being updated
 * @param params.updatedProperties - an array of the properties being updated
 * @param params.actorId - the id of the account that is updating the entity
 */
export const updateEntityProperties: ImpureGraphFunction<
  {
    entity: Entity;
    updatedProperties: {
      propertyTypeBaseUrl: BaseUrl;
      value: PropertyValue | undefined;
    }[];
  },
  Promise<Entity>,
  false,
  true
> = async (ctx, authentication, params) => {
  const { entity, updatedProperties } = params;

  return await updateEntity(ctx, authentication, {
    entity,
    properties: updatedProperties.reduce<EntityPropertiesObject>(
      (prev, { propertyTypeBaseUrl, value }) =>
        value !== undefined
          ? {
              ...prev,
              [propertyTypeBaseUrl]: value,
            }
          : prev,
      entity.properties,
    ),
  });
};

/**
 * Update a top-level property on an entity.
 *
 * @param params.entity - the entity being updated
 * @param params.propertyTypeBaseUrl - the property type base URL of the property being updated
 * @param params.value - the updated value of the property
 * @param params.actorId - the id of the account that is updating the entity
 */
export const updateEntityProperty: ImpureGraphFunction<
  {
    entity: Entity;
    propertyTypeBaseUrl: BaseUrl;
    value: PropertyValue | undefined;
  },
  Promise<Entity>,
  false,
  true
> = async (ctx, authentication, params) => {
  const { entity, propertyTypeBaseUrl, value } = params;

  return await updateEntityProperties(ctx, authentication, {
    entity,
    updatedProperties: [{ propertyTypeBaseUrl, value }],
  });
};

/**
 * Get the incoming links of an entity.
 *
 * @param params.entity - the entity
 * @param params.linkEntityType (optional) - the specific link entity type of the incoming links
 */
export const getEntityIncomingLinks: ImpureGraphFunction<
  {
    entityId: EntityId;
    linkEntityTypeId?: VersionedUrl;
    includeDrafts?: boolean;
  },
  Promise<LinkEntity[]>
> = async (context, authentication, params) => {
  const { entityId, includeDrafts = false } = params;
  const filter: Filter = {
    all: [
      {
        equal: [
          { path: ["rightEntity", "uuid"] },
          {
            parameter: extractEntityUuidFromEntityId(entityId),
          },
        ],
      },
      {
        equal: [
          { path: ["rightEntity", "ownedById"] },
          {
            parameter: extractOwnedByIdFromEntityId(entityId),
          },
        ],
      },
      {
        equal: [{ path: ["archived"] }, { parameter: false }],
      },
    ],
  };

  if (params.linkEntityTypeId) {
    filter.all.push({
      equal: [
        { path: ["type", "versionedUrl"] },
        {
          parameter: params.linkEntityTypeId,
        },
      ],
    });
  }

  const incomingLinkEntitiesSubgraph = await getEntities(
    context,
    authentication,
    {
      query: {
        filter,
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts,
      },
    },
  );

  const incomingLinkEntities = getRoots(incomingLinkEntitiesSubgraph).map(
    (linkEntity) => {
      if (!isEntityLinkEntity(linkEntity)) {
        throw new Error(
          `Entity with ID ${linkEntity.metadata.recordId.entityId} is not a link entity.`,
        );
      }
      return linkEntity;
    },
  );

  return incomingLinkEntities;
};

/**
 * Get the outgoing links of an entity.
 *
 * @param params.entityId - the entityId of the entity to get the outgoing links of
 * @param [params.linkEntityTypeVersionedUrl] (optional) – the specific link type of the outgoing links to filter to
 * @param [params.rightEntityId] (optional) – limit returned links to those with the specified right entity
 */
export const getEntityOutgoingLinks: ImpureGraphFunction<
  {
    entityId: EntityId;
    linkEntityTypeVersionedUrl?: VersionedUrl;
    rightEntityId?: EntityId;
    includeDrafts?: boolean;
  },
  Promise<LinkEntity[]>
> = async (context, authentication, params) => {
  const {
    entityId,
    linkEntityTypeVersionedUrl,
    rightEntityId,
    includeDrafts = false,
  } = params;

  const filter: Filter = {
    all: [
      {
        equal: [
          { path: ["leftEntity", "uuid"] },
          {
            parameter: extractEntityUuidFromEntityId(entityId),
          },
        ],
      },
      {
        equal: [
          { path: ["leftEntity", "ownedById"] },
          {
            parameter: extractOwnedByIdFromEntityId(entityId),
          },
        ],
      },
      {
        equal: [{ path: ["archived"] }, { parameter: false }],
      },
    ],
  };

  if (linkEntityTypeVersionedUrl) {
    filter.all.push({
      equal: [
        { path: ["type", "versionedUrl"] },
        {
          parameter: linkEntityTypeVersionedUrl,
        },
      ],
    });
  }

  if (rightEntityId) {
    filter.all.push(
      {
        equal: [
          { path: ["rightEntity", "uuid"] },
          {
            parameter: extractEntityUuidFromEntityId(rightEntityId),
          },
        ],
      },
      {
        equal: [
          { path: ["rightEntity", "ownedById"] },
          {
            parameter: extractOwnedByIdFromEntityId(rightEntityId),
          },
        ],
      },
    );
  }

  const outgoingLinkEntitiesSubgraph = await getEntities(
    context,
    authentication,
    {
      query: {
        filter,
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts,
      },
    },
  );

  const outgoingLinkEntities = getRoots(outgoingLinkEntitiesSubgraph).map(
    (linkEntity) => {
      if (!isEntityLinkEntity(linkEntity)) {
        throw new Error(
          `Entity with ID ${linkEntity.metadata.recordId.entityId} is not a link entity.`,
        );
      }
      return linkEntity;
    },
  );

  return outgoingLinkEntities;
};

/**
 * Get subgraph rooted at the entity.
 *
 * @param params.entity - the entity
 * @param params.graphResolveDepths - the custom resolve depths of the subgraph
 */
export const getLatestEntityRootedSubgraph: ImpureGraphFunction<
  {
    entity: Entity;
    graphResolveDepths: Partial<GraphResolveDepths>;
  },
  Promise<Subgraph<EntityRootType>>,
  false,
  true
> = async (context, authentication, params) => {
  const { entity, graphResolveDepths } = params;

  return await getEntities(context, authentication, {
    query: {
      filter: {
        all: [
          {
            equal: [
              { path: ["uuid"] },
              {
                parameter: extractEntityUuidFromEntityId(
                  entity.metadata.recordId.entityId,
                ),
              },
            ],
          },
          {
            equal: [
              { path: ["ownedById"] },
              {
                parameter: extractOwnedByIdFromEntityId(
                  entity.metadata.recordId.entityId,
                ),
              },
            ],
          },
          { equal: [{ path: ["archived"] }, { parameter: false }] },
        ],
      },
      graphResolveDepths: {
        ...zeroedGraphResolveDepths,
        ...graphResolveDepths,
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
    },
  });
};

export const modifyEntityAuthorizationRelationships: ImpureGraphFunction<
  {
    operation: ModifyRelationshipOperation;
    relationship: EntityAuthorizationRelationship;
  }[],
  Promise<void>
> = async ({ graphApi }, { actorId }, params) => {
  await graphApi.modifyEntityAuthorizationRelationships(
    actorId,
    params.map(({ operation, relationship }) => ({
      operation,
      resource: relationship.resource.resourceId,
      relationSubject: relationship,
    })),
  );
};

export const addEntityAdministrator: ImpureGraphFunction<
  { entityId: EntityId; administrator: AccountId | AccountGroupId },
  Promise<void>
> = async ({ graphApi }, { actorId }, params) => {
  await graphApi.addEntityAdministrator(
    actorId,
    params.entityId,
    params.administrator,
  );
};

export const removeEntityAdministrator: ImpureGraphFunction<
  { entityId: EntityId; administrator: AccountId | AccountGroupId },
  Promise<void>
> = async ({ graphApi }, { actorId }, params) => {
  await graphApi.removeEntityAdministrator(
    actorId,
    params.entityId,
    params.administrator,
  );
};

export const addEntityEditor: ImpureGraphFunction<
  { entityId: EntityId; editor: AccountId | AccountGroupId },
  Promise<void>
> = async ({ graphApi }, { actorId }, params) => {
  await graphApi.addEntityEditor(actorId, params.entityId, params.editor);
};

export const removeEntityEditor: ImpureGraphFunction<
  { entityId: EntityId; editor: AccountId | AccountGroupId },
  Promise<void>
> = async ({ graphApi }, { actorId }, params) => {
  await graphApi.removeEntityEditor(actorId, params.entityId, params.editor);
};

export const checkEntityPermission: ImpureGraphFunction<
  { entityId: EntityId; permission: EntityPermission },
  Promise<boolean>
> = async ({ graphApi }, { actorId }, params) =>
  graphApi
    .checkEntityPermission(actorId, params.entityId, params.permission)
    .then(({ data }) => data.has_permission);

export const checkPermissionsOnEntity: ImpureGraphFunction<
  { entity: Pick<Entity, "metadata"> },
  Promise<UserPermissions>
> = async (graphContext, { actorId }, params) => {
  const { entity } = params;

  const { entityId } = entity.metadata.recordId;

  const isAccountGroup =
    entity.metadata.entityTypeId ===
    systemEntityTypes.organization.entityTypeId;

  const isPublicUser = actorId === publicUserAccountId;

  const [entityEditable, membersEditable] = await Promise.all([
    isPublicUser
      ? false
      : await checkEntityPermission(
          graphContext,
          { actorId },
          { entityId, permission: "update" },
        ),
    isAccountGroup
      ? isPublicUser
        ? false
        : await graphContext.graphApi
            .checkAccountGroupPermission(
              actorId,
              extractEntityUuidFromEntityId(entityId),
              "add_member",
            )
            .then(({ data }) => data.has_permission)
      : null,
  ]);

  return {
    edit: entityEditable,
    view: true,
    editPermissions: entityEditable,
    viewPermissions: entityEditable,
    editMembers: membersEditable,
  };
};

export const checkPermissionsOnEntitiesInSubgraph: ImpureGraphFunction<
  { subgraph: Subgraph },
  Promise<UserPermissionsOnEntities>
> = async (graphContext, authentication, params) => {
  const { subgraph } = params;

  const entities: Entity[] = [];
  for (const editionMap of Object.values(subgraph.vertices)) {
    const latestEditionTimestamp = Object.keys(editionMap).sort().pop()!;
    // @ts-expect-error -- subgraph needs revamping to make typing less annoying
    const latestEdition = editionMap[latestEditionTimestamp];

    if (isEntityVertex(latestEdition)) {
      entities.push(latestEdition.inner);
    }
  }

  const userPermissionsOnEntities: UserPermissionsOnEntities = {};
  await Promise.all(
    entities.map(async (entity) => {
      const permissions = await checkPermissionsOnEntity(
        graphContext,
        authentication,
        { entity },
      );
      userPermissionsOnEntities[entity.metadata.recordId.entityId] =
        permissions;
    }),
  );

  return userPermissionsOnEntities;
};

export const getEntityAuthorizationRelationships: ImpureGraphFunction<
  { entityId: EntityId },
  Promise<EntityAuthorizationRelationship[]>
> = async ({ graphApi }, { actorId }, params) =>
  graphApi
    .getEntityAuthorizationRelationships(actorId, params.entityId)
    .then(({ data }) =>
      data.map(
        (relationship) =>
          ({
            resource: { kind: "entity", resourceId: params.entityId },
            ...relationship,
          }) as EntityAuthorizationRelationship,
      ),
    );
