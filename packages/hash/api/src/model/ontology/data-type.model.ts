import { AxiosError } from "axios";

import {
  GraphApi,
  PersistedDataType,
  UpdateDataTypeRequest,
} from "@hashintel/hash-graph-client";
import { DataType } from "@blockprotocol/type-system-web";

import { DataTypeModel } from "../index";
import { generateTypeId } from "../util";
import { getNamespaceOfAccountOwner } from "./util";

type DataTypeModelConstructorArgs = {
  ownedById: string;
  schema: DataType;
};

/**
 * @class {@link DataTypeModel}
 */
export default class {
  ownedById: string;

  schema: DataType;

  constructor({ schema, ownedById }: DataTypeModelConstructorArgs) {
    this.ownedById = ownedById;
    this.schema = schema;
  }

  static fromPersistedDataType({
    inner,
    identifier,
  }: PersistedDataType): DataTypeModel {
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
    return new DataTypeModel({
      schema: inner as DataType,
      ownedById: identifier.ownedById,
    });
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
   * @param params.ownedById - the id of the owner of the entity type
   * @param params.schema - the `DataType`
   */
  static async create(
    graphApi: GraphApi,
    params: {
      ownedById: string;
      // we have to manually specify this type because of 'intended' limitations of `Omit` with extended Record types:
      //  https://github.com/microsoft/TypeScript/issues/50638
      //  this is needed for as long as DataType extends Record
      schema: Pick<DataType, "kind" | "title" | "description" | "type"> &
        Record<string, any>;
    },
  ): Promise<DataTypeModel> {
    const namespace = await getNamespaceOfAccountOwner(graphApi, {
      ownerId: params.ownedById,
    });

    const dataTypeUri = generateTypeId({
      namespace,
      kind: "data-type",
      title: params.schema.title,
    });
    const fullDataType = { $id: dataTypeUri, ...params.schema };

    const { data: identifier } = await graphApi
      .createDataType({
        /**
         * @todo: replace uses of `accountId` with `ownedById` in the Graph API
         * @see [ADD ASANA LINK]
         */
        accountId: params.ownedById,
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
      ownedById: identifier.ownedById,
    });
  }

  /**
   * Get all data types at their latest version.

   */
  static async getAllLatest(graphApi: GraphApi): Promise<DataTypeModel[]> {
    /**
     * @todo: get all latest data types in specified account.
     *   This may mean implicitly filtering results by what an account is
     *   authorized to see.
     *   https://app.asana.com/0/1202805690238892/1202890446280569/f
     */
    const { data: persistedDataTypes } = await graphApi.getLatestDataTypes();

    return persistedDataTypes.map(DataTypeModel.fromPersistedDataType);
  }

  /**
   * Get a data type by its versioned URI.
   *
   * @param params.dataTypeId the unique versioned URI for a data type.
   */
  static async get(
    graphApi: GraphApi,
    params: {
      dataTypeId: string;
    },
  ): Promise<DataTypeModel> {
    const { dataTypeId } = params;
    const { data: persistedDataType } = await graphApi.getDataType(dataTypeId);

    return DataTypeModel.fromPersistedDataType(persistedDataType);
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
   * @param params.schema a `DataType`
   */
  async update(
    graphApi: GraphApi,
    params: {
      // we have to manually specify this type because of 'intended' limitations of `Omit` with extended Record types:
      //  https://github.com/microsoft/TypeScript/issues/50638
      //  this is needed for as long as DataType extends Record
      schema: Pick<DataType, "kind" | "title" | "description" | "type"> &
        Record<string, any>;
    },
  ): Promise<DataTypeModel> {
    const { schema } = params;

    const updateArguments: UpdateDataTypeRequest = {
      /**
       * @todo: let caller update who owns the type, or create new method dedicated to changing the owner of the type
       *
       * @todo: replace uses of `accountId` with `ownedById` in the Graph API
       * @see [ADD ASANA LINK]
       */
      accountId: this.ownedById,
      typeToUpdate: this.schema.$id,
      schema,
    };

    const { data: identifier } = await graphApi.updateDataType(updateArguments);

    return new DataTypeModel({
      schema: { ...schema, $id: identifier.uri },
      ownedById: identifier.ownedById,
    });
  }
}
