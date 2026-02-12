import {
  type EntityRootType,
  isEntityVertex,
  type QueryTemporalAxesUnresolved,
  type Subgraph,
} from "@blockprotocol/graph";
import type {
  BaseUrl,
  Entity,
  EntityEditionId,
  EntityId,
  LinkData,
  PropertyObject,
  PropertyPatchOperation,
  TeamId,
  TypeIdsAndPropertiesForEntity,
  VersionedUrl,
  WebId,
} from "@blockprotocol/type-system";
import {
  extractDraftIdFromEntityId,
  extractEntityUuidFromEntityId,
  extractWebIdFromEntityId,
  splitEntityId,
} from "@blockprotocol/type-system";
import type { Subtype } from "@local/advanced-types/subtype";
import { typedKeys } from "@local/advanced-types/typed-entries";
import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";
import type {
  AllFilter,
  CountEntitiesParams,
  DiffEntityResult,
  Filter,
  HasPermissionForEntitiesParams,
} from "@local/hash-graph-client";
import type {
  UserPermissions,
  UserPermissionsOnEntities,
} from "@local/hash-graph-sdk/authorization";
import {
  type CreateEntityParameters,
  type DiffEntityInput,
  HashEntity,
  HashLinkEntity,
  queryEntities,
  queryEntitySubgraph,
} from "@local/hash-graph-sdk/entity";
import { getActorGroupRole } from "@local/hash-graph-sdk/principal/actor-group";
import {
  enabledFeatureFlagsPropertyBaseUrl,
  shortnamePropertyBaseUrl,
} from "@local/hash-graph-sdk/user-entity-restrictions";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { UserProperties } from "@local/hash-isomorphic-utils/system-types/user";
import type { ActionName } from "@rust/hash-graph-authorization/types";
import type { TraversalPath } from "@rust/hash-graph-store/types";

import type {
  EntityDefinition,
  LinkedEntityDefinition,
} from "../../../graphql/api-types.gen";
import * as GraphQlError from "../../../graphql/error";
import { linkedTreeFlatten } from "../../../util";
import type { ImpureGraphFunction } from "../../context-types";
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

export const countEntities: ImpureGraphFunction<
  CountEntitiesParams,
  Promise<number>
> = async ({ graphApi }, { actorId }, params) =>
  graphApi.countEntities(actorId, params).then(({ data }) => data);

type GetLatestEntityByIdFunction<
  Properties extends
    TypeIdsAndPropertiesForEntity = TypeIdsAndPropertiesForEntity,
> = ImpureGraphFunction<
  {
    entityId: EntityId;
  },
  Promise<HashEntity<Properties>>
>;

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
export const getLatestEntityById = async <
  Properties extends
    TypeIdsAndPropertiesForEntity = TypeIdsAndPropertiesForEntity,
>(
  ...args: Parameters<GetLatestEntityByIdFunction<Properties>>
): ReturnType<GetLatestEntityByIdFunction<Properties>> => {
  const [context, authentication, { entityId }] = args;

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
      exists: { path: ["draftId"] },
    });
  }

  const {
    entities: [entity, ...unexpectedEntities],
  } = await queryEntities<Properties>(context, authentication, {
    filter: {
      all: allFilter,
    },
    temporalAxes: currentTimeInstantTemporalAxes,
    includeDrafts: !!draftId,
    includePermissions: false,
  });

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
        ? await getLatestEntityById<Properties>(context, authentication, {
            entityId: existingEntityId,
          })
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
    throw GraphQlError.internal("Could not create entity tree");
  }

  await Promise.all(
    entities.map(async ({ link, entity }) => {
      if (link) {
        const parentEntity = entities[link.parentIndex];
        if (!parentEntity) {
          throw GraphQlError.notFound("Could not find parent entity");
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
      archived?: boolean;
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

  /**
   * The SDK's patch method auto-enforces the base user property whitelist.
   * Here we extend it with properties that have special authorization
   * (validated by the before-update hook which runs above).
   *
   * - enabledFeatureFlags: the hook checks admin privileges
   * - shortname: the hook allows it only for incomplete users (first-time signup)
   */
  const additionalAllowedUrls = new Set([enabledFeatureFlagsPropertyBaseUrl]);

  const { shortname } = simplifyProperties<UserProperties>(
    entity.properties as UserProperties,
  );
  if (!shortname) {
    additionalAllowedUrls.add(shortnamePropertyBaseUrl);
  }

  const updatedEntity = await entity.patch(
    graphApi,
    { actorId },
    {
      entityTypeIds,
      draft: params.draft,
      propertyPatches,
      provenance: context.provenance,
      archived: params.archived,
      additionalAllowedPropertyBaseUrls: additionalAllowedUrls,
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

  return await queryEntities(context, authentication, {
    filter,
    temporalAxes: currentTimeInstantTemporalAxes,
    includeDrafts,
    includePermissions: false,
  }).then(({ entities }) =>
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

  return await queryEntities(context, authentication, {
    filter,
    temporalAxes: currentTimeInstantTemporalAxes,
    includeDrafts,
    includePermissions: false,
  }).then(({ entities }) =>
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
 * @param params.entityId - the entityId of the entity
 * @param params.graphResolveDepths - the custom resolve depths of the subgraph
 */
export const getLatestEntityRootedSubgraph: ImpureGraphFunction<
  {
    entityId: EntityId;
    traversalPaths: TraversalPath[];
  },
  Promise<Subgraph<EntityRootType<HashEntity>>>,
  false,
  true
> = async (context, authentication, params) => {
  const { entityId, traversalPaths } = params;

  const { subgraph } = await queryEntitySubgraph(context, authentication, {
    filter: {
      all: [
        {
          equal: [
            { path: ["uuid"] },
            {
              parameter: extractEntityUuidFromEntityId(entityId),
            },
          ],
        },
        {
          equal: [
            { path: ["webId"] },
            {
              parameter: extractWebIdFromEntityId(entityId),
            },
          ],
        },
        { equal: [{ path: ["archived"] }, { parameter: false }] },
      ],
    },
    traversalPaths,
    temporalAxes: currentTimeInstantTemporalAxes,
    includeDrafts: false,
    includePermissions: false,
  });

  return subgraph;
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
      ? Promise.resolve(false)
      : await checkEntityPermission(
          graphContext,
          { actorId },
          { entityId, permission: "updateEntity" },
        ),
    isAccountGroup
      ? isPublicUser
        ? Promise.resolve(false)
        : await getActorGroupRole(
            graphContext.graphApi,
            { actorId },
            {
              actorId,
              actorGroupId: extractEntityUuidFromEntityId(entityId) as
                | WebId
                | TeamId,
            },
          ).then((role) => role === "administrator")
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

export const calculateEntityDiff: ImpureGraphFunction<
  DiffEntityInput,
  Promise<DiffEntityResult>
> = async ({ graphApi }, { actorId }, params) =>
  graphApi.diffEntity(actorId, params).then(({ data }) => data);
