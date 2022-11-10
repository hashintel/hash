import { AxiosError } from "axios";
import { DataType } from "@blockprotocol/type-system-web";
import {
  GraphApi,
  DataTypeWithMetadata,
  UpdateDataTypeRequest,
} from "@hashintel/hash-graph-client";
import { generateTypeId } from "@hashintel/hash-shared/types";
import { DataTypeModel } from "../index";
import { getNamespaceOfAccountOwner } from "./util";

type DataTypeModelConstructorArgs = {
  ownedById: string;
  schema: DataType;
  createdById: string;
  updatedById: string;
};

/**
 * @class {@link DataTypeModel}
 */
export default class {
  ownedById: string;

  schema: DataType;

  createdById: string;
  updatedById: string;

  constructor({
    schema,
    ownedById,
    createdById,
    updatedById,
  }: DataTypeModelConstructorArgs) {
    this.ownedById = ownedById;
    this.schema = schema;

    this.createdById = createdById;
    this.updatedById = updatedById;
  }

  static fromDataTypeWithMetadata({
    schema,
    metadata: {
      ownedById,
      provenance: { createdById, updatedById },
    },
  }: DataTypeWithMetadata): DataTypeModel {
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
      schema: schema as DataType,
      ownedById,
      createdById,
      updatedById,
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
   * @param params.ownedById - the id of the account who owns the data type
   * @param params.schema - the `DataType`
   * @param params.actorId - the id of the account that is creating the data type
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
      actorId: string;
    },
  ): Promise<DataTypeModel> {
    const { ownedById, actorId } = params;
    const namespace = await getNamespaceOfAccountOwner(graphApi, {
      ownerId: params.ownedById,
    });

    const dataTypeUri = generateTypeId({
      namespace,
      kind: "data-type",
      title: params.schema.title,
    });
    const schema = { $id: dataTypeUri, ...params.schema };

    const { data: metadata } = await graphApi
      .createDataType({
        schema,
        ownedById,
        actorId,
      })
      .catch((err: AxiosError) => {
        throw new Error(
          err.response?.status === 409
            ? `data type with the same URI already exists. [URI=${schema.$id}]`
            : `[${err.code}] couldn't create data type: ${err.response?.data}.`,
        );
      });

    return DataTypeModel.fromDataTypeWithMetadata({
      schema,
      metadata,
    });
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

    return DataTypeModel.fromDataTypeWithMetadata(persistedDataType);
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
   * @param params.schema - the updated `DataType`
   * @param params.actorId - the id of the account that is updating the data type
   */
  async update(
    graphApi: GraphApi,
    params: {
      // we have to manually specify this type because of 'intended' limitations of `Omit` with extended Record types:
      //  https://github.com/microsoft/TypeScript/issues/50638
      //  this is needed for as long as DataType extends Record
      schema: Pick<DataType, "kind" | "title" | "description" | "type"> &
        Record<string, any>;
      actorId: string;
    },
  ): Promise<DataTypeModel> {
    const { schema, actorId } = params;

    const updateArguments: UpdateDataTypeRequest = {
      actorId,
      typeToUpdate: this.schema.$id,
      schema,
    };

    const { data: metadata } = await graphApi.updateDataType(updateArguments);

    const { editionId } = metadata;

    return DataTypeModel.fromDataTypeWithMetadata({
      schema: { ...schema, $id: `${editionId.baseId}/v/${editionId.version}` },
      metadata,
    });
  }
}
