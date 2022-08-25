import { GraphApi, UpdateDataTypeRequest } from "@hashintel/hash-graph-client";

import { DataType } from "@blockprotocol/type-system-web";

import { DataTypeModel } from "../index";
import { incrementVersionedId } from "../util";

type DataTypeModelConstructorArgs = {
  accountId: string;
  schema: DataType;
};

/**
 * @class {@link DataTypeModel}
 */
export default class {
  accountId: string;

  schema: DataType;

  constructor({ schema, accountId }: DataTypeModelConstructorArgs) {
    this.accountId = accountId;
    this.schema = schema;
  }

  /**
   * Create a data type.
   *
   * @todo revisit data type creation
   * User defined data types are not specified yet, which means this `create`
   * operation should not be exposed to users yet.
   *
   * @param params.accountId the accountId of the account creating the data type
   * @param params.schema a `DataType`
   */
  static async create(
    graphApi: GraphApi,
    params: {
      accountId: string;
      schema: DataType;
    },
  ): Promise<DataTypeModel> {
    const { data: identifier } = await graphApi.createDataType(params);

    return new DataTypeModel({
      schema: params.schema,
      accountId: identifier.createdBy,
    });
  }

  /**
   * Get all data types at their latest version.
   *
   * @param params.accountId the accountId of the account requesting the data types
   */
  static async getAllLatest(
    graphApi: GraphApi,
    _params: { accountId: string },
  ): Promise<DataTypeModel[]> {
    /** @todo: get all latest data types in specified account */
    const { data: persistedDataTypes } = await graphApi.getLatestDataTypes();

    return persistedDataTypes.map(
      (persistedDataType) =>
        new DataTypeModel({
          /**
           * @todo and a warning, these type casts are here to satisfy the type system package.
           *   we should consider if we can improve this. The invariant is withheld when receiving data.
           */
          schema: persistedDataType.inner as DataType,
          accountId: persistedDataType.identifier.createdBy,
        }),
    );
  }

  /**
   * Get a data type by its versioned URI.
   *
   * @param params.accountId the accountId of the account requesting the data type
   * @param params.versionedUri the unique versioned URI for a data type.
   */
  static async get(
    graphApi: GraphApi,
    params: {
      versionedUri: string;
    },
  ): Promise<DataTypeModel> {
    const { versionedUri } = params;
    const { data: persistedDataType } = await graphApi.getDataType(
      versionedUri,
    );

    return new DataTypeModel({
      /**
       * @todo and a warning, these type casts are here to satisfy the type system package.
       *   we should consider if we can improve this. The invariant is withheld when receiving data.
       */
      schema: persistedDataType.inner as DataType,
      accountId: persistedDataType.identifier.createdBy,
    });
  }

  /**
   * Update a data type.
   *
   * @todo revisit data type update
   * As with data type `create`, this `update` operation is not currently relevant to users
   * because user defined data types are not fully specified.
   *
   * @param params.accountId the accountId of the account making the update
   * @param params.schema a `DataType`
   */
  async update(
    graphApi: GraphApi,
    params: {
      accountId: string;
      schema: DataType;
    },
  ): Promise<DataTypeModel> {
    const newVersionedId = incrementVersionedId(this.schema.$id);

    const { accountId, schema } = params;
    const updateArguments: UpdateDataTypeRequest = {
      accountId,
      schema: { ...schema, $id: newVersionedId },
    };

    const { data: identifier } = await graphApi.updateDataType(updateArguments);

    return new DataTypeModel({
      /**
       * @todo and a warning, these type casts are here to satisfy the type system package.
       *   we should consider if we can improve this. The invariant is withheld when receiving data.
       */
      schema: updateArguments.schema as DataType,
      accountId: identifier.createdBy,
    });
  }
}
