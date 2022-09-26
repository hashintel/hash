import { PersistedEntity, GraphApi } from "@hashintel/hash-graph-client";
import { ApolloError } from "apollo-server-errors";

import {
  EntityModel,
  EntityTypeModel,
  LinkModel,
  LinkModelCreateParams,
  LinkTypeModel,
} from "..";
import {
  KnowledgeEntityDefinition,
  KnowledgeLinkedEntityDefinition,
} from "../../graphql/apiTypes.gen";
import { exactlyOne, linkedTreeFlatten } from "../../util";

export type EntityModelConstructorParams = {
  accountId: string;
  entityId: string;
  version: string;
  entityTypeModel: EntityTypeModel;
  properties: object;
};

export type EntityModelCreateParams = {
  accountId: string;
  properties: object;
  entityTypeModel: EntityTypeModel;
  entityId?: string;
};

/**
 * @class {@link EntityModel}
 */
export default class {
  accountId: string;

  entityId: string;
  version: string;
  entityTypeModel: EntityTypeModel;
  properties: object;

  constructor({
    accountId,
    entityId,
    version,
    entityTypeModel,
    properties,
  }: EntityModelConstructorParams) {
    this.accountId = accountId;

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
    const { ownedById: accountId, version } = identifier;
    const cachedEntityTypeModel = cachedEntityTypeModels?.get(entityTypeId);

    let entityTypeModel: EntityTypeModel;

    if (cachedEntityTypeModel) {
      entityTypeModel = cachedEntityTypeModel;
    } else {
      entityTypeModel = await EntityTypeModel.get(graphApi, {
        versionedUri: entityTypeId,
      });
      if (cachedEntityTypeModels) {
        cachedEntityTypeModels.set(entityTypeId, entityTypeModel);
      }
    }

    return new EntityModel({
      accountId,
      entityId: identifier.entityId,
      version,
      entityTypeModel,
      properties: inner,
    });
  }

  /**
   * Create an entity.
   *
   * @param params.accountId the accountId of the account creating the entity
   * @param params.schema an `Entity`
   */
  static async create(
    graphApi: GraphApi,
    {
      accountId,
      entityTypeModel,
      properties,
      entityId: overrideEntityId,
    }: EntityModelCreateParams,
  ): Promise<EntityModel> {
    const {
      data: { entityId, version },
    } = await graphApi.createEntity({
      accountId,
      entityTypeId: entityTypeModel.schema.$id,
      entity: properties,
      entityId: overrideEntityId,
    });

    return new EntityModel({
      accountId,
      entityId,
      version,
      entityTypeModel,
      properties,
    });
  }

  /**
   * Create an entity along with any new/existing entities specified through links.
   *
   * @param params.createdById the account id that is creating the entity
   * @param params.entityDefinition the definition of how to get or create the entity optionally with linked entities
   */
  static async createEntityWithLinks(
    graphApi: GraphApi,
    params: {
      createdById: string;
      entityDefinition: KnowledgeEntityDefinition;
    },
  ): Promise<EntityModel> {
    const { createdById, entityDefinition } = params;

    const entitiesInTree = linkedTreeFlatten<
      KnowledgeEntityDefinition,
      KnowledgeLinkedEntityDefinition,
      "linkedEntities",
      "entity"
    >(entityDefinition, "linkedEntities", "entity");

    const entities = await Promise.all(
      entitiesInTree.map(async (definition) => ({
        link: definition.meta
          ? {
              parentIndex: definition.parentIndex,
              meta: definition.meta,
            }
          : undefined,
        entity: await EntityModel.getOrCreate(graphApi, {
          createdById,
          entityDefinition: definition,
        }),
      })),
    );

    await Promise.all(
      entities.map(async ({ link, entity }) => {
        if (link) {
          const parentEntity = entities[link.parentIndex];
          if (!parentEntity) {
            throw new ApolloError("Could not find parent entity");
          }
          const linkTypeModel = await LinkTypeModel.get(graphApi, {
            versionedUri: link.meta.linkTypeVersionedUri,
          });

          // links are created as an outgoing link from the parent entity to the children.
          await parentEntity.entity.createOutgoingLink(graphApi, {
            linkTypeModel,
            targetEntityModel: entity,
            index: link.meta.index ?? undefined,
          });
        }
      }),
    );

    if (entities[0]) {
      // First element will be the root entity.
      return entities[0].entity;
    } else {
      throw new ApolloError(
        "Could not create entity tree",
        "INTERNAL_SERVER_ERROR",
      );
    }
  }

