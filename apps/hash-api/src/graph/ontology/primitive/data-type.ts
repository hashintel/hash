import { DataType, VersionedUrl } from "@blockprotocol/type-system";
import { generateTypeId } from "@local/hash-isomorphic-utils/ontology-types";
import {
  AccountId,
  DataTypeRootType,
  DataTypeWithMetadata,
  OntologyElementMetadata,
  OntologyTypeRecordId,
  ontologyTypeRecordIdToVersionedUrl,
  OwnedById,
  Subgraph,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { mapSubgraph } from "@local/hash-subgraph/temp";

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

  const dataTypeUrl = generateTypeId({
    namespace,
    kind: "data-type",
    title: params.schema.title,
  });
  const schema = { $id: dataTypeUrl, ...params.schema };

  const { data: metadata } = await graphApi.createDataType({
    schema,
    ownedById,
    actorId,
  });

  return { schema, metadata: metadata as OntologyElementMetadata };
};

/**
 * Get a data type by its versioned URL.
 *
 * @param params.dataTypeId the unique versioned URL for a data type.
 */
export const getDataTypeById: ImpureGraphFunction<
  {
    dataTypeId: VersionedUrl;
  },
  Promise<DataTypeWithMetadata>
> = async ({ graphApi }, params) => {
  const { dataTypeId } = params;

  const dataTypeSubgraph = await graphApi
    .getDataTypesByQuery({
      filter: {
        equal: [{ path: ["versionedUrl"] }, { parameter: dataTypeId }],
      },
      graphResolveDepths: zeroedGraphResolveDepths,
      temporalAxes: {
        pinned: {
          axis: "transactionTime",
          timestamp: null,
        },
        variable: {
          axis: "decisionTime",
          interval: {
            start: null,
            end: null,
          },
        },
      },
    })
    .then(({ data }) => mapSubgraph(data) as Subgraph<DataTypeRootType>);

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
    dataTypeId: VersionedUrl;
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

  const { recordId } = metadata;

  return {
    schema: {
      ...schema,
      $id: ontologyTypeRecordIdToVersionedUrl(recordId as OntologyTypeRecordId),
    },
    metadata: metadata as OntologyElementMetadata,
  };
};
