import { Entity, GraphApi } from "@hashintel/hash-graph-client";

import { EntityModel } from "../index";

type EntityModelArgs = {
  accountId: string;
  entityId: string;
  entityTypeUri: string;
  entity: Entity;
};

/**
 * @class {@link EntityModel}
 */
export default class {
  accountId: string;

  entityId: string;
  entityTypeUri: string;
  entity: Entity;

  constructor({ accountId, entityId, entityTypeUri, entity }: EntityModelArgs) {
    this.accountId = accountId;

    this.entityId = entityId;
    this.entityTypeUri = entityTypeUri;
    this.entity = entity;
  }

  /**
   * Create an entity.
   *
   * @param params.accountId the accountId of the account creating the entity
   * @param params.schema an `Entity`
   */
  static async create(
    graphApi: GraphApi,
    params: {
      accountId: string;
      entity: Entity;
      entityTypeUri: string;
    },
  ): Promise<EntityModel> {
    const {
      data: { entity, entityId },
    } = await graphApi.createEntity(params);

    return new EntityModel({
      accountId: params.accountId,
      entityId,
      entityTypeUri: params.entityTypeUri,
      entity,
    });
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
    /** @todo: get all latest entities in specified account */
    const { data: entities } = await graphApi.getLatestEntities();

    return entities.map(
      ({ schema }) => new EntityModel({ schema, accountId: params.accountId }),
    );
  }

  /**
   * Get the latest version of an entity by its entity ID.
   *
   * @param params.accountId the accountId of the account requesting the entity
   * @param params.versionedUri the unique versioned URI for an entity.
   */
  static async get(
    graphApi: GraphApi,
    params: {
      accountId: string;
      entityId: string;
    },
  ): Promise<EntityModel> {
    const { accountId, entityId } = params;
    const { data: qualifiedEntity } = await graphApi.getEntity(entityId);

    return new EntityModel({ schema, accountId });
  }

  /**
   * Update an entity.
   *
   * @todo revisit entity update
   * As with entity `create`, this `update` operation is not currently relevant to users
   * because user defined entities are not fully specified.
   *
   * @param params.accountId the accountId of the account making the update
   * @param params.schema an `Entity`
   */
  async update(
    graphApi: GraphApi,
    params: {
      accountId: string;
      schema: Entity;
    },
  ): Promise<EntityModel> {
    const { accountId } = params;

    const { data: schema } = await graphApi.updateEntity(params);

    return new EntityModel({ schema, accountId });
  }
}
