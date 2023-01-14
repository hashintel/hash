import { DataType } from "@blockprotocol/type-system";
import {
  DataTypeWithMetadata,
  Subgraph,
  SubgraphRootTypes,
  VersionedUri,
} from "@hashintel/hash-subgraph";
import { versionedUriFromComponents } from "@hashintel/hash-subgraph/src/shared/type-system-patch";
import { getRoots } from "@hashintel/hash-subgraph/src/stdlib/roots";
import { generateTypeId } from "@local/hash-shared/ontology-types";
import { AccountId, OwnedById } from "@local/hash-shared/types";

import { NotFoundError } from "../../../lib/error";
import { ImpureGraphFunction, zeroedGraphResolveDepths } from "../..";
import { getNamespaceOfAccountOwner } from "./util";

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
export const createDataType: ImpureGraphFunction<
  {
    ownedById: OwnedById;
    // we have to manually specify this type because of 'intended' limitations of `Omit` with extended Record types:
    //  https://github.com/microsoft/TypeScript/issues/50638
    //  this is needed for as long as DataType extends Record
    schema: Pick<DataType, "kind" | "title" | "description" | "type"> &
      Record<string, any>;
    actorId: AccountId;
  },
  Promise<DataTypeWithMetadata>
> = async (ctx, params) => {
  const { ownedById, actorId } = params;
  const namespace = await getNamespaceOfAccountOwner(ctx, {
    ownerId: params.ownedById,
  });

  const { graphApi } = ctx;

  const dataTypeUri = generateTypeId({
    namespace,
    kind: "data-type",
    title: params.schema.title,
  });
  const schema = { $id: dataTypeUri, ...params.schema };

  const { data: metadata } = await graphApi.createDataType({
    schema,
    ownedById,
    actorId,
  });

  return { schema, metadata };
};

/**
 * Get a data type by its versioned URI.
 *
 * @param params.dataTypeId the unique versioned URI for a data type.
 */
export const getDataTypeById: ImpureGraphFunction<
  {
    dataTypeId: VersionedUri;
  },
  Promise<DataTypeWithMetadata>
> = async ({ graphApi }, params) => {
  const { dataTypeId } = params;

  const dataTypeSubgraph = await graphApi
    .getDataTypesByQuery({
      filter: {
        equal: [{ path: ["versionedUri"] }, { parameter: dataTypeId }],
      },
      graphResolveDepths: zeroedGraphResolveDepths,
    })
    .then(({ data }) => data as Subgraph<SubgraphRootTypes["dataType"]>);

  const [dataType] = getRoots(dataTypeSubgraph);

  if (!dataType) {
    throw new NotFoundError(`Could not find data type with ID "${dataTypeId}"`);
  }

  return dataType;
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
 * @param params.dataTypeId - the id of the data type that's being updated
 * @param params.schema - the updated `DataType`
 * @param params.actorId - the id of the account that is updating the data type
 */
export const updateDataType: ImpureGraphFunction<
  {
    dataTypeId: VersionedUri;
    // we have to manually specify this type because of 'intended' limitations of `Omit` with extended Record types:
    //  https://github.com/microsoft/TypeScript/issues/50638
    //  this is needed for as long as DataType extends Record
    schema: Pick<DataType, "kind" | "title" | "description" | "type"> &
      Record<string, any>;
    actorId: AccountId;
  },
  Promise<DataTypeWithMetadata>
> = async ({ graphApi }, params) => {
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
