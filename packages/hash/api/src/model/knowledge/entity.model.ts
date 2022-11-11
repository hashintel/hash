import { ApolloError } from "apollo-server-errors";
import {
  Entity,
  GraphApi,
  Vertex,
  Subgraph,
  EntityStructuralQuery,
  Filter,
  EntityMetadata,
} from "@hashintel/hash-graph-client";

import {
  EntityModel,
  EntityTypeModel,
  LinkModel,
  LinkModelCreateParams,
  LinkTypeModel,
} from "..";
import {
  PersistedEntityDefinition,
  PersistedLinkedEntityDefinition,
} from "../../graphql/apiTypes.gen";
import { exactlyOne, linkedTreeFlatten } from "../../util";

export type EntityModelConstructorParams = {
  entity: Entity;
  entityTypeModel: EntityTypeModel;
};

export type EntityModelCreateParams = {
  ownedById: string;
  properties: object;
  entityTypeModel: EntityTypeModel;
  entityId?: string;
  actorId: string;
};

/**
 * @class {@link EntityModel}
 */
export default class {
  private entity: Entity;

  entityTypeModel: EntityTypeModel;

  /** @todo: get rid of `entityId` accessor */
  get entityId(): string {
    return this.entity.metadata.editionId.baseId;
  }

  get metadata(): EntityMetadata {
    return this.entity.metadata;
  }

  get properties(): object {
    return this.entity.properties;
  }

  constructor({ entity, entityTypeModel }: EntityModelConstructorParams) {
    this.entity = entity;
    this.entityTypeModel = entityTypeModel;
  }

