import { ApolloError } from "apollo-server-errors";
import {
  GraphApi,
  EntityStructuralQuery,
  Filter,
} from "@hashintel/hash-graph-client";
import {
  Entity,
  Subgraph,
  EntityMetadata,
  PropertyObject,
  EntityId,
  EntityVersion,
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
  splitEntityId,
} from "@hashintel/hash-subgraph";
import { getRootsAsEntities } from "@hashintel/hash-subgraph/src/stdlib/element/entity";
import { VersionedUri } from "@blockprotocol/type-system-web";
import {
  EntityModel,
  EntityTypeModel,
  LinkEntityModel,
  LinkModelCreateParams,
} from "..";
import {
  LinkedEntityDefinition,
  EntityDefinition,
} from "../../graphql/apiTypes.gen";
import { linkedTreeFlatten } from "../../util";

export type EntityModelConstructorParams = {
  entity: Entity;
  entityTypeModel: EntityTypeModel;
};

export type EntityModelCreateParams = {
  ownedById: string;
  properties: PropertyObject;
  entityTypeModel: EntityTypeModel;
  entityId?: string;
  actorId: string;
};

/**
 * @class {@link EntityModel}
 */
export default class {
  entity: Entity;

  entityTypeModel: EntityTypeModel;

  constructor({ entity, entityTypeModel }: EntityModelConstructorParams) {
    this.entity = entity;
    this.entityTypeModel = entityTypeModel;
  }

  getVersion(): string {
    return this.getMetadata().editionId.version;
  }

  getBaseId(): EntityId {
    return this.getMetadata().editionId.baseId;
  }

  getMetadata(): EntityMetadata {
    return this.entity.metadata;
  }

  getProperties(): PropertyObject {
    return this.entity.properties;
  }

  getOwnedById(): string {
    return extractOwnedByIdFromEntityId(this.getBaseId());
  }

  getEntityUuid(): string {
    return extractEntityUuidFromEntityId(this.getBaseId());
  }

  static async fromEntity(
    graphApi: GraphApi,
    entity: Entity,
    cachedEntityTypeModels?: Map<string, EntityTypeModel>,
  ): Promise<EntityModel> {
    const {
      metadata: { entityTypeId },
    } = entity;

    const cachedEntityTypeModel = cachedEntityTypeModels?.get(entityTypeId);

    let entityTypeModel: EntityTypeModel;

    if (cachedEntityTypeModel) {
      entityTypeModel = cachedEntityTypeModel;
    } else {
      entityTypeModel = await EntityTypeModel.get(graphApi, { entityTypeId });
      if (cachedEntityTypeModels) {
        cachedEntityTypeModels.set(entityTypeId, entityTypeModel);
      }
    }

    return new EntityModel({ entity, entityTypeModel });
  }

  /**
   * Create an entity.
   *
   * @param params.ownedById - the id of the account who owns the entity
   * @param params.entityTypeModel - the type of the entity
   * @param params.properties - the properties object of the entity
   * @param params.actorId - the id of the account that is creating the entity
   * @param params.entityId (optional) - the id of the entity, is generated if left undefined
   */
  static async create(
    graphApi: GraphApi,
    params: EntityModelCreateParams,
  ): Promise<EntityModel> {
    const {
      ownedById,
      entityTypeModel,
      properties,
      actorId,
      entityId: overrideEntityId,
    } = params;

    const { data: metadata } = await graphApi.createEntity({
      ownedById,
      entityTypeId: entityTypeModel.getSchema().$id,
      properties,
      entityUuid: overrideEntityId,
      actorId,
    });

    const entity: Entity = {
      properties,
      metadata: metadata as EntityMetadata,
    };

    return EntityModel.fromEntity(graphApi, entity);
  }

