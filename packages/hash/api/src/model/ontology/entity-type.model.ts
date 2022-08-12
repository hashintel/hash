import {
  EntityType,
  GraphApi,
  UpdateEntityTypeRequest,
} from "@hashintel/hash-graph-client";

import { EntityTypeModel, PropertyTypeModel, LinkTypeModel } from "../index";
import { incrementVersionedId } from "../util";

export type EntityTypeModelConstructorParams = {
  accountId?: string;
  schema: EntityType;
};

export type EntityTypeModelCreateParams = {
  accountId: string;
  schema: EntityType;
};

/**
 * @class {@link EntityTypeModel}
 */
export default class {
  accountId?: string;

  schema: EntityType;

  constructor({ schema, accountId }: EntityTypeModelConstructorParams) {
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
    params: EntityTypeModelCreateParams,
  ): Promise<EntityTypeModel> {
    const { data: identifier } = await graphApi.createEntityType(params);

    return new EntityTypeModel({
      schema: params.schema,
      accountId: identifier.createdBy,
    });
  }

  /**
   * Get all entity types at their latest version.
   *
   * @param params.accountId the accountId of the account requesting the entity types
   */
  static async getAllLatest(
    graphApi: GraphApi,
    _params: { accountId: string },
  ): Promise<EntityTypeModel[]> {
    /** @todo: get all latest entity types in specified account */
    const { data: persistedEntityTypes } =
      await graphApi.getLatestEntityTypes();

    return persistedEntityTypes.map(
      (persistedEntityType) =>
        new EntityTypeModel({
          schema: persistedEntityType.inner,
          accountId: persistedEntityType.identifier.createdBy,
        }),
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
      versionedUri: string;
    },
  ): Promise<EntityTypeModel> {
    const { versionedUri } = params;
    const { data: persistedEntityType } = await graphApi.getEntityType(
      versionedUri,
    );

    return new EntityTypeModel({
      schema: persistedEntityType.inner,
      accountId: persistedEntityType.identifier.createdBy,
    });
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
    const newVersionedId = incrementVersionedId(this.schema.$id);

    const { accountId, schema } = params;
    const updateArguments: UpdateEntityTypeRequest = {
      accountId,
      schema: { ...schema, $id: newVersionedId },
    };

    const { data: identifier } = await graphApi.updateEntityType(
      updateArguments,
    );

    return new EntityTypeModel({
      schema: updateArguments.schema,
      accountId: identifier.createdBy,
    });
  }

  /**
   * Get all outgoing link types of the entity type.
   */
  async getOutgoingLinkTypes(graphApi: GraphApi): Promise<LinkTypeModel[]> {
    const linkTypeVersionedUris = Object.keys(this.schema.links ?? {});

    return await Promise.all(
      linkTypeVersionedUris.map((versionedUri) =>
        LinkTypeModel.get(graphApi, {
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
          versionedUri,
        }),
      ),
    );
  }
}
