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
import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";
import type {
  ArchiveDataTypeParams,
  UnarchiveDataTypeParams,
} from "@local/hash-graph-client";
import type { UserPermissionsOnDataType } from "@local/hash-graph-sdk/authorization";
import { hasPermissionForDataTypes } from "@local/hash-graph-sdk/data-type";
import type {
  ConstructDataTypeParams,
  DataTypeDirectConversionsMap,
} from "@local/hash-graph-sdk/ontology";
import { generateTypeId } from "@local/hash-isomorphic-utils/ontology-types";

import type { ImpureGraphFunction } from "../../context-types";
import { getWebShortname } from "./util";

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
    provenance?: ProvidedOntologyEditionProvenance;
    conversions?: DataTypeDirectConversionsMap | null;
  },
  Promise<DataTypeWithMetadata>
> = async (ctx, authentication, params) => {
  const { webId, webShortname, conversions } = params;

  const shortname =
    webShortname ??
    (await getWebShortname(ctx, authentication, {
      accountOrAccountGroupId: webId,
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
      provenance: {
        ...ctx.provenance,
        ...params.provenance,
      },
      conversions: conversions ?? {},
    },
  );

  return { schema, metadata: metadata as unknown as DataTypeMetadata };
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
