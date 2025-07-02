import {
  type EntityRootType,
  isEntityVertex,
  type QueryTemporalAxesUnresolved,
  type Subgraph,
} from "@blockprotocol/graph";
import type {
  ActorEntityUuid,
  ActorGroupEntityUuid,
  BaseUrl,
  Entity,
  EntityEditionId,
  EntityId,
  LinkData,
  PropertyObject,
  PropertyPatchOperation,
  TypeIdsAndPropertiesForEntity,
  VersionedUrl,
} from "@blockprotocol/type-system";
import {
  extractDraftIdFromEntityId,
  extractEntityUuidFromEntityId,
  extractWebIdFromEntityId,
  splitEntityId,
} from "@blockprotocol/type-system";
import type { Subtype } from "@local/advanced-types/subtype";
import { typedEntries, typedKeys } from "@local/advanced-types/typed-entries";
import { isUserHashInstanceAdmin } from "@local/hash-backend-utils/hash-instance";
import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";
import type { TemporalClient } from "@local/hash-backend-utils/temporal";
import type {
  AllFilter,
  CountEntitiesParams,
  DiffEntityResult,
  Filter,
  GraphResolveDepths,
  HasPermissionForEntitiesParams,
  ModifyRelationshipOperation,
} from "@local/hash-graph-client";
import type {
  EntityAuthorizationRelationship,
  UserPermissions,
  UserPermissionsOnEntities,
} from "@local/hash-graph-sdk/authorization";
import {
  type CreateEntityParameters,
  type DiffEntityInput,
  type GetEntitiesRequest,
  type GetEntitySubgraphRequest,
  HashEntity,
  HashLinkEntity,
} from "@local/hash-graph-sdk/entity";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import {
  mapGraphApiEntityToEntity,
  mapGraphApiEntityTypeResolveDefinitionsToEntityTypeResolveDefinitions,
  mapGraphApiSubgraphToSubgraph,
} from "@local/hash-isomorphic-utils/subgraph-mapping";
import type { ActionName } from "@rust/hash-graph-authorization/types";
import { ApolloError } from "apollo-server-errors";

import type {
  EntityDefinition,
  GetEntitySubgraphResponse,
  LinkedEntityDefinition,
} from "../../../graphql/api-types.gen";
import { isTestEnv } from "../../../lib/env-config";
import { linkedTreeFlatten } from "../../../util";
import type { ImpureGraphFunction } from "../../context-types";
import { rewriteSemanticFilter } from "../../shared/rewrite-semantic-filter";
import { afterCreateEntityHooks } from "./entity/after-create-entity-hooks";
import { afterUpdateEntityHooks } from "./entity/after-update-entity-hooks";
import { beforeCreateEntityHooks } from "./entity/before-create-entity-hooks";
import { beforeUpdateEntityHooks } from "./entity/before-update-entity-hooks";
import { createLinkEntity, isEntityLinkEntity } from "./link-entity";

/** @todo: potentially directly export this from the subgraph package */
export type PropertyValue = PropertyObject[BaseUrl];

type CreateEntityFunction<Properties extends TypeIdsAndPropertiesForEntity> =
  ImpureGraphFunction<
    Omit<CreateEntityParameters<Properties>, "linkData" | "provenance"> & {
      outgoingLinks?: (Omit<
        CreateEntityParameters,
        "linkData" | "provenance"
      > & {
        linkData: Omit<LinkData, "leftEntityId">;
      })[];
    },
    Promise<HashEntity<Properties>>
  >;

type CreateEntityWithLinksFunction<
  Properties extends TypeIdsAndPropertiesForEntity,
> = ImpureGraphFunction<
  Omit<CreateEntityParameters<Properties>, "linkData" | "provenance"> & {
    linkedEntities?: LinkedEntityDefinition[];
  },
  Promise<HashEntity<Properties>>,
  false,
  true
>;

/**
 * Create an entity.
 */
export const createEntity = async <
  Properties extends TypeIdsAndPropertiesForEntity,
