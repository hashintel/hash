import {
  DataType as DataTypeSchema,
  GraphApi,
} from "@hashintel/hash-graph-client";

import { DataType as DataTypeModel } from "../index";

type DataTypeArgs = {
  accountId: string;
  schema: DataTypeSchema;
};

class __DataType {
  accountId: string;

  schema: DataTypeSchema;

  constructor({ schema, accountId }: DataTypeArgs) {
    this.accountId = accountId;
    this.schema = schema;
  }

  /**
   * User defined datat types are not specified yet, which means this `create`
   * operations should not be exposed to users yet.
   *
   * This also implies that an `update` operation is not required for data types.
   */
  static async create(
    graphApi: GraphApi,
    params: {
      accountId: string;
      schema: DataTypeSchema;
    },
  ): Promise<DataTypeModel> {
    const { data: schema } = await graphApi.createDataType(params);

    return new DataTypeModel({ schema, accountId: params.accountId });
  }

  static async getAllLatest(
    graphApi: GraphApi,
    params: { accountId: string },
  ): Promise<DataTypeModel[]> {
    /** @todo: get all latest data types in specified account */
    const { data: schemas } = await graphApi.getLatestDataTypes();

    throw schemas.map(
      (schema) => new DataTypeModel({ schema, accountId: params.accountId }),
    );
  }

  static async get(
    graphApi: GraphApi,
    params: {
      accountId: string;
      versionedUri: string;
    },
  ): Promise<DataTypeModel> {
    const { accountId, versionedUri } = params;
    const { data: schema } = await graphApi.getDataType(versionedUri);

    return new DataTypeModel({ schema, accountId });
  }
}

export default __DataType;
