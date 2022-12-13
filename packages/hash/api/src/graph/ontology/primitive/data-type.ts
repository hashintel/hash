import { AxiosError } from "axios";
import { generateTypeId } from "@hashintel/hash-shared/ontology-types";
import { DataType } from "@blockprotocol/type-system";
import { DataTypeWithMetadata, VersionedUri } from "@hashintel/hash-subgraph";
import { versionedUriFromComponents } from "@hashintel/hash-subgraph/src/shared/type-system-patch";
import { getNamespaceOfAccountOwner } from "./util";
import { GraphContext } from "../..";

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
export const createDataType = async (
  { graphApi }: GraphContext,
  params: {
    ownedById: string;
    // we have to manually specify this type because of 'intended' limitations of `Omit` with extended Record types:
    //  https://github.com/microsoft/TypeScript/issues/50638
    //  this is needed for as long as DataType extends Record
    schema: Pick<DataType, "kind" | "title" | "description" | "type"> &
      Record<string, any>;
    actorId: string;
  },
): Promise<DataTypeWithMetadata> => {
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

  return { schema, metadata };
};

/**
 * Get a data type by its versioned URI.
 *
 * @param params.dataTypeId the unique versioned URI for a data type.
 */
export const getDataType = async (
  { graphApi }: GraphContext,
  params: {
    dataTypeId: VersionedUri;
  },
): Promise<DataTypeWithMetadata> => {
  const { dataTypeId } = params;
  const { data: dataType } = await graphApi.getDataType(dataTypeId);

  return dataType as DataTypeWithMetadata;
};

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
export const updateDataType = async (
  { graphApi }: GraphContext,
  params: {
    dataTypeId: VersionedUri;
    // we have to manually specify this type because of 'intended' limitations of `Omit` with extended Record types:
    //  https://github.com/microsoft/TypeScript/issues/50638
    //  this is needed for as long as DataType extends Record
    schema: Pick<DataType, "kind" | "title" | "description" | "type"> &
      Record<string, any>;
    actorId: string;
  },
) => {
  const { dataTypeId, schema, actorId } = params;

  const { data: metadata } = await graphApi.updateDataType({
    actorId,
    typeToUpdate: dataTypeId,
    schema,
  });

  const { editionId } = metadata;

  return {
    schema: {
      ...schema,
      $id: versionedUriFromComponents(editionId.baseId, editionId.version),
    },
    metadata,
  };
};