>(
  ...args: Parameters<CreateEntityFunction<Properties>>
): ReturnType<CreateEntityFunction<Properties>> => {
  const [context, authentication, params] = args;
  const { outgoingLinks, ...createParams } = params;

  const { graphApi, provenance } = context;
  const { actorId } = authentication;

  let properties = params.properties;

  for (const beforeCreateHook of beforeCreateEntityHooks) {
    if (createParams.entityTypeIds.includes(beforeCreateHook.entityTypeId)) {
      const { properties: hookReturnedProperties } =
        await beforeCreateHook.callback({
          context,
          properties,
          authentication,
        });

      properties = hookReturnedProperties;
    }
  }

  const entity = await HashEntity.create<Properties>(
    graphApi,
    { actorId },
    {
      ...createParams,
      properties,
      provenance,
    },
  );

  for (const createOutgoingLinkParams of outgoingLinks ?? []) {
    await createLinkEntity(context, authentication, {
      ...createOutgoingLinkParams,
      linkData: {
        ...createOutgoingLinkParams.linkData,
        leftEntityId: entity.metadata.recordId.entityId,
      },
    });
  }

  for (const afterCreateHook of afterCreateEntityHooks) {
    if (entity.metadata.entityTypeIds.includes(afterCreateHook.entityTypeId)) {
      void afterCreateHook.callback({
        context,
        entity,
        authentication,
      });
    }
  }

  return entity;
};

export const getEntities: ImpureGraphFunction<
  GetEntitiesRequest & { temporalClient?: TemporalClient },
  Promise<HashEntity[]>
> = async ({ graphApi, temporalClient }, { actorId }, params) => {
  await rewriteSemanticFilter(params.filter, temporalClient);

  const isRequesterAdmin = isTestEnv
    ? false
    : await isUserHashInstanceAdmin(
        { graphApi },
        { actorId },
        { userAccountId: actorId },
      );

  return await graphApi
    .getEntities(actorId, params)
    .then(({ data: response }) =>
      response.entities.map((entity) =>
        mapGraphApiEntityToEntity(entity, actorId, isRequesterAdmin),
      ),
    );
};

/**
 * Get entities by a structural query.
 *
 * @param params.query the structural query to filter entities by.
 */
export const getEntitySubgraphResponse: ImpureGraphFunction<
  GetEntitySubgraphRequest,
  Promise<
    Omit<
      GetEntitySubgraphResponse,
      "userPermissionsOnEntities" | "subgraph"
    > & { subgraph: Subgraph<EntityRootType<HashEntity>> }
  >
> = async ({ graphApi, temporalClient }, { actorId }, params) => {
  await rewriteSemanticFilter(params.filter, temporalClient);

  const isRequesterAdmin = isTestEnv
    ? false
    : await isUserHashInstanceAdmin(
        { graphApi },
        { actorId },
        { userAccountId: actorId },
      );

  return await graphApi.getEntitySubgraph(actorId, params).then(({ data }) => {
    const {
      subgraph: unfilteredSubgraph,
      definitions,
      closedMultiEntityTypes,
      ...rest
    } = data;

    const subgraph = mapGraphApiSubgraphToSubgraph<EntityRootType<HashEntity>>(
      unfilteredSubgraph,
      actorId,
      isRequesterAdmin,
    );
    // filter archived entities from the vertices until we implement archival by timestamp, not flag: remove after H-349
    for (const [entityId, editionMap] of typedEntries(subgraph.vertices)) {
      const latestEditionTimestamp = typedKeys(editionMap).sort().pop()!;

      if (
        // @ts-expect-error - The subgraph vertices are entity vertices so `Timestamp` is the correct type to get
        //                    the latest revision
        (editionMap[latestEditionTimestamp].inner.metadata as EntityMetadata)
          .archived &&
        // if the vertex is in the roots of the query, then it is intentionally included
        !subgraph.roots.find((root) => root.baseId === entityId)
      ) {
        delete subgraph.vertices[entityId];
      }
    }

    return {
      closedMultiEntityTypes,
      definitions: definitions
        ? mapGraphApiEntityTypeResolveDefinitionsToEntityTypeResolveDefinitions(
            definitions,
          )
        : undefined,
      subgraph,
      ...rest,
    };
  });
};

