import { ApolloError } from "apollo-server-errors";

import {
  PersistedEntity,
  GraphApi,
  KnowledgeGraphQuery,
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
  ownedById: string;
  entityId: string;
  version: string;
  entityTypeModel: EntityTypeModel;
  properties: object;
};

export type EntityModelCreateParams = {
  ownedById: string;
  properties: object;
  entityTypeModel: EntityTypeModel;
  entityId?: string;
};

/**
 * @class {@link EntityModel}
 */
export default class {
  ownedById: string;

  entityId: string;
  version: string;
  entityTypeModel: EntityTypeModel;
  properties: object;

  constructor({
    ownedById,
    entityId,
    version,
    entityTypeModel,
    properties,
  }: EntityModelConstructorParams) {
    this.ownedById = ownedById;

    this.entityId = entityId;
    this.version = version;
    this.entityTypeModel = entityTypeModel;
    this.properties = properties;
  }

  private static async fromPersistedEntity(
    graphApi: GraphApi,
    { identifier, inner, entityTypeId }: PersistedEntity,
    cachedEntityTypeModels?: Map<string, EntityTypeModel>,
  ): Promise<EntityModel> {
    const { ownedById, entityId, version } = identifier;
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

    return new EntityModel({
      ownedById,
      entityId,
      version,
      entityTypeModel,
      properties: inner,
    });
  }

  /**
   * Create an entity.
   *
   * @param params.ownedById the id of the owner of the entity
   * @param params.schema an `Entity`
   */
  static async create(
    graphApi: GraphApi,
    {
      ownedById,
      entityTypeModel,
      properties,
      entityId: overrideEntityId,
    }: EntityModelCreateParams,
  ): Promise<EntityModel> {
    const {
      data: { entityId, version },
    } = await graphApi.createEntity({
      accountId: ownedById,
      entityTypeId: entityTypeModel.schema.$id,
      entity: properties,
      entityId: overrideEntityId,
    });

    return new EntityModel({
      ownedById,
      entityId,
      version,
      entityTypeModel,
      properties,
    });
  }

  /**
   * Create an entity along with any new/existing entities specified through links.
   *
   * @param params.ownedById - the id of owner of the entity
   * @param params.entityTypeId - the id of the entity's type
   * @param params.entityProperties - the properties of the entity
   * @param params.linkedEntities (optional) - the linked entity definitions of the entity
   */
  static async createEntityWithLinks(
    graphApi: GraphApi,
    params: {
      ownedById: string;
      entityTypeId: string;
      properties: any;
      linkedEntities?: PersistedLinkedEntityDefinition[];
    },
  ): Promise<EntityModel> {
    const { ownedById, entityTypeId, properties, linkedEntities } = params;

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
   */
  static async getOrCreate(
    graphApi: GraphApi,
    params: {
      ownedById: string;
      entityDefinition: Omit<PersistedEntityDefinition, "linkedEntities">;
    },
  ): Promise<EntityModel> {
    const { entityDefinition, ownedById } = params;
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
    query: object,
    options?: Omit<Partial<KnowledgeGraphQuery>, "query">,
  ): Promise<EntityModel[]> {
    const { data: entityRootedSubgraphs } = await graphApi.getEntitiesByQuery({
      query,
      dataTypeQueryDepth: options?.dataTypeQueryDepth ?? 0,
      propertyTypeQueryDepth: options?.propertyTypeQueryDepth ?? 0,
      linkTypeQueryDepth: options?.linkTypeQueryDepth ?? 0,
      entityTypeQueryDepth: options?.entityTypeQueryDepth ?? 0,
      linkTargetEntityQueryDepth: options?.linkTargetEntityQueryDepth ?? 0,
      linkQueryDepth: options?.linkQueryDepth ?? 0,
    });

    return await Promise.all(
      entityRootedSubgraphs.map(({ entity }) =>
        EntityModel.fromPersistedEntity(graphApi, entity),
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
      entityId: string;
    },
  ): Promise<EntityModel> {
    const { entityId } = params;
    const { data: persistedEntity } = await graphApi.getEntity(entityId);

    return await EntityModel.fromPersistedEntity(graphApi, persistedEntity);
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
   * @param params.schema an `Entity`
   */
  async update(
    graphApi: GraphApi,
    params: {
      properties: object;
    },
  ): Promise<EntityModel> {
    const { properties } = params;
    const { ownedById, entityId, entityTypeModel } = this;

    const {
      data: { version },
    } = await graphApi.updateEntity({
      /**
       * @todo: let caller update who owns the entity, or create new method dedicated to changing the owner of the entity
       * @see https://app.asana.com/0/1202805690238892/1203063463721793/f
       *
       * @todo: replace uses of `accountId` with `ownedById` in the Graph API
       * @see https://app.asana.com/0/1202805690238892/1203063463721791/f
       */
      accountId: ownedById,
      entityId,
      /** @todo: make this argument optional */
      entityTypeId: entityTypeModel.schema.$id,
      entity: properties,
    });

    return new EntityModel({
      ownedById,
      entityId,
      version,
      entityTypeModel,
      properties,
    });
  }

  /**
   * Update multiple top-level properties on an entity.
   *
   * @param params.updatedProperties - an array of the properties being updated
   * @returns
   */
  async updateProperties(
    graphApi: GraphApi,
    params: {
      updatedProperties: { propertyTypeBaseUri: string; value: any }[];
    },
  ): Promise<EntityModel> {
    const { updatedProperties } = params;

    return await this.update(graphApi, {
      properties: updatedProperties.reduce(
        (prev, { propertyTypeBaseUri, value }) => ({
          ...prev,
          [propertyTypeBaseUri]: value,
        }),
        this.properties,
      ),
    });
  }

  /**
   * Update a top-level property on an entity.
   *
   * @param params.propertyTypeBaseUri - the property type base URI of the property being updated
   * @param params.value - the updated value of the property
   */
  async updateProperty(
    graphApi: GraphApi,
    params: {
      propertyTypeBaseUri: string;
      value: any;
    },
  ): Promise<EntityModel> {
    const { propertyTypeBaseUri, value } = params;

    return await this.updateProperties(graphApi, {
      updatedProperties: [{ propertyTypeBaseUri, value }],
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
   * Get the outgoing links of an entity.
   *
   * @param params.linkTypeModel (optional) - the specific link type of the outgoing links
   */
  async getOutgoingLinks(
    graphApi: GraphApi,
    params?: { linkTypeModel?: LinkTypeModel },
  ): Promise<LinkModel[]> {
    const outgoingLinks = await LinkModel.getByQuery(graphApi, {
      all: [
        {
          eq: [{ path: ["source", "id"] }, { literal: this.entityId }],
        },
        params?.linkTypeModel
          ? {
              eq: [
                { path: ["type", "versionedUri"] },
                {
                  literal: params.linkTypeModel.schema.$id,
                },
              ],
            }
          : [],
      ].flat(),
    });

    return outgoingLinks;
  }
}
