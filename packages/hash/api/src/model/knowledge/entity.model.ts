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
      entityTypeModel = await EntityTypeModel.get(graphApi, { entityTypeId });
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
   * Get all entities at their latest version.
   *
   * @param params.accountId the accountId of the account requesting the entities
   */
  static async getAllLatest(
    graphApi: GraphApi,
    params: { accountId: string },
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
      entities
        .filter(({ identifier }) => identifier.ownedById === params.accountId)
        .map((entity) =>
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
    params: Omit<LinkModelCreateParams, "sourceEntityModel" | "createdById"> & {
      createdById?: string;
    },
  ): Promise<LinkModel> {
    return await LinkModel.create(graphApi, {
      sourceEntityModel: this,
      createdById: params.createdById ?? this.accountId,
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