export const countEntities: ImpureGraphFunction<
  CountEntitiesParams,
  Promise<number>
> = async ({ graphApi }, { actorId }, params) =>
  graphApi.countEntities(actorId, params).then(({ data }) => data);

/**
 * Get the latest edition of an entity by its entityId. See notes on params.
 *
 * This function does NOT implement:
 * 1. The ability to get the latest draft version without knowing its id.
 * 2. The ability to get ALL versions of an entity at a given timestamp, i.e. if there is a live and one or more drafts
 *    – use {@link getEntitySubgraphResponse} instead, includeDrafts, and match on its webId and uuid
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
  Promise<HashEntity>
> = async (context, authentication, params) => {
  const { entityId } = params;

  const [webId, entityUuid, draftId] = splitEntityId(entityId);

  const allFilter: AllFilter["all"] = [
    {
      equal: [{ path: ["uuid"] }, { parameter: entityUuid }],
    },
    {
      equal: [{ path: ["webId"] }, { parameter: webId }],
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
      filter: {
        all: allFilter,
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: !!draftId,
    },
  );

  if (unexpectedEntities.length > 0) {
    const errorMessage = `Latest entity with entityId ${entityId} returned more than one result with ids: ${unexpectedEntities
      .map((unexpectedEntity) => unexpectedEntity.metadata.recordId.entityId)
      .join(", ")}`;
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
 *    - useful for when creating a draft link or link to/from a draft entity, because a draft source/target is
 *   permissible
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

  const [webId, entityUuid, draftId] = splitEntityId(entityId);

  const allFilter: AllFilter["all"] = [
    {
      equal: [{ path: ["uuid"] }, { parameter: entityUuid }],
    },
    {
      equal: [{ path: ["webId"] }, { parameter: webId }],
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

  const count = await countEntities(context, authentication, {
    filter: {
      all: allFilter,
    },
    temporalAxes: currentTimeInstantTemporalAxes,
    includeDrafts: !!draftId || includeDrafts,
  });

  if (count === 0) {
    throw new Error(
      `Entity with entityId ${entityId} doesn't exist or cannot be accessed by requesting user.`,
    );
  }

  return true;
};

/**
 * Create an entity along with any new/existing entities specified through links.
 */
export const createEntityWithLinks = async <
  Properties extends TypeIdsAndPropertiesForEntity,
>(
  ...args: Parameters<CreateEntityWithLinksFunction<Properties>>
): ReturnType<CreateEntityWithLinksFunction<Properties>> => {
  const [context, authentication, params] = args;
  const { entityTypeIds, properties, linkedEntities, ...createParams } = params;

  const entitiesInTree = linkedTreeFlatten<
    EntityDefinition,
    LinkedEntityDefinition,
    "linkedEntities",
    "entity"
  >(
    {
      entityTypeIds,
      entityProperties: properties,
      linkedEntities,
    },
    "linkedEntities",
    "entity",
  );

  /**
   * @todo Once the graph API validates the required links of entities on creation, this may have to be reworked in
   *   order to create valid entities. this code currently creates entities first, then links them together. See
   *   https://linear.app/hash/issue/H-2986
   */
  const entities = await Promise.all(
    entitiesInTree.map(async (definition) => {
      const { existingEntityId, parentIndex, meta } = definition;

      if (
        !existingEntityId &&
        (!definition.entityProperties || !definition.entityTypeIds)
      ) {
        throw new Error(
          `One of existingEntityId or (entityProperties && entityTypeIds) must be provided in linked entity definition: ${JSON.stringify(
            definition,
          )}`,
        );
      }

      /**
       * This will throw an error if existingEntityId does not have a draftId and there is no live version of the
       * entity being linked to. We currently only use this field for updating block collections, which do not link to
       * draft entities, but would need changing if we change this. H-2430 which would introduce draft/live versions of
       * pages which may affect this.
       */
      const entity = existingEntityId
        ? ((await getLatestEntityById(context, authentication, {
            entityId: existingEntityId,
          })) as HashEntity<Properties>)
        : await createEntity<Properties>(context, authentication, {
            ...createParams,
            properties: definition.entityProperties!,
            entityTypeIds:
              definition.entityTypeIds as Properties["entityTypeIds"],
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

  let rootEntity: HashEntity<Properties>;
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
          ...createParams,
          properties: { value: {} },
          linkData: {
            leftEntityId: parentEntity.entity.metadata.recordId.entityId,
            rightEntityId: entity.metadata.recordId.entityId,
          },
          entityTypeIds: [link.meta.linkEntityTypeId],
          draft:
            /** If either side of the link is a draft entity, the link entity must be draft also */
            params.draft ||
            !!extractDraftIdFromEntityId(entity.metadata.recordId.entityId),
        });
      }
    }),
  );

  return rootEntity;
};

