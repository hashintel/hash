import { PersistedEntity, GraphApi } from "@hashintel/hash-graph-client";

import {
  EntityModel,
  EntityTypeModel,
  LinkModel,
  LinkModelCreateParams,
  LinkTypeModel,
} from "../index";

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
    { identifier, inner, typeVersionedUri }: PersistedEntity,
    cachedEntityTypeModels?: Map<string, EntityTypeModel>,
  ): Promise<EntityModel> {
    const { createdBy: accountId, version } = identifier;
    const cachedEntityTypeModel = cachedEntityTypeModels?.get(typeVersionedUri);

    let entityTypeModel: EntityTypeModel;

    if (cachedEntityTypeModel) {
      entityTypeModel = cachedEntityTypeModel;
    } else {
      entityTypeModel = await EntityTypeModel.get(graphApi, {
        versionedUri: typeVersionedUri,
      });
      if (cachedEntityTypeModels) {
        cachedEntityTypeModels.set(typeVersionedUri, entityTypeModel);
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
    { accountId, entityTypeModel, properties }: EntityModelCreateParams,
  ): Promise<EntityModel> {
    const {
      data: { entityId, version },
    } = await graphApi.createEntity({
      accountId,
      entityTypeUri: entityTypeModel.schema.$id,
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
   * Get all entities at their latest version.
   *
   * @param params.accountId the accountId of the account requesting the entities
   */
  static async getAllLatest(
    graphApi: GraphApi,
    _params: { accountId: string },
  ): Promise<EntityModel[]> {
    /** @todo: get all latest entities in specified account */
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
      accountId: string;
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
      entityTypeUri: entityTypeModel.schema.$id,
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
    params: Omit<LinkModelCreateParams, "sourceEntityModel" | "accountId">,
  ): Promise<LinkModel> {
    return await LinkModel.create(graphApi, {
      accountId: this.accountId,
      sourceEntityModel: this,
      ...params,
    });
  }

  /** @see {@link LinkModel.getAllOutgoing} */
  async getAllOutgoingLinks(graphApi: GraphApi): Promise<LinkModel[]> {
    return await LinkModel.getAllOutgoing(graphApi, {
      sourceEntityModel: this,
    });
  }

  /** @see {@link LinkModel.getOutgoing} */
  async getOutgoingLink(
    graphApi: GraphApi,
    params: { linkTypeModel: LinkTypeModel },
  ): Promise<LinkModel | null> {
    return await LinkModel.getOutgoing(graphApi, {
      sourceEntityModel: this,
      ...params,
    });
  }
}
