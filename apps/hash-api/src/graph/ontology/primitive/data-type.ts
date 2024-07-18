import type { VersionedUrl } from "@blockprotocol/type-system";
import { DATA_TYPE_META_SCHEMA } from "@blockprotocol/type-system";
import { NotFoundError } from "@local/hash-backend-utils/error";
import type {
  ArchiveDataTypeParams,
  DataTypePermission,
  GetDataTypesParams,
  GetDataTypeSubgraphParams,
  ModifyRelationshipOperation,
  OntologyTemporalMetadata,
  ProvidedOntologyEditionProvenance,
  UnarchiveDataTypeParams,
} from "@local/hash-graph-client";
import type {
  ConstructDataTypeParams,
  DataTypeMetadata,
  DataTypeWithMetadata,
  OntologyTypeRecordId,
} from "@local/hash-graph-types/ontology";
import type { OwnedById } from "@local/hash-graph-types/web";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { generateTypeId } from "@local/hash-isomorphic-utils/ontology-types";
import {
  mapGraphApiDataTypeToDataType,
  mapGraphApiSubgraphToSubgraph,
} from "@local/hash-isomorphic-utils/subgraph-mapping";
import type {
  DataTypeAuthorizationRelationship,
  DataTypeRelationAndSubject,
  DataTypeRootType,
  Subgraph,
} from "@local/hash-subgraph";
import { ontologyTypeRecordIdToVersionedUrl } from "@local/hash-subgraph";

import type { ImpureGraphFunction } from "../../context-types";
import { getWebShortname, isExternalTypeId } from "./util";

/**
 * Create a data type.
 *
 * @todo revisit data type creation
 *   User defined data types are not specified yet, which means this `create`
 *   operation should not be exposed to users yet.
 *   Depends on the RFC captured by:
 *   https://linear.app/hash/issue/BP-104
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
    relationships: DataTypeRelationAndSubject[];
    provenance?: ProvidedOntologyEditionProvenance;
  },
  Promise<DataTypeWithMetadata>
> = async (ctx, authentication, params) => {
  const { ownedById, webShortname, provenance } = params;

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
      relationships: params.relationships,
      provenance,
    },
  );

  return { schema, metadata: metadata as DataTypeMetadata };
};

export const getDataTypes: ImpureGraphFunction<
  Omit<GetDataTypesParams, "includeDrafts">,
  Promise<DataTypeWithMetadata[]>
> = async ({ graphApi }, { actorId }, request) =>
  graphApi
    .getDataTypes(actorId, { includeDrafts: false, ...request })
    .then(({ data: response }) =>
      mapGraphApiDataTypeToDataType(response.dataTypes),
    );

/**
 * Get data types by a structural query.
 *
 * @param params.query the structural query to filter data types by.
 */
export const getDataTypeSubgraph: ImpureGraphFunction<
  Omit<GetDataTypeSubgraphParams, "includeDrafts">,
  Promise<Subgraph<DataTypeRootType>>
> = async ({ graphApi }, { actorId }, request) => {
  return await graphApi
    .getDataTypeSubgraph(actorId, { includeDrafts: false, ...request })
    .then(({ data: response }) => {
      const subgraph = mapGraphApiSubgraphToSubgraph<DataTypeRootType>(
        response.subgraph,
        actorId,
      );

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
    filter: {
      equal: [{ path: ["versionedUrl"] }, { parameter: dataTypeId }],
    },
    temporalAxes: currentTimeInstantTemporalAxes,
  });

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
  Omit<GetDataTypeSubgraphParams, "filter" | "includeDrafts"> & {
    dataTypeId: VersionedUrl;
  },
  Promise<Subgraph<DataTypeRootType>>
> = async (context, authentication, params) => {
  const { graphResolveDepths, temporalAxes, dataTypeId } = params;

  const request: Omit<GetDataTypeSubgraphParams, "includeDrafts"> = {
    filter: {
      equal: [{ path: ["versionedUrl"] }, { parameter: dataTypeId }],
    },
    graphResolveDepths,
    temporalAxes,
  };

  let subgraph = await getDataTypeSubgraph(context, authentication, request);

  if (subgraph.roots.length === 0 && isExternalTypeId(dataTypeId)) {
    await context.graphApi.loadExternalDataType(authentication.actorId, {
      dataTypeId,
    });

    subgraph = await getDataTypeSubgraph(context, authentication, request);
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
 *   https://linear.app/hash/issue/BP-104
 *
 * @param params.dataTypeId - the id of the data type that's being updated
 * @param params.schema - the updated `DataType`
 * @param params.actorId - the id of the account that is updating the data type
 */
export const updateDataType: ImpureGraphFunction<
  {
    dataTypeId: VersionedUrl;
    schema: ConstructDataTypeParams;
    relationships: DataTypeRelationAndSubject[];
    provenance?: ProvidedOntologyEditionProvenance;
  },
  Promise<DataTypeWithMetadata>
> = async ({ graphApi }, { actorId }, params) => {
  const { dataTypeId, schema, provenance } = params;

  const { data: metadata } = await graphApi.updateDataType(actorId, {
    typeToUpdate: dataTypeId,
    schema: {
      $schema: DATA_TYPE_META_SCHEMA,
      kind: "dataType",
      ...schema,
    },
    relationships: params.relationships,
    provenance,
  });

  const { recordId } = metadata;

  return {
    schema: {
      $schema: DATA_TYPE_META_SCHEMA,
      kind: "dataType",
      ...schema,
      $id: ontologyTypeRecordIdToVersionedUrl(recordId as OntologyTypeRecordId),
    },
    metadata: metadata as DataTypeMetadata,
  };
};

/**
 * Archives a data type
 *
 * @param params.dataTypeId - the id of the data type that's being archived
 * @param params.actorId - the id of the account that is archiving the data type
 */
export const archiveDataType: ImpureGraphFunction<
  ArchiveDataTypeParams,
  Promise<OntologyTemporalMetadata>
> = async ({ graphApi }, { actorId }, params) => {
  const { data: temporalMetadata } = await graphApi.archiveDataType(
    actorId,
    params,
  );

  return temporalMetadata;
};

/**
 * Unarchives a data type
 *
 * @param params.dataTypeId - the id of the data type that's being unarchived
 * @param params.actorId - the id of the account that is unarchiving the data type
 */
export const unarchiveDataType: ImpureGraphFunction<
  UnarchiveDataTypeParams,
  Promise<OntologyTemporalMetadata>
> = async ({ graphApi }, { actorId }, params) => {
  const { data: temporalMetadata } = await graphApi.unarchiveDataType(
    actorId,
    params,
  );

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