  private static async fromEntity(
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
      entityTypeId: entityTypeModel.schema.$id,
      entity: properties,
      entityUuid: overrideEntityId,
      actorId,
    });

    const entity: Entity = {
      properties,
      metadata,
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
      entityTypeId: string;
      properties: any;
      linkedEntities?: PersistedLinkedEntityDefinition[];
      actorId: string;
    },
  ): Promise<EntityModel> {
    const { ownedById, entityTypeId, properties, linkedEntities, actorId } =
      params;

    const entitiesInTree = linkedTreeFlatten<
      PersistedEntityDefinition,
      PersistedLinkedEntityDefinition,
      "linkedEntities",
      "entity"
    >(
      {
        entityType: { entityTypeId },
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
          const linkTypeModel = await LinkTypeModel.get(graphApi, {
            linkTypeId: link.meta.linkTypeId,
          });

          // links are created as an outgoing link from the parent entity to the children.
          await parentEntity.entity.createOutgoingLink(graphApi, {
            linkTypeModel,
            targetEntityModel: entity,
            index: link.meta.index ?? undefined,
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
      entityDefinition: Omit<PersistedEntityDefinition, "linkedEntities">;
      actorId: string;
    },
  ): Promise<EntityModel> {
    const { entityDefinition, ownedById, actorId } = params;
    const { entityProperties, existingEntity } = entityDefinition;

    let entity;

    if (existingEntity) {
      entity = await EntityModel.getLatest(graphApi, {
        entityId: existingEntity.entityId,
      });
      if (!entity) {
        throw new ApolloError(
          `Entity ${existingEntity.entityId} owned by ${existingEntity.ownedById} not found`,
          "NOT_FOUND",
        );
      }
    } else if (entityProperties) {
      const { entityType } = entityDefinition;
      const { entityTypeId } = entityType ?? {};

      if (!exactlyOne(entityTypeId)) {
        throw new ApolloError(
          `Given no valid type identifier. Must be one of entityTypeId`,
          "NOT_FOUND",
        );
      }

      const entityTypeModel = await EntityTypeModel.get(graphApi, {
        entityTypeId: entityTypeId!,
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
        dataTypeResolveDepth:
          options?.graphResolveDepths?.dataTypeResolveDepth ?? 0,
        propertyTypeResolveDepth:
          options?.graphResolveDepths?.propertyTypeResolveDepth ?? 0,
        // linkTypeResolveDepth:
        //   options?.graphResolveDepths?.linkTypeResolveDepth ?? 0,
        entityTypeResolveDepth:
          options?.graphResolveDepths?.entityTypeResolveDepth ?? 0,
        linkResolveDepth: options?.graphResolveDepths?.linkResolveDepth ?? 0,
        linkTargetEntityResolveDepth:
          options?.graphResolveDepths?.linkTargetEntityResolveDepth ?? 0,
      },
    });

    return await Promise.all(
      subgraph.roots.map((entityId) => {
        const entityVertex = subgraph.vertices[entityId] as Extract<
          Vertex,
          { kind: "entity" }
        >;
        return EntityModel.fromEntity(graphApi, entityVertex.inner);
      }),
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
      entityId: string;
    },
  ): Promise<EntityModel> {
    const { entityId } = params;
    const { data: persistedEntity } = await graphApi.getEntity(entityId);

    return await EntityModel.fromEntity(graphApi, persistedEntity);
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
      entityId: string;
      entityVersion: string;
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
      properties: object;
      actorId: string;
    },
  ): Promise<EntityModel> {
    const { properties, actorId } = params;
    const { entityId, entityTypeModel } = this;

    const { data: metadata } = await graphApi.updateEntity({
      actorId,
      entityId,
      /** @todo: make this argument optional */
      entityTypeId: entityTypeModel.schema.$id,
      entity: properties,
    });

    return EntityModel.fromEntity(graphApi, {
      metadata,
      properties,
    });
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
      properties: updatedProperties.reduce(
        (prev, { propertyTypeBaseUri, value }) => ({
          ...prev,
          [propertyTypeBaseUri]: value,
        }),
        this.properties,
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
    const { entityId } = this;

    return await EntityModel.getLatest(graphApi, { entityId });
  }

  /** @see {@link LinkModel.create} */
  async createOutgoingLink(
    graphApi: GraphApi,
    params: Omit<LinkModelCreateParams, "sourceEntityModel">,
  ): Promise<LinkModel> {
    return await LinkModel.create(graphApi, {
      sourceEntityModel: this,
      ...params,
    });
  }

  /** @see {@link LinkModel.createLinkWithoutUpdatingSiblings} */
  async createOutgoingLinkWithoutUpdatingSiblings(
    graphApi: GraphApi,
    params: Omit<LinkModelCreateParams, "sourceEntityModel">,
  ): Promise<LinkModel> {
    return await LinkModel.createLinkWithoutUpdatingSiblings(graphApi, {
      sourceEntityModel: this,
      ...params,
    });
  }

  /**
   * Get the incoming links of an entity.
   *
   * @param params.linkTypeModel (optional) - the specific link type of the incoming links
   */
  async getIncomingLinks(
    graphApi: GraphApi,
    params?: { linkTypeModel?: LinkTypeModel },
  ): Promise<LinkModel[]> {
    const filter: Filter = {
      all: [
        {
          equal: [{ path: ["target", "uuid"] }, { parameter: this.entityId }],
        },
      ],
    };

    if (params?.linkTypeModel) {
      filter.all.push({
        equal: [
          { path: ["type", "versionedUri"] },
          {
            parameter: params.linkTypeModel.schema.$id,
          },
        ],
      });
    }

    const incomingLinks = await LinkModel.getByQuery(graphApi, filter);

    return incomingLinks;
  }

  /**
   * Get the outgoing links of an entity.
   *
   * @param params.linkTypeModel (optional) - the specific link type of the outgoing links
   */
  async getOutgoingLinks(
    graphApi: GraphApi,
    params?: { linkTypeModel?: LinkTypeModel },
  ): Promise<LinkModel[]> {
    const filter: Filter = {
      all: [
        {
          equal: [{ path: ["source", "uuid"] }, { parameter: this.entityId }],
        },
      ],
    };

    if (params?.linkTypeModel) {
      filter.all.push({
        equal: [
          { path: ["type", "versionedUri"] },
          {
            parameter: params.linkTypeModel.schema.$id,
          },
        ],
      });
    }

    const outgoingLinks = await LinkModel.getByQuery(graphApi, filter);

    return outgoingLinks;
  }

  /**
   * Get subgraph rooted at the entity.
   */
  async getRootedSubgraph(
    graphApi: GraphApi,
    params: {
      linkResolveDepth: number;
      linkTargetEntityResolveDepth: number;
    },
  ): Promise<Subgraph> {
    const { data: entitySubgraph } = await graphApi.getEntitiesByQuery({
      filter: {
        all: [
          { equal: [{ path: ["version"] }, { parameter: "latest" }] },
          { equal: [{ path: ["uuid"] }, { parameter: this.entityId }] },
        ],
      },
      graphResolveDepths: {
        dataTypeResolveDepth: 0,
        propertyTypeResolveDepth: 0,
        // linkTypeResolveDepth: 0,
        entityTypeResolveDepth: 0,
        ...params,
      },
    });

    return entitySubgraph;
  }
}
