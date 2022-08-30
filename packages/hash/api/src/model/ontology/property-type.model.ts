import {
  PropertyType,
  GraphApi,
  UpdatePropertyTypeRequest,
} from "@hashintel/hash-graph-client";

import { PropertyTypeModel } from "../index";
import { incrementVersionedId } from "../util";

type PropertyTypeModelConstructorParams = {
  accountId: string;
  schema: PropertyType;
};

/**
 * @class {@link PropertyTypeModel}
 */
export default class {
  accountId: string;

  schema: PropertyType;

  constructor({ schema, accountId }: PropertyTypeModelConstructorParams) {
    this.accountId = accountId;
    this.schema = schema;
  }

  /**
   * Create a property type.
   *
   * @param params.accountId the accountId of the account creating the property type
   * @param params.schema a `PropertyType`
   */
  static async create(
    graphApi: GraphApi,
    params: {
      accountId: string;
      schema: PropertyType;
    },
  ): Promise<PropertyTypeModel> {
    const { data: identifier } = await graphApi.createPropertyType(params);

    return new PropertyTypeModel({
      schema: params.schema,
      accountId: identifier.createdBy,
    });
  }

  /**
   * Get all property types at their latest version.
   *
   * @param params.accountId the accountId of the account requesting the property types
   */
  static async getAllLatest(
    graphApi: GraphApi,
    _params: { accountId: string },
  ): Promise<PropertyTypeModel[]> {
    /**
     * @todo: get all latest property types in specified account.
     *   This may mean implictly filtering results by what an account is
     *   authorized to see.
     *   https://app.asana.com/0/1202805690238892/1202890446280569/f
     */
    const { data: persistedPropertyTypes } =
      await graphApi.getLatestPropertyTypes();

    return persistedPropertyTypes.map(
      (persistedPropertyType) =>
        new PropertyTypeModel({
          schema: persistedPropertyType.inner,
          accountId: persistedPropertyType.identifier.createdBy,
        }),
    );
  }

  /**
   * Get a property type by its versioned URI.
   *
   * @param params.accountId the accountId of the account requesting the property type
   * @param params.versionedUri the unique versioned URI for a property type.
   */
  static async get(
    graphApi: GraphApi,
    params: {
      versionedUri: string;
    },
  ): Promise<PropertyTypeModel> {
    const { versionedUri } = params;
    const { data: persistedPropertyType } = await graphApi.getPropertyType(
      versionedUri,
    );

    return new PropertyTypeModel({
      schema: persistedPropertyType.inner,
      accountId: persistedPropertyType.identifier.createdBy,
    });
  }

  /**
   * Update a property type.
   *
   * @param params.accountId the accountId of the account making the update
   * @param params.schema a `PropertyType`
   */
  async update(
    graphApi: GraphApi,
    params: {
      accountId: string;
      schema: PropertyType;
    },
  ): Promise<PropertyTypeModel> {
    const newVersionedId = incrementVersionedId(this.schema.$id);

    const { accountId, schema } = params;
    const updateArguments: UpdatePropertyTypeRequest = {
      accountId,
      schema: { ...schema, $id: newVersionedId },
    };

    const { data: identifier } = await graphApi.updatePropertyType(
      updateArguments,
    );

    return new PropertyTypeModel({
      schema: updateArguments.schema,
      accountId: identifier.createdBy,
    });
  }
}
