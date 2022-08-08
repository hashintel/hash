import { EntityType, GraphApi } from "@hashintel/hash-graph-client";

import { EntityTypeModel } from "../index";

type EntityTypeArgs = {
  accountId: string;
  schema: EntityType;
};

/**
 * @class {@link EntityTypeModel}
 */
export default class {
  accountId: string;

  schema: EntityType;

  constructor({ schema, accountId }: EntityTypeArgs) {
    this.accountId = accountId;
    this.schema = schema;
  }

  /**
   * Create a entity type.
   *
   * @param params.accountId the accountId of the account creating the entity type
   * @param params.schema a `EntityType`
   */
  static async create(
    graphApi: GraphApi,
    params: {
      accountId: string;
      schema: EntityType;
    },
  ): Promise<EntityTypeModel> {
    const { data: schema } = await graphApi.createEntityType(params);

    return new EntityTypeModel({ schema, accountId: params.accountId });
  }

  /**
   * Get all entity types at their latest version.
   *
   * @param params.accountId the accountId of the account requesting the entity types
   */
  static async getAllLatest(
    graphApi: GraphApi,
    params: { accountId: string },
  ): Promise<EntityTypeModel[]> {
    /** @todo: get all latest entity types in specified account */
    const { data: schemas } = await graphApi.getLatestEntityTypes();

    return schemas.map(
      (schema) => new EntityTypeModel({ schema, accountId: params.accountId }),
    );
  }

  /**
   * Get a entity type by its versioned URI.
   *
   * @param params.accountId the accountId of the account requesting the entity type
   * @param params.versionedUri the unique versioned URI for a entity type.
   */
  static async get(
    graphApi: GraphApi,
    params: {
      accountId: string;
      versionedUri: string;
    },
  ): Promise<EntityTypeModel> {
    const { accountId, versionedUri } = params;
    const { data: schema } = await graphApi.getEntityType(versionedUri);

    return new EntityTypeModel({ schema, accountId });
  }

  /**
   * Update a entity type.
   *
   * @param params.accountId the accountId of the account making the update
   * @param params.schema a `EntityType`
   */
  async update(
    graphApi: GraphApi,
    params: {
      accountId: string;
      schema: EntityType;
    },
  ): Promise<EntityTypeModel> {
    const { accountId } = params;

    const { data: schema } = await graphApi.updateEntityType(params);

    return new EntityTypeModel({ schema, accountId });
  }
}
