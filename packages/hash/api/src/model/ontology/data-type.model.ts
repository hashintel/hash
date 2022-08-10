import { DataType, GraphApi } from "@hashintel/hash-graph-client";

import { DataTypeModel } from "../index";
import { NIL_UUID } from "../util";

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
    const { data: schema } = await graphApi.createDataType(params);

    return new DataTypeModel({ schema, accountId: params.accountId });
  }

  /**
   * Get all data types at their latest version.
   *
   * @param params.accountId the accountId of the account requesting the data types
   */
  static async getAllLatest(
    graphApi: GraphApi,
    params: { accountId: string },
  ): Promise<DataTypeModel[]> {
    /** @todo: get all latest data types in specified account */
    const { data: schemas } = await graphApi.getLatestDataTypes();

    return schemas.map(
      (schema) => new DataTypeModel({ schema, accountId: params.accountId }),
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
    const { data: schema } = await graphApi.getDataType(versionedUri);

    /** @todo: retrieve accountId from `graphApi.getDataType` response */
    const accountId = NIL_UUID;

    return new DataTypeModel({ schema, accountId });
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
    const { accountId } = params;

    const { data: schema } = await graphApi.updateDataType(params);

    return new DataTypeModel({ schema, accountId });
  }
}
