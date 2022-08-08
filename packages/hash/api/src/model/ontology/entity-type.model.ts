import { EntityType, GraphApi } from "@hashintel/hash-graph-client";

import { EntityTypeModel, PropertyTypeModel, LinkTypeModel } from "../index";

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
   * Create an entity type.
   *
   * @param params.accountId the accountId of the account creating the entity type
   * @param params.schema an `EntityType`
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
   * Get an entity type by its versioned URI.
   *
   * @param params.accountId the accountId of the account requesting the entity type
   * @param params.versionedUri the unique versioned URI for an entity type.
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
   * Update an entity type.
   *
   * @param params.accountId the accountId of the account making the update
   * @param params.schema an `EntityType`
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

  /**
   * Get all outgoing link types of the entity type.
   */
  async getOutgoingLinkTypes(graphApi: GraphApi): Promise<LinkTypeModel[]> {
    const linkTypeVersionedUris = Object.keys(this.schema.links ?? {});

    return await Promise.all(
      linkTypeVersionedUris.map((versionedUri) =>
        LinkTypeModel.get(graphApi, {
          accountId: this.accountId,
          versionedUri,
        }),
      ),
    );
  }

  /**
   * Get all property types of the entity type.
   */
  async getPropertyTypes(graphApi: GraphApi): Promise<PropertyTypeModel[]> {
    const propertyTypeVersionedUris = Object.values(this.schema.properties).map(
      ({ $ref }) => $ref,
    );

    return await Promise.all(
      propertyTypeVersionedUris.map((versionedUri) =>
        PropertyTypeModel.get(graphApi, {
          accountId: this.accountId,
          versionedUri,
        }),
      ),
    );
  }
}
