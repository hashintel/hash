import { BaseUri, VersionedUri } from "@blockprotocol/type-system";
import { Filter, GraphResolveDepths } from "@hashintel/hash-graph-client";
import {
  AccountId,
  EntityUuid,
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
  OwnedById,
} from "@hashintel/hash-shared/types";
import {
  Entity,
  EntityId,
  EntityMetadata,
  EntityTypeWithMetadata,
  PropertyObject,
  splitEntityId,
  Subgraph,
  SubgraphRootTypes,
} from "@hashintel/hash-subgraph";
import { getRootsAsEntities } from "@hashintel/hash-subgraph/src/stdlib/element/entity";
import { ApolloError } from "apollo-server-errors";

import {
  EntityDefinition,
  LinkedEntityDefinition,
} from "../../../graphql/api-types.gen";
import { linkedTreeFlatten } from "../../../util";
import { ImpureGraphFunction, zeroedGraphResolveDepths } from "../..";
import { getEntityTypeById } from "../../ontology/primitive/entity-type";
import {
  createLinkEntity,
  isEntityLinkEntity,
  LinkEntity,
} from "./link-entity";

export type CreateEntityParams = {
  ownedById: OwnedById;
  properties: PropertyObject;
  entityTypeId: VersionedUri;
  entityUuid?: EntityUuid;
  actorId: AccountId;
};

/** @todo: potentially directly export this from the subgraph package */
export type PropertyValue = PropertyObject[BaseUri];

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
> = async ({ graphApi }, params) => {
  const {
    ownedById,
    entityTypeId,
    properties,
    actorId,
    entityUuid: overrideEntityUuid,
  } = params;

  const { data: metadata } = await graphApi.createEntity({
    ownedById,
    entityTypeId,
    properties,
    entityUuid: overrideEntityUuid,
    actorId,
  });

  return {
    properties,
    metadata: metadata as EntityMetadata,
  };
};

/**
 * Get the latest version of an entity by its entity ID.
 *
 * @param params.entityId - the id of the entity
 */
export const getLatestEntityById: ImpureGraphFunction<
  {
    entityId: EntityId;
  },
  Promise<Entity>
> = async ({ graphApi }, params) => {
  const { entityId } = params;

  const [ownedById, entityUuid] = splitEntityId(entityId);

  const [entity, ...unexpectedEntities] = await graphApi
    .getEntitiesByQuery({
      filter: {
        all: [
          { equal: [{ path: ["version"] }, { parameter: "latest" }] },
          {
            equal: [{ path: ["uuid"] }, { parameter: entityUuid }],
          },
          {
            equal: [{ path: ["ownedById"] }, { parameter: ownedById }],
          },
          { equal: [{ path: ["archived"] }, { parameter: false }] },
        ],
      },
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
    })
    .then(({ data: subgraph }) => getRootsAsEntities(subgraph as Subgraph));

  if (unexpectedEntities.length > 0) {
    throw new Error(
      `Critical: Latest entity with entityId ${entityId} returned more than one result.`,
    );
  }

  if (!entity) {
    throw new Error(
      `Critical: Entity with entityId ${entityId} doesn't exist.`,
    );
  }

  return entity;
};

/**
 * Get or create an entity given either by new entity properties or a reference
 * to an existing entity.
 *
 * @param params.ownedById the id of owner of the entity
 * @param params.entityDefinition the definition of how to get or create the entity (excluding any linked entities)
 * @param params.actorId - the id of the account that is creating the entity
 */
export const getOrCreateEntity: ImpureGraphFunction<
  {
    ownedById: OwnedById;
    entityDefinition: Omit<EntityDefinition, "linkedEntities">;
    actorId: AccountId;
  },
  Promise<Entity>
> = async ({ graphApi }, params) => {
  const { entityDefinition, ownedById, actorId } = params;
  const { entityProperties, existingEntityId } = entityDefinition;

  let entity;

  if (existingEntityId) {
    entity = await getLatestEntityById(
      { graphApi },
      {
        entityId: existingEntityId,
      },
    );

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- account for old browsers
    if (!entity) {
      throw new ApolloError(
        `Entity ${existingEntityId} not found`,
        "NOT_FOUND",
      );
    }
  } else if (entityProperties) {
    const { entityTypeId } = entityDefinition;

    if (!entityTypeId) {
      throw new ApolloError(
        `Given no valid type identifier. Must be one of entityTypeId`,
        "NOT_FOUND",
      );
    }

    const entityType = await getEntityTypeById(
      { graphApi },
      {
        entityTypeId,
      },
    );

    entity = await createEntity(
      { graphApi },
      {
        ownedById,
        entityTypeId: entityType.schema.$id,
        properties: entityProperties,
        actorId,
      },
    );
  } else {
    throw new Error(
      `entityType and one of entityId OR entityProperties must be provided`,
    );
  }

  return entity;
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
    entityTypeId: VersionedUri;
    properties: PropertyObject;
    linkedEntities?: LinkedEntityDefinition[];
    actorId: AccountId;
  },
  Promise<Entity>
