import {
  DATA_TYPE_META_SCHEMA,
  VersionedUrl,
} from "@blockprotocol/type-system";
import {
  DataTypePermission,
  DataTypeStructuralQuery,
  ModifyRelationshipOperation,
  OntologyTemporalMetadata,
} from "@local/hash-graph-client";
import { ConstructDataTypeParams } from "@local/hash-graphql-shared/graphql/types";
import { frontendUrl } from "@local/hash-isomorphic-utils/environment";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { generateTypeId } from "@local/hash-isomorphic-utils/ontology-types";
import {
  DataTypeAuthorizationRelationship,
  DataTypeRootType,
  DataTypeWithMetadata,
  OntologyElementMetadata,
  OntologyTypeRecordId,
  ontologyTypeRecordIdToVersionedUrl,
  OwnedById,
  Subgraph,
} from "@local/hash-subgraph";
import {
  getRoots,
  mapGraphApiSubgraphToSubgraph,
} from "@local/hash-subgraph/stdlib";

import { NotFoundError } from "../../../lib/error";
import { ImpureGraphFunction } from "../../util";
import { getWebShortname } from "./util";

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
 * @param [params.webShortname] – the shortname of the web that owns the data type, if the web entity does not yet exist.
 *    - Only for seeding purposes. Caller is responsible for ensuring the webShortname is correct for the ownedById.
 * @param params.schema - the `DataType`
 * @param params.actorId - the id of the account that is creating the data type
 */
export const createDataType: ImpureGraphFunction<
  {
    ownedById: OwnedById;
    schema: ConstructDataTypeParams;
    webShortname?: string;
  },
  Promise<DataTypeWithMetadata>
> = async (ctx, authentication, params) => {
  const { ownedById, webShortname } = params;

  const shortname =
    webShortname ??
    (await getWebShortname(ctx, authentication, {
      accountOrAccountGroupId: params.ownedById,
    }));

  const { graphApi } = ctx;

  const dataTypeUrl = generateTypeId({
    kind: "data-type",
    title: params.schema.title,
    webShortname: shortname,
  });

  const schema = {
    $schema: DATA_TYPE_META_SCHEMA,
    kind: "dataType" as const,
    $id: dataTypeUrl,
    ...params.schema,
  };

  const { data: metadata } = await graphApi.createDataType(
    authentication.actorId,
    {
      schema,
      ownedById,
    },
  );

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
> = async ({ graphApi }, { actorId }, { query }) => {
  return await graphApi.getDataTypesByQuery(actorId, query).then(({ data }) => {
    const subgraph = mapGraphApiSubgraphToSubgraph<DataTypeRootType>(data);

    return subgraph;
  });
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
> = async (context, authentication, params) => {
  const { dataTypeId } = params;

  const [dataType] = await getDataTypes(context, authentication, {
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
  },
  Promise<Subgraph<DataTypeRootType>>
> = async (context, authentication, params) => {
  const { graphResolveDepths, temporalAxes, dataTypeId } = params;

  const query: DataTypeStructuralQuery = {
    filter: {
      equal: [{ path: ["versionedUrl"] }, { parameter: dataTypeId }],
    },
    graphResolveDepths,
    temporalAxes,
  };

  let subgraph = await getDataTypes(context, authentication, {
    query,
  });

  if (subgraph.roots.length === 0 && !dataTypeId.startsWith(frontendUrl)) {
    await context.graphApi.loadExternalDataType(authentication.actorId, {
      dataTypeId,
    });

    subgraph = await getDataTypes(context, authentication, {
      query,
    });
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
  },
  Promise<DataTypeWithMetadata>
> = async ({ graphApi }, { actorId }, params) => {
  const { dataTypeId, schema } = params;

  const { data: metadata } = await graphApi.updateDataType(actorId, {
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

/**
 * Archives a data type
 *
 * @param params.dataTypeId - the id of the data type that's being archived
 * @param params.actorId - the id of the account that is archiving the data type
 */
export const archiveDataType: ImpureGraphFunction<
  {
    dataTypeId: VersionedUrl;
  },
  Promise<OntologyTemporalMetadata>
> = async ({ graphApi }, { actorId }, params) => {
  const { dataTypeId } = params;

  const { data: temporalMetadata } = await graphApi.archiveDataType(actorId, {
    typeToArchive: dataTypeId,
  });

  return temporalMetadata;
};

/**
 * Unarchives a data type
 *
 * @param params.dataTypeId - the id of the data type that's being unarchived
 * @param params.actorId - the id of the account that is unarchiving the data type
 */
export const unarchiveDataType: ImpureGraphFunction<
  {
    dataTypeId: VersionedUrl;
  },
  Promise<OntologyTemporalMetadata>
> = async ({ graphApi }, { actorId }, params) => {
  const { dataTypeId } = params;

  const { data: temporalMetadata } = await graphApi.unarchiveDataType(actorId, {
    typeToUnarchive: dataTypeId,
  });

  return temporalMetadata;
};

export const getDataTypeAuthorizationRelationships: ImpureGraphFunction<
  { dataTypeId: VersionedUrl },
  Promise<DataTypeAuthorizationRelationship[]>
> = async ({ graphApi }, { actorId }, params) =>
  graphApi
    .getDataTypeAuthorizationRelationships(actorId, params.dataTypeId)
    .then(({ data }) =>
      data.map(
        (relationship) =>
          ({
            resource: { kind: "dataType", resourceId: params.dataTypeId },
            ...relationship,
          }) as DataTypeAuthorizationRelationship,
      ),
    );

export const modifyDataTypeAuthorizationRelationships: ImpureGraphFunction<
  {
    operation: ModifyRelationshipOperation;
    relationship: DataTypeAuthorizationRelationship;
  }[],
  Promise<void>
> = async ({ graphApi }, { actorId }, params) => {
  await graphApi.modifyDataTypeAuthorizationRelationships(
    actorId,
    params.map(({ operation, relationship }) => ({
      operation,
      resource: relationship.resource.resourceId,
      relationAndSubject: relationship,
    })),
  );
};

export const checkDataTypePermission: ImpureGraphFunction<
  { dataTypeId: VersionedUrl; permission: DataTypePermission },
  Promise<boolean>
> = async ({ graphApi }, { actorId }, params) =>
  graphApi
    .checkDataTypePermission(actorId, params.dataTypeId, params.permission)
    .then(({ data }) => data.has_permission);
