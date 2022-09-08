import { AxiosError } from "axios";

import { GraphApi, UpdateDataTypeRequest } from "@hashintel/hash-graph-client";
import { DataType } from "@blockprotocol/type-system-web";
import { WORKSPACE_ACCOUNT_SHORTNAME } from "@hashintel/hash-backend-utils/system";

import { DataTypeModel, UserModel } from "../index";
import { generateSchemaUri, workspaceAccountId } from "../util";

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
   *   User defined data types are not specified yet, which means this `create`
   *   operation should not be exposed to users yet.
   *   Depends on the RFC captured by:
   *   https://app.asana.com/0/1200211978612931/1202464168422955/f
   *
   * @param params.accountId the accountId of the account creating the data type
   * @param params.schema a `DataType`
   */
  static async create(
    graphApi: GraphApi,
    params: {
      accountId: string;
      // we have to manually specify this type because of 'intended' limitations of `Omit` with extended Record types:
      //  https://github.com/microsoft/TypeScript/issues/50638
      //  this is needed for as long as DataType extends Record
      schema: Pick<DataType, "kind" | "title" | "description" | "type"> &
        Record<string, any>;
    },
  ): Promise<DataTypeModel> {
    /** @todo - get rid of this hack for the root account */
    const namespace =
      params.accountId === workspaceAccountId
        ? WORKSPACE_ACCOUNT_SHORTNAME
        : (
            await UserModel.getUserByAccountId(graphApi, {
              accountId: params.accountId,
            })
          )?.getShortname();

    if (namespace == null) {
      throw new Error(
        `failed to get namespace for account: ${params.accountId}`,
      );
    }

    const dataTypeUri = generateSchemaUri({
      namespace,
      kind: "data-type",
      title: params.schema.title,
    });
    const fullDataType = { $id: dataTypeUri, ...params.schema };

    const { data: identifier } = await graphApi
      .createDataType({
        accountId: params.accountId,
        schema: fullDataType,
      })
      .catch((err: AxiosError) => {
        throw new Error(
          err.response?.status === 409
            ? `data type with the same URI already exists. [URI=${fullDataType.$id}]`
            : `[${err.code}] couldn't create data type: ${err.response?.data}.`,
        );
      });

    return new DataTypeModel({
      schema: fullDataType,
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
    /**
     * @todo: get all latest data types in specified account.
     *   This may mean implictly filtering results by what an account is
     *   authorized to see.
     *   https://app.asana.com/0/1202805690238892/1202890446280569/f
     */
    const { data: persistedDataTypes } = await graphApi.getLatestDataTypes();

    return persistedDataTypes.map(
      (persistedDataType) =>
        new DataTypeModel({
          /**
           * @todo and a warning, these type casts are here to compensate for
           *   the differences between the Graph API package and the
           *   type system package.
           *
           *   The type system package can be considered the source of truth in
           *   terms of the shape of values returned from the API, but the API
           *   client is unable to be given as type package types - it generates
           *   its own types.
           *   https://app.asana.com/0/1202805690238892/1202892835843657/f
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
       * @todo and a warning, these type casts are here to compensate for
       *   the differences between the Graph API package and the
       *   type system package.
       *
       *   The type system package can be considered the source of truth in
       *   terms of the shape of values returned from the API, but the API
       *   client is unable to be given as type package types - it generates
       *   its own types.
       *   https://app.asana.com/0/1202805690238892/1202892835843657/f
       */
      schema: persistedDataType.inner as DataType,
      accountId: persistedDataType.identifier.createdBy,
    });
  }

  /**
   * Update a data type.
   *
   * @todo revisit data type update
   *   As with data type `create`, this `update` operation is not currently relevant to users
   *   because user defined data types are not fully specified.
   *   Depends on the RFC captured by:
   *   https://app.asana.com/0/1200211978612931/1202464168422955/f
   *
   * @param params.accountId the accountId of the account making the update
   * @param params.schema a `DataType`
   */
  async update(
    graphApi: GraphApi,
    params: {
      accountId: string;
      // we have to manually specify this type because of 'intended' limitations of `Omit` with extended Record types:
      //  https://github.com/microsoft/TypeScript/issues/50638
      //  this is needed for as long as DataType extends Record
      schema: Pick<DataType, "kind" | "title" | "description" | "type"> &
        Record<string, any>;
    },
  ): Promise<DataTypeModel> {
    const { accountId, schema } = params;

    const updateArguments: UpdateDataTypeRequest = {
      accountId,
      typeToUpdate: this.schema.$id,
      schema,
    };

    const { data: identifier } = await graphApi.updateDataType(updateArguments);

    return new DataTypeModel({
      schema: { ...schema, $id: identifier.uri },
      accountId: identifier.createdBy,
    });
  }
}