> = async ({ graphApi }, params) => {
  const { ownedById, entityTypeId, properties, linkedEntities, actorId } =
    params;

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
   * @todo Once the graph API validates the required links of entities on creation, this may have to be reworked in order
   *   to create valid entities.
   *   this code currently creates entities first, then links them together.
   *   See https://app.asana.com/0/1202805690238892/1203046447168478/f
   */
  const entities = await Promise.all(
    entitiesInTree.map(async (definition) => ({
      link: definition.meta
        ? {
            parentIndex: definition.parentIndex,
            meta: definition.meta,
          }
        : undefined,
      entity: await getOrCreateEntity(
        { graphApi },
        {
          ownedById,
          entityDefinition: definition,
          actorId,
        },
      ),
    })),
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
        const linkEntityType = await getEntityTypeById(
          { graphApi },
          {
            entityTypeId: link.meta.linkEntityTypeId,
          },
        );

        // links are created as an outgoing link from the parent entity to the children.
        await createLinkEntity(
          { graphApi },
          {
            linkEntityType,
            leftEntityId: parentEntity.entity.metadata.editionId.baseId,
            rightEntityId: entity.metadata.editionId.baseId,
            leftToRightOrder: link.meta.index ?? undefined,
            ownedById,
            actorId,
          },
        );
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
    properties: PropertyObject;
    actorId: AccountId;
  },
  Promise<Entity>
> = async ({ graphApi }, params) => {
  const { entity, properties, actorId } = params;

  const { data: metadata } = await graphApi.updateEntity({
    actorId,
    entityId: entity.metadata.editionId.baseId,
    /**
     * @todo: this field could be optional when updating an entity
     *
     * @see https://app.asana.com/0/1201095311341924/1203285029221330/f
     * */
    entityTypeId: entity.metadata.entityTypeId,
    archived: entity.metadata.archived,
    properties,
  });

  return { ...entity, metadata: metadata as EntityMetadata, properties };
};

export const archiveEntity: ImpureGraphFunction<
  {
    entity: Entity;
    actorId: AccountId;
  },
  Promise<void>
> = async ({ graphApi }, params) => {
  const { entity, actorId } = params;
  await graphApi.updateEntity({
    entityId: entity.metadata.editionId.baseId,
    archived: true,
    actorId,
    /**
     * @todo: these fields shouldn't be required when archiving an entity
     *
     * @see https://app.asana.com/0/1201095311341924/1203285029221330/f
     * */
    entityTypeId: entity.metadata.entityTypeId,
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
      propertyTypeBaseUri: BaseUri;
      value: PropertyValue | undefined | undefined;
    }[];
    actorId: AccountId;
  },
  Promise<Entity>
> = async (ctx, params) => {
  const { entity, updatedProperties, actorId } = params;

  return await updateEntity(ctx, {
    entity,
    properties: updatedProperties.reduce<PropertyObject>(
      (prev, { propertyTypeBaseUri, value }) =>
        value
          ? {
              ...prev,
              [propertyTypeBaseUri]: value,
            }
          : prev,
      entity.properties,
    ),
    actorId,
  });
};

/**
 * Update a top-level property on an entity.
 *
 * @param params.entity - the entity being updated
 * @param params.propertyTypeBaseUri - the property type base URI of the property being updated
 * @param params.value - the updated value of the property
 * @param params.actorId - the id of the account that is updating the entity
 */
export const updateEntityProperty: ImpureGraphFunction<
  {
    entity: Entity;
    propertyTypeBaseUri: BaseUri;
    value: PropertyValue | undefined;
    actorId: AccountId;
  },
  Promise<Entity>
> = async (ctx, params) => {
  const { entity, propertyTypeBaseUri, value, actorId } = params;

  return await updateEntityProperties(ctx, {
    entity,
    updatedProperties: [{ propertyTypeBaseUri, value }],
    actorId,
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
    entity: Entity;
    linkEntityType?: EntityTypeWithMetadata;
  },
  Promise<LinkEntity[]>
> = async ({ graphApi }, params) => {
  const { entity } = params;
  const filter: Filter = {
    all: [
      {
        equal: [
          { path: ["rightEntity", "uuid"] },
          {
            parameter: extractEntityUuidFromEntityId(
              entity.metadata.editionId.baseId,
            ),
          },
        ],
      },
      {
        equal: [
          { path: ["rightEntity", "ownedById"] },
          {
            parameter: extractOwnedByIdFromEntityId(
              entity.metadata.editionId.baseId,
            ),
          },
        ],
      },
      {
        equal: [{ path: ["version"] }, { parameter: "latest" }],
      },
      {
        equal: [{ path: ["archived"] }, { parameter: false }],
      },
    ],
  };

  if (params.linkEntityType) {
    filter.all.push({
      equal: [
        { path: ["type", "versionedUri"] },
        {
          parameter: params.linkEntityType.schema.$id,
        },
      ],
    });
  }

  const incomingLinkEntitiesSubgraph = await graphApi
    .getEntitiesByQuery({
      filter,
      graphResolveDepths: zeroedGraphResolveDepths,
    })
    .then(({ data }) => data as Subgraph<SubgraphRootTypes["entity"]>);

  const incomingLinkEntities = getRootsAsEntities(
    incomingLinkEntitiesSubgraph,
  ).map((linkEntity) => {
    if (!isEntityLinkEntity(linkEntity)) {
      throw new Error(
        `Entity with ID ${linkEntity.metadata.editionId.baseId} is not a link entity.`,
      );
    }
    return linkEntity;
  });

  return incomingLinkEntities;
};

/**
 * Get the outgoing links of an entity.
 *
 * @param params.entity - the entity
 * @param params.linkEntityType (optional) - the specific link type of the outgoing links
 */
export const getEntityOutgoingLinks: ImpureGraphFunction<
  {
    entity: Entity;
    linkEntityType?: EntityTypeWithMetadata;
    rightEntity?: Entity;
  },
  Promise<LinkEntity[]>
> = async ({ graphApi }, params) => {
  const { entity } = params;
  const filter: Filter = {
    all: [
      {
        equal: [
          { path: ["leftEntity", "uuid"] },
          {
            parameter: extractEntityUuidFromEntityId(
              entity.metadata.editionId.baseId,
            ),
          },
        ],
      },
      {
        equal: [
          { path: ["leftEntity", "ownedById"] },
          {
            parameter: extractOwnedByIdFromEntityId(
              entity.metadata.editionId.baseId,
            ),
          },
        ],
      },
      {
        equal: [{ path: ["version"] }, { parameter: "latest" }],
      },
      {
        equal: [{ path: ["archived"] }, { parameter: false }],
      },
    ],
  };

  if (params.linkEntityType) {
    filter.all.push({
      equal: [
        { path: ["type", "versionedUri"] },
        {
          parameter: params.linkEntityType.schema.$id,
        },
      ],
    });
  }

  if (params.rightEntity) {
    filter.all.push(
      {
        equal: [
          { path: ["rightEntity", "uuid"] },
          {
            parameter: extractEntityUuidFromEntityId(
              params.rightEntity.metadata.editionId.baseId,
            ),
          },
        ],
      },
      {
        equal: [
          { path: ["rightEntity", "ownedById"] },
          {
            parameter: extractOwnedByIdFromEntityId(
              params.rightEntity.metadata.editionId.baseId,
            ),
          },
        ],
      },
    );
  }

  const outgoingLinkEntitiesSubgraph = await graphApi
    .getEntitiesByQuery({
      filter,
      graphResolveDepths: zeroedGraphResolveDepths,
    })
    .then(({ data }) => data as Subgraph<SubgraphRootTypes["entity"]>);

  const outgoingLinkEntities = getRootsAsEntities(
    outgoingLinkEntitiesSubgraph,
  ).map((linkEntity) => {
    if (!isEntityLinkEntity(linkEntity)) {
      throw new Error(
        `Entity with ID ${linkEntity.metadata.editionId.baseId} is not a link entity.`,
      );
    }
    return linkEntity;
  });

  return outgoingLinkEntities;
};

/**
 * Get subgraph rooted at the entity.
 *
 * @param params.entity - the entity
 * @param params.graphResolveDepths - the custom resolve depths of the subgraph
 */
export const getLatestEntityRootedSubgraph: ImpureGraphFunction<
  { entity: Entity; graphResolveDepths: Partial<GraphResolveDepths> },
  Promise<Subgraph<SubgraphRootTypes["entity"]>>
> = async ({ graphApi }, params) => {
  const { entity, graphResolveDepths } = params;

  const { data: entitySubgraph } = await graphApi.getEntitiesByQuery({
    filter: {
      all: [
        { equal: [{ path: ["version"] }, { parameter: "latest" }] },
        {
          equal: [
            { path: ["uuid"] },
            {
              parameter: extractEntityUuidFromEntityId(
                entity.metadata.editionId.baseId,
              ),
            },
          ],
        },
        {
          equal: [
            { path: ["ownedById"] },
            {
              parameter: extractOwnedByIdFromEntityId(
                entity.metadata.editionId.baseId,
              ),
            },
          ],
        },
        { equal: [{ path: ["archived"] }, { parameter: false }] },
      ],
    },
    graphResolveDepths: {
      inheritsFrom: { outgoing: 0 },
      constrainsValuesOn: { outgoing: 0 },
      constrainsPropertiesOn: { outgoing: 0 },
      constrainsLinksOn: { outgoing: 0 },
      constrainsLinkDestinationsOn: { outgoing: 0 },
      isOfType: { outgoing: 0 },
      hasLeftEntity: { incoming: 0, outgoing: 0 },
      hasRightEntity: { incoming: 0, outgoing: 0 },
      ...graphResolveDepths,
    },
  });

  return entitySubgraph as Subgraph<SubgraphRootTypes["entity"]>;
};