  /**
   * Create an entity along with any new/existing entities specified through links.
   *
   * @param params.ownedById - the id of owner of the entity
   * @param params.entityTypeId - the id of the entity's type
   * @param params.entityProperties - the properties of the entity
   * @param params.linkedEntities (optional) - the linked entity definitions of the entity
   * @param params.actorId - the id of the account that is creating the entity
   */
  static async createEntityWithLinks(
    graphApi: GraphApi,
    params: {
      ownedById: string;
      entityTypeId: VersionedUri;
      properties: PropertyObject;
      linkedEntities?: LinkedEntityDefinition[];
      actorId: string;
    },
  ): Promise<EntityModel> {
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
        entity: await EntityModel.getOrCreate(graphApi, {
          ownedById,
          entityDefinition: definition,
          actorId,
        }),
      })),
    );

    let rootEntityModel: EntityModel;
    if (entities[0]) {
      // First element will be the root entity.
      rootEntityModel = entities[0].entity;
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
          const linkEntityTypeModel = await EntityTypeModel.get(graphApi, {
            entityTypeId: link.meta.linkEntityTypeId,
          });

          // links are created as an outgoing link from the parent entity to the children.
          await parentEntity.entity.createOutgoingLink(graphApi, {
            linkEntityTypeModel,
            rightEntityModel: entity,
            leftOrder: link.meta.index ?? undefined,
            ownedById,
            actorId,
          });
        }
      }),
    );

    return rootEntityModel;
  }

  /**
   * Get or create an entity given either by new entity properties or a reference
   * to an existing entity.
   *
   * @param params.ownedById the id of owner of the entity
   * @param params.entityDefinition the definition of how to get or create the entity (excluding any linked entities)
   * @param params.createdById - the id of the account that is creating the entity
   */
  static async getOrCreate(
    graphApi: GraphApi,
    params: {
      ownedById: string;
      entityDefinition: Omit<EntityDefinition, "linkedEntities">;
      actorId: string;
    },
  ): Promise<EntityModel> {
    const { entityDefinition, ownedById, actorId } = params;
    const { entityProperties, existingEntityId } = entityDefinition;

    let entity;

    if (existingEntityId) {
      entity = await EntityModel.getLatest(graphApi, {
        entityId: existingEntityId,
      });
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

      const entityTypeModel = await EntityTypeModel.get(graphApi, {
        entityTypeId,
      });

      entity = await EntityModel.create(graphApi, {
        ownedById,
        entityTypeModel,
        properties: entityProperties,
        actorId,
      });
    } else {
      throw new Error(
        `entityType and one of entityId OR entityProperties must be provided`,
      );
    }

    return entity;
  }

  static async getByQuery(
    graphApi: GraphApi,
    filter: Filter,
    options?: Omit<Partial<EntityStructuralQuery>, "filter">,
  ): Promise<EntityModel[]> {
    const { data: subgraph } = await graphApi.getEntitiesByQuery({
      filter,
      graphResolveDepths: {
        constrainsValuesOn:
          options?.graphResolveDepths?.constrainsValuesOn ?? 0,
        propertyTypeResolveDepth:
          options?.graphResolveDepths?.propertyTypeResolveDepth ?? 0,
        entityTypeResolveDepth:
          options?.graphResolveDepths?.entityTypeResolveDepth ?? 0,
        entityResolveDepth:
          options?.graphResolveDepths?.entityResolveDepth ?? 0,
      },
    });

    return await Promise.all(
      getRootsAsEntities(subgraph as Subgraph).map((entity) =>
        EntityModel.fromEntity(graphApi, entity),
      ),
    );
  }

  /**
   * Get the latest version of an entity by its entity ID.
   *
   * @param params.entityId - the id of the entity
   */
  static async getLatest(
    graphApi: GraphApi,
    params: {
      entityId: EntityId;
    },
  ): Promise<EntityModel> {
    const { entityId } = params;
    const { data: entity } = await graphApi.getEntity(entityId);

    const [ownedById, entityUuid] = splitEntityId(entityId);

    const [entityModel, ...unexpectedEntities] = await EntityModel.getByQuery(
      graphApi,
      {
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
    );

    if (unexpectedEntities.length > 0) {
      throw new Error(
        `Critical: Latest entity with entityId ${entityId} returned more than one result.`,
      );
    }

    if (!entityModel) {
      throw new Error(
        `Critical: Entity with entityId ${entityId} doesn't exist.`,
      );
    }

    return await EntityModel.fromEntity(graphApi, entity as Entity);
  }

  /**
   * Get a specific version of an entity.
   *
   * @param params.entityId - the id of the entity
   * @param params.version - the version of the entity
   */
  static async getVersion(
    _graphApi: GraphApi,
    _params: {
      entityId: EntityId;
      entityVersion: EntityVersion;
    },
  ): Promise<EntityModel> {
    throw new Error(
      "Getting the specific version of an entity is not yet implemented.",
    );
  }

  /**
   * Update an entity.
   *
   * @param params.properties - the properties object of the entity
   * @param params.actorId - the id of the account that is updating the entity
   */
  async update(
    graphApi: GraphApi,
    params: {
      properties: PropertyObject;
      actorId: string;
    },
  ): Promise<EntityModel> {
    const { properties, actorId } = params;
    const { entityTypeModel } = this;

    const { data: metadata } = await graphApi.updateEntity({
      actorId,
      entityId: this.getBaseId(),
      /** @todo: make this argument optional */
      entityTypeId: entityTypeModel.getSchema().$id,
      properties,
    });

    return EntityModel.fromEntity(graphApi, {
      metadata: metadata as EntityMetadata,
      properties,
    });
  }

  async archive(graphApi: GraphApi, params: { actorId: string }) {
    const { actorId } = params;
    await graphApi.archiveEntity({ entityId: this.getBaseId(), actorId });
  }

  /**
   * Update multiple top-level properties on an entity.
   *
   * @param params.updatedProperties - an array of the properties being updated
   * @param params.actorId - the id of the account that is updating the entity
   */
  async updateProperties(
    graphApi: GraphApi,
    params: {
      updatedProperties: { propertyTypeBaseUri: string; value: any }[];
      actorId: string;
    },
  ): Promise<EntityModel> {
    const { updatedProperties, actorId } = params;

    return await this.update(graphApi, {
      properties: updatedProperties.reduce<PropertyObject>(
        (prev, { propertyTypeBaseUri, value }) => ({
          ...prev,
          [propertyTypeBaseUri]: value,
        }),
        this.getProperties(),
      ),
      actorId,
    });
  }

  /**
   * Update a top-level property on an entity.
   *
   * @param params.propertyTypeBaseUri - the property type base URI of the property being updated
   * @param params.value - the updated value of the property
   * @param params.actorId - the id of the account that is updating the entity
   */
  async updateProperty(
    graphApi: GraphApi,
    params: {
      propertyTypeBaseUri: string;
      value: any;
      actorId: string;
    },
  ): Promise<EntityModel> {
    const { propertyTypeBaseUri, value, actorId } = params;

    return await this.updateProperties(graphApi, {
      updatedProperties: [{ propertyTypeBaseUri, value }],
      actorId,
    });
  }

  /**
   * Get the latest version of this entity.
   */
  async getLatestVersion(graphApi: GraphApi) {
    return await EntityModel.getLatest(graphApi, {
      entityId: this.getBaseId(),
    });
  }

  /** @see {@link LinkModel.create} */
  async createOutgoingLink(
    graphApi: GraphApi,
    params: Omit<LinkModelCreateParams, "leftEntityModel">,
  ): Promise<LinkEntityModel> {
    return await LinkEntityModel.createLinkEntity(graphApi, {
      leftEntityModel: this,
      ...params,
    });
  }

  /**
   * Get the incoming links of an entity.
   *
   * @param params.linkEntityTypeModel (optional) - the specific link entity type of the incoming links
   */
  async getIncomingLinks(
    graphApi: GraphApi,
    params?: { linkEntityTypeModel?: EntityTypeModel },
  ): Promise<LinkEntityModel[]> {
    const filter: Filter = {
      all: [
        {
          equal: [
            { path: ["rightEntity", "uuid"] },
            { parameter: this.getEntityUuid() },
          ],
        },
        {
          equal: [
            { path: ["rightEntity", "ownedById"] },
            { parameter: this.getOwnedById() },
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

    if (params?.linkEntityTypeModel) {
      filter.all.push({
        equal: [
          { path: ["type", "versionedUri"] },
          {
            parameter: params.linkEntityTypeModel.getSchema().$id,
          },
        ],
      });
    }

    const incomingLinkEntityModels = await EntityModel.getByQuery(
      graphApi,
      filter,
    );

    return await Promise.all(
      incomingLinkEntityModels.map((entityModel) =>
        LinkEntityModel.fromEntity(graphApi, entityModel.entity),
      ),
    );
  }

  /**
   * Get the outgoing links of an entity.
   *
   * @param params.linkEntityTypeModel (optional) - the specific link type of the outgoing links
   */
  async getOutgoingLinks(
    graphApi: GraphApi,
    params?: {
      linkEntityTypeModel?: EntityTypeModel;
      rightEntityModel?: EntityModel;
    },
  ): Promise<LinkEntityModel[]> {
    const filter: Filter = {
      all: [
        {
          equal: [
            { path: ["leftEntity", "uuid"] },
            { parameter: this.getEntityUuid() },
          ],
        },
        {
          equal: [
            { path: ["leftEntity", "ownedById"] },
            { parameter: this.getOwnedById() },
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

    if (params?.linkEntityTypeModel) {
      filter.all.push({
        equal: [
          { path: ["type", "versionedUri"] },
          {
            parameter: params.linkEntityTypeModel.getSchema().$id,
          },
        ],
      });
    }

    if (params?.rightEntityModel) {
      filter.all.push(
        {
          equal: [
            { path: ["rightEntity", "uuid"] },
            { parameter: params.rightEntityModel.getEntityUuid() },
          ],
        },
        {
          equal: [
            { path: ["rightEntity", "ownedById"] },
            { parameter: params.rightEntityModel.getOwnedById() },
          ],
        },
      );
    }

    const outgoingLinkEntityModels = await EntityModel.getByQuery(
      graphApi,
      filter,
    );

    return Promise.all(
      outgoingLinkEntityModels.map((entityModel) =>
        LinkEntityModel.fromEntity(graphApi, entityModel.entity),
      ),
    );
  }

  /**
   * Get subgraph rooted at the entity.
   */
  async getRootedSubgraph(
    graphApi: GraphApi,
    params: {
      entityResolveDepth: number;
    },
  ): Promise<Subgraph> {
    const { data: entitySubgraph } = await graphApi.getEntitiesByQuery({
      filter: {
        all: [
          { equal: [{ path: ["version"] }, { parameter: "latest" }] },
          { equal: [{ path: ["uuid"] }, { parameter: this.getEntityUuid() }] },
          {
            equal: [
              { path: ["ownedById"] },
              { parameter: this.getOwnedById() },
            ],
          },
          { equal: [{ path: ["archived"] }, { parameter: false }] },
        ],
      },
      graphResolveDepths: {
        constrainsValuesOn: 0,
        propertyTypeResolveDepth: 0,
        entityTypeResolveDepth: 0,
        ...params,
      },
    });

    return entitySubgraph as Subgraph;
  }
}