type UpdateEntityFunction<Properties extends TypeIdsAndPropertiesForEntity> =
  ImpureGraphFunction<
    {
      entity: HashEntity<Properties>;
      entityTypeIds?: [VersionedUrl, ...VersionedUrl[]];
      propertyPatches?: PropertyPatchOperation[];
      draft?: boolean;
    },
    Promise<HashEntity<Properties>>,
    false,
    true
  >;

/**
 * Update an entity.
 */
export const updateEntity = async <
  Properties extends TypeIdsAndPropertiesForEntity,
>(
  ...args: Parameters<UpdateEntityFunction<Properties>>
): ReturnType<UpdateEntityFunction<Properties>> => {
  const [context, authentication, params] = args;
  const { entity, entityTypeIds, propertyPatches } = params;

  for (const beforeUpdateHook of beforeUpdateEntityHooks) {
    if (entity.metadata.entityTypeIds.includes(beforeUpdateHook.entityTypeId)) {
      await beforeUpdateHook.callback({
        context,
        previousEntity: entity,
        propertyPatches: propertyPatches ?? [],
        authentication,
      });
    }
  }

  const { graphApi } = context;
  const { actorId } = authentication;

  const updatedEntity = await entity.patch(
    graphApi,
    { actorId },
    {
      entityTypeIds,
      draft: params.draft,
      propertyPatches,
      provenance: context.provenance,
    },
  );

  for (const afterUpdateHook of afterUpdateEntityHooks) {
    if (entity.metadata.entityTypeIds.includes(afterUpdateHook.entityTypeId)) {
      void afterUpdateHook.callback({
        context,
        previousEntity: entity,
        propertyPatches: propertyPatches ?? [],
        authentication,
        updatedEntity,
      });
    }
  }

  return updatedEntity;
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
  Promise<HashLinkEntity[]>
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
          { path: ["rightEntity", "webId"] },
          {
            parameter: extractWebIdFromEntityId(entityId),
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

  return await getEntities(context, authentication, {
    filter,
    temporalAxes: currentTimeInstantTemporalAxes,
    includeDrafts,
  }).then((entities) =>
    entities.map((linkEntity) => {
      if (!isEntityLinkEntity(linkEntity)) {
        throw new Error(
          `Entity with ID ${linkEntity.metadata.recordId.entityId} is not a link entity.`,
        );
      }
      return linkEntity;
    }),
  );
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
  Promise<HashLinkEntity[]>
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
          { path: ["leftEntity", "webId"] },
          {
            parameter: extractWebIdFromEntityId(entityId),
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
          { path: ["rightEntity", "webId"] },
          {
            parameter: extractWebIdFromEntityId(rightEntityId),
          },
        ],
      },
    );
  }

  return await getEntities(context, authentication, {
    filter,
    temporalAxes: currentTimeInstantTemporalAxes,
    includeDrafts,
  }).then((entities) =>
    entities.map((linkEntity) => {
      if (!isEntityLinkEntity(linkEntity)) {
        throw new Error(
          `Entity with ID ${linkEntity.metadata.recordId.entityId} is not a link entity.`,
        );
      }
      return new HashLinkEntity(linkEntity);
    }),
  );
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

  const { subgraph } = await getEntitySubgraphResponse(
    context,
    authentication,
    {
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
              { path: ["webId"] },
              {
                parameter: extractWebIdFromEntityId(
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
  );

  return subgraph;
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
  { entityId: EntityId; administrator: ActorEntityUuid | ActorGroupEntityUuid },
  Promise<void>
> = async ({ graphApi }, { actorId }, params) => {
  await graphApi.addEntityAdministrator(
    actorId,
    params.entityId,
    params.administrator,
  );
};

export const removeEntityAdministrator: ImpureGraphFunction<
  { entityId: EntityId; administrator: ActorEntityUuid | ActorGroupEntityUuid },
  Promise<void>
> = async ({ graphApi }, { actorId }, params) => {
  await graphApi.removeEntityAdministrator(
    actorId,
    params.entityId,
    params.administrator,
  );
};

export const addEntityEditor: ImpureGraphFunction<
  { entityId: EntityId; editor: ActorEntityUuid | ActorGroupEntityUuid },
  Promise<void>
> = async ({ graphApi }, { actorId }, params) => {
  await graphApi.addEntityEditor(actorId, params.entityId, params.editor);
};

export const removeEntityEditor: ImpureGraphFunction<
  { entityId: EntityId; editor: ActorEntityUuid | ActorGroupEntityUuid },
  Promise<void>
> = async ({ graphApi }, { actorId }, params) => {
  await graphApi.removeEntityEditor(actorId, params.entityId, params.editor);
};

/**
 * Checks if the actor has permission for the given entities.
 *
 * Returns a map of entity IDs to the edition IDs that the actor has permission for. If the actor
 * has no permission for an entity, it will not be included in the map.
 */
export const hasPermissionForEntities: ImpureGraphFunction<
  Subtype<
    HasPermissionForEntitiesParams,
    {
      entityIds: EntityId[];
      action: Subtype<
        ActionName,
        "viewEntity" | "updateEntity" | "archiveEntity"
      >;
      temporalAxes: QueryTemporalAxesUnresolved;
      includeDrafts: boolean;
    }
  >,
  Promise<Record<EntityId, [EntityEditionId, ...EntityEditionId[]]>>
> = async ({ graphApi }, { actorId }, params) =>
  graphApi
    .hasPermissionForEntities(actorId, params)
    .then(
      ({ data }) =>
        data as Record<EntityId, [EntityEditionId, ...EntityEditionId[]]>,
    );

export const checkEntityPermission: ImpureGraphFunction<
  {
    entityId: EntityId;
    permission: Subtype<
      ActionName,
      "viewEntity" | "updateEntity" | "archiveEntity"
    >;
  },
  Promise<boolean>
> = async (context, authentication, params) =>
  hasPermissionForEntities(context, authentication, {
    action: params.permission,
    entityIds: [params.entityId],
    includeDrafts: true,
    temporalAxes: currentTimeInstantTemporalAxes,
  }).then((data) => !!data[params.entityId]);

export const checkPermissionsOnEntity: ImpureGraphFunction<
  { entity: Pick<Entity, "metadata"> },
  Promise<UserPermissions>
> = async (graphContext, { actorId }, params) => {
  const { entity } = params;

  const { entityId } = entity.metadata.recordId;

  const isAccountGroup = entity.metadata.entityTypeIds.includes(
    systemEntityTypes.organization.entityTypeId,
  );

  const isPublicUser = actorId === publicUserAccountId;

  const [entityEditable, membersEditable] = await Promise.all([
    isPublicUser
      ? false
      : await checkEntityPermission(
          graphContext,
          { actorId },
          { entityId, permission: "updateEntity" },
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
    const latestEditionTimestamp = typedKeys(editionMap).sort().pop()!;
    const latestEdition = editionMap[latestEditionTimestamp];

    if (!latestEdition) {
      throw new Error("No latest edition found");
    }

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

export const calculateEntityDiff: ImpureGraphFunction<
  DiffEntityInput,
  Promise<DiffEntityResult>
> = async ({ graphApi }, { actorId }, params) =>
  graphApi.diffEntity(actorId, params).then(({ data }) => data);
