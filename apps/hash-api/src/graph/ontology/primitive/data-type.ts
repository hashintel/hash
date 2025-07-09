import type { DataTypeRootType, Subgraph } from "@blockprotocol/graph";
import type {
  BaseUrl,
  Conversions,
  DataTypeMetadata,
  DataTypeWithMetadata,
  OntologyTemporalMetadata,
  OntologyTypeRecordId,
  ProvidedOntologyEditionProvenance,
  VersionedUrl,
  WebId,
} from "@blockprotocol/type-system";
import {
  DATA_TYPE_META_SCHEMA,
  ontologyTypeRecordIdToVersionedUrl,
} from "@blockprotocol/type-system";
import { NotFoundError } from "@local/hash-backend-utils/error";
import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";
import type {
  ArchiveDataTypeParams,
  GetDataTypesParams,
  GetDataTypeSubgraphParams,
  UnarchiveDataTypeParams,
} from "@local/hash-graph-client";
import type {
  DataTypeRelationAndSubjectBranded,
  UserPermissionsOnDataType,
} from "@local/hash-graph-sdk/authorization";
import { hasPermissionForDataTypes } from "@local/hash-graph-sdk/data-type";
import type {
  ConstructDataTypeParams,
  DataTypeConversionTargets,
  DataTypeDirectConversionsMap,
} from "@local/hash-graph-sdk/ontology";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { generateTypeId } from "@local/hash-isomorphic-utils/ontology-types";
import {
  mapGraphApiDataTypeConversions,
  mapGraphApiDataTypesToDataTypes,
  mapGraphApiSubgraphToSubgraph,
} from "@local/hash-isomorphic-utils/subgraph-mapping";

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
 * @param params.webId - the id of the account who owns the data type
 * @param [params.webShortname] – the shortname of the web that owns the data type, if the web entity does not yet exist.
 *    - Only for seeding purposes. Caller is responsible for ensuring the webShortname is correct for the webId.
 * @param params.schema - the `DataType`
 * @param params.actorId - the id of the account that is creating the data type
 */
export const createDataType: ImpureGraphFunction<
  {
    webId: WebId;
    schema: ConstructDataTypeParams;
    webShortname?: string;
    relationships: DataTypeRelationAndSubjectBranded[];
    provenance?: ProvidedOntologyEditionProvenance;
    conversions?: DataTypeDirectConversionsMap | null;
  },
  Promise<DataTypeWithMetadata>
> = async (ctx, authentication, params) => {
  const { webId, webShortname, conversions } = params;

  const shortname =
    webShortname ??
    (await getWebShortname(ctx, authentication, {
      accountOrAccountGroupId: params.webId,
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
      webId,
      relationships: params.relationships,
      provenance: {
        ...ctx.provenance,
        ...params.provenance,
      },
      conversions: conversions ?? {},
    },
  );

  return { schema, metadata: metadata as unknown as DataTypeMetadata };
};

export const getDataTypes: ImpureGraphFunction<
  Omit<GetDataTypesParams, "includeDrafts">,
  Promise<DataTypeWithMetadata[]>
> = async ({ graphApi }, { actorId }, request) =>
  graphApi
    .getDataTypes(actorId, { includeDrafts: false, ...request })
    .then(({ data: response }) =>
      mapGraphApiDataTypesToDataTypes(response.dataTypes),
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
    relationships: DataTypeRelationAndSubjectBranded[];
    provenance?: ProvidedOntologyEditionProvenance;
    conversions: Record<BaseUrl, Conversions>;
  },
  Promise<DataTypeWithMetadata>
> = async (ctx, { actorId }, params) => {
  const { dataTypeId, schema, conversions } = params;

  const { data: metadata } = await ctx.graphApi.updateDataType(actorId, {
    typeToUpdate: dataTypeId,
    schema: {
      $schema: DATA_TYPE_META_SCHEMA,
      kind: "dataType",
      ...schema,
    },
    relationships: params.relationships,
    provenance: {
      ...ctx.provenance,
      ...params.provenance,
    },
    conversions,
  });

  const { recordId } = metadata;

  return {
    schema: {
      $schema: DATA_TYPE_META_SCHEMA,
      kind: "dataType",
      ...schema,
      // TODO: Avoid casting through `unknown` when new codegen is in place
      //   see https://linear.app/hash/issue/H-4463/utilize-new-codegen-and-replace-custom-defined-node-types
      $id: ontologyTypeRecordIdToVersionedUrl(
        recordId as unknown as OntologyTypeRecordId,
      ),
    },
    // TODO: Avoid casting through `unknown` when new codegen is in place
    //   see https://linear.app/hash/issue/H-4463/utilize-new-codegen-and-replace-custom-defined-node-types
    metadata: metadata as unknown as DataTypeMetadata,
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

  return temporalMetadata as OntologyTemporalMetadata;
};

/**
 * Unarchives a data type
 *
 * @param params.dataTypeId - the id of the data type that's being unarchived
 * @param params.actorId - the id of the account that is unarchiving the data type
 */
export const unarchiveDataType: ImpureGraphFunction<
  Omit<UnarchiveDataTypeParams, "provenance">,
  Promise<OntologyTemporalMetadata>
> = async ({ graphApi, provenance }, { actorId }, params) => {
  const { data: temporalMetadata } = await graphApi.unarchiveDataType(actorId, {
    ...params,
    provenance,
  });

  return temporalMetadata as OntologyTemporalMetadata;
};

export const getDataTypeConversionTargets: ImpureGraphFunction<
  { dataTypeIds: VersionedUrl[] },
  Promise<Record<VersionedUrl, Record<VersionedUrl, DataTypeConversionTargets>>>
> = async ({ graphApi }, { actorId }, params) =>
  graphApi
    .getDataTypeConversionTargets(actorId, params)
    .then(({ data }) => mapGraphApiDataTypeConversions(data.conversions));

export const checkPermissionsOnDataType: ImpureGraphFunction<
  { dataTypeId: VersionedUrl },
  Promise<UserPermissionsOnDataType>
> = async (graphContext, { actorId }, params) => {
  const { dataTypeId } = params;

  const isPublicUser = actorId === publicUserAccountId;

  const canUpdate = isPublicUser
    ? false
    : await hasPermissionForDataTypes(
        graphContext.graphApi,
        { actorId },
        { dataTypeIds: [params.dataTypeId], action: "updateDataType" },
      ).then((permitted) => permitted.includes(dataTypeId));

  return {
    edit: canUpdate,
    view: true,
  };
};
