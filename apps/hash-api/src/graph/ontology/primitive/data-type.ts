import {
  DATA_TYPE_META_SCHEMA,
  VersionedUrl,
} from "@blockprotocol/type-system";
import { DataTypeStructuralQuery } from "@local/hash-graph-client";
import { ConstructDataTypeParams } from "@local/hash-graphql-shared/graphql/types";
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

import { NotFoundError } from "../../../lib/error";
import {
  currentTimeInstantTemporalAxes,
  ImpureGraphFunction,
  zeroedGraphResolveDepths,
} from "../..";
import { getNamespaceOfAccountOwner } from "./util";

const { FRONTEND_URL } = require("../../../lib/config");

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
    schema: ConstructDataTypeParams;
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
  const schema = {
    $schema: DATA_TYPE_META_SCHEMA,
    kind: "dataType" as const,
    $id: dataTypeUrl,
    ...params.schema,
  };

  const { data: metadata } = await graphApi.createDataType({
    schema,
    ownedById,
    actorId,
  });

  return { schema, metadata: metadata as OntologyElementMetadata };
};

/**
 * Get data types by a structural query.
 *
 * @param params.query the structural query to filter data types by.
 */
export const getDataTypes: ImpureGraphFunction<
  {
    query: DataTypeStructuralQuery;
  },
  Promise<Subgraph<DataTypeRootType>>
> = async ({ graphApi }, { query }) => {
  return await graphApi
    .getDataTypesByQuery(query)
    .then(({ data: subgraph }) => subgraph as Subgraph<DataTypeRootType>);
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
> = async (context, params) => {
  const { dataTypeId } = params;

  const [dataType] = await getDataTypes(context, {
    query: {
      filter: {
        equal: [{ path: ["versionedUrl"] }, { parameter: dataTypeId }],
      },
      graphResolveDepths: zeroedGraphResolveDepths,
      temporalAxes: currentTimeInstantTemporalAxes,
    },
  }).then(getRoots);

  if (!dataType) {
    throw new NotFoundError(`Could not find data type with ID "${dataTypeId}"`);
  }

  return dataType;
};

/**
 * Get a data type rooted subgraph by its versioned URL.
 *
 * If the type does not already exist within the Graph, and is an externally-hosted type, this will also load the type into the Graph.
 */
export const getDataTypeSubgraphById: ImpureGraphFunction<
  Omit<DataTypeStructuralQuery, "filter"> & {
    dataTypeId: VersionedUrl;
    actorId: AccountId;
  },
  Promise<Subgraph<DataTypeRootType>>
> = async (context, params) => {
  const { graphResolveDepths, temporalAxes, dataTypeId, actorId } = params;

  const query: DataTypeStructuralQuery = {
    filter: {
      equal: [{ path: ["versionedUrl"] }, { parameter: dataTypeId }],
    },
    graphResolveDepths,
    temporalAxes,
  };

  let subgraph = await getDataTypes(context, {
    query,
  });

  if (subgraph.roots.length === 0 && !dataTypeId.startsWith(FRONTEND_URL)) {
    await context.graphApi.loadExternalDataType({
      actorId,
      dataTypeId,
    });

    subgraph = await getDataTypes(context, {
      query,
    });
  }

  if (subgraph.roots.length === 0) {
    throw new NotFoundError(`Could not find data type with ID "${dataTypeId}"`);
  }

  return subgraph;
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
    schema: ConstructDataTypeParams;
    actorId: AccountId;
  },
  Promise<DataTypeWithMetadata>
> = async ({ graphApi }, params) => {
  const { dataTypeId, schema, actorId } = params;

  const { data: metadata } = await graphApi.updateDataType({
    actorId,
    typeToUpdate: dataTypeId,
    schema: {
      $schema: DATA_TYPE_META_SCHEMA,
      kind: "dataType",
      ...schema,
    },
  });

  const { recordId } = metadata;

  return {
    schema: {
      $schema: DATA_TYPE_META_SCHEMA,
      kind: "dataType",
      ...schema,
      $id: ontologyTypeRecordIdToVersionedUrl(recordId as OntologyTypeRecordId),
    },
    metadata: metadata as OntologyElementMetadata,
  };
};