  /**
   * Get or create an entity given either by new entity properties or a reference
   * to an existing entity.
   *
   * @param params.createdById the account id that is creating the entity
   * @param params.entityDefinition the definition of how to get or create the entity (excluding any linked entities)
   */
  static async getOrCreate(
    graphApi: GraphApi,
    params: {
      createdById: string;
      entityDefinition: Omit<KnowledgeEntityDefinition, "linkedEntities">;
    },
  ): Promise<EntityModel> {
    const { entityDefinition } = params;
    const { entityProperties, existingEntity } = entityDefinition;

    let entity;

    if (existingEntity) {
      entity = await EntityModel.getLatest(graphApi, {
        entityId: existingEntity.entityId,
        accountId: existingEntity.ownedById,
      });
      if (!entity) {
        throw new ApolloError(
          `Entity ${existingEntity.entityId} owned by ${existingEntity.ownedById} not found`,
          "NOT_FOUND",
        );
      }
    } else if (entityProperties) {
      const { entityType } = entityDefinition;
      const { componentId, entityTypeVersionedUri } = entityType ?? {};

      if (!exactlyOne(entityTypeVersionedUri, componentId)) {
        throw new ApolloError(
          `Given no valid type identifier. Must be one of entityTypeVersionedUri or componentId`,
          "NOT_FOUND",
        );
      }

      /** @todo figure out what to do about component ID */
      if (componentId) {
        throw new Error(`Component ID is unimplemented.`);
      }

      const entityTypeModel = await EntityTypeModel.get(graphApi, {
        versionedUri: entityTypeVersionedUri!,
      });

      entity = await EntityModel.create(graphApi, {
        accountId: params.createdById,
        entityTypeModel,
        properties: entityProperties,
      });
    } else {
      throw new Error(
        `One of entityId OR entityProperties and entityType must be provided`,
      );
    }

    return entity;
  }

  /**
   * Get all entities at their latest version.
   *
   * @param params.accountId the accountId of the account requesting the entities
   */
  static async getAllLatest(
    graphApi: GraphApi,
    _params: { accountId: string },
  ): Promise<EntityModel[]> {
    /**
     * @todo: get all latest entities in specified account.
     *   This may mean implictly filtering results by what an account is
     *   authorized to see.
     *   https://app.asana.com/0/1202805690238892/1202890446280569/f
     */
    const { data: entities } = await graphApi.getLatestEntities();

    const cachedEntityTypeModels = new Map<string, EntityTypeModel>();

    return await Promise.all(
      entities.map((entity) =>
        EntityModel.fromPersistedEntity(
          graphApi,
          entity,
          cachedEntityTypeModels,
        ),
      ),
    );
  }

  /**
   * Get the latest version of an entity by its entity ID.
   *
   * @param params.accountId the accountId of the account requesting the entity
   * @param params.versionedUri the unique versioned URI for an entity.
   */
  static async getLatest(
    graphApi: GraphApi,
    params: {
      accountId?: string;
      entityId: string;
    },
  ): Promise<EntityModel> {
    const { entityId } = params;
    const { data: persistedEntity } = await graphApi.getEntity(entityId);

    return await EntityModel.fromPersistedEntity(graphApi, persistedEntity);
  }

  /**
   * Update an entity.
   *
   * @param params.accountId the accountId of the account making the update
   * @param params.schema an `Entity`
   */
  async update(
    graphApi: GraphApi,
    params: {
      accountId: string;
      properties: object;
    },
  ): Promise<EntityModel> {
    const { accountId, properties } = params;
    const { entityId, entityTypeModel } = this;

    const {
      data: { version },
    } = await graphApi.updateEntity({
      accountId,
      entityId,
      /** @todo: make this argument optional */
      entityTypeId: entityTypeModel.schema.$id,
      entity: properties,
    });

    return new EntityModel({
      accountId,
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
   * @param params.updatedByAccountId - the account id of the account updating the property value
   * @returns
   */
  async updateProperties(
    graphApi: GraphApi,
    params: {
      updatedByAccountId: string;
      updatedProperties: { propertyTypeBaseUri: string; value: any }[];
    },
  ): Promise<EntityModel> {
    const { updatedProperties, updatedByAccountId } = params;

    return await this.update(graphApi, {
      accountId: updatedByAccountId,
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
   * @param params.updatedByAccountId - the account id of the account updating the property value
   * @returns
   */
  async updateProperty(
    graphApi: GraphApi,
    params: {
      propertyTypeBaseUri: string;
      value: any;
      updatedByAccountId: string;
    },
  ): Promise<EntityModel> {
    const { updatedByAccountId, propertyTypeBaseUri, value } = params;

    return await this.updateProperties(graphApi, {
      updatedByAccountId,
      updatedProperties: [{ propertyTypeBaseUri, value }],
    });
  }

  async getLatestVersion(graphApi: GraphApi) {
    const { accountId, entityId } = this;

    return await EntityModel.getLatest(graphApi, { accountId, entityId });
  }

  /** @see {@link LinkModel.create} */
  async createOutgoingLink(
    graphApi: GraphApi,
    params: Omit<LinkModelCreateParams, "sourceEntityModel" | "createdBy">,
  ): Promise<LinkModel> {
    return await LinkModel.create(graphApi, {
      createdBy: this.accountId,
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
