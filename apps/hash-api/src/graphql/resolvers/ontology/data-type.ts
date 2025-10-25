import type {
  DataTypeWithMetadata,
  OntologyTemporalMetadata,
} from "@blockprotocol/type-system";
import type { UserPermissionsOnDataType } from "@local/hash-graph-sdk/authorization";
import type {
  QueryDataTypesResponse,
  SerializedQueryDataTypeSubgraphResponse,
} from "@local/hash-graph-sdk/data-type";
import {
  findDataTypeConversionTargets,
  queryDataTypes,
  queryDataTypeSubgraph,
  serializeQueryDataTypeSubgraphResponse,
} from "@local/hash-graph-sdk/data-type";
import type { DataTypeFullConversionTargetsMap } from "@local/hash-graph-sdk/ontology";

import {
  archiveDataType,
  checkPermissionsOnDataType,
  createDataType,
  unarchiveDataType,
  updateDataType,
} from "../../../graph/ontology/primitive/data-type";
import type {
  MutationArchiveDataTypeArgs,
  MutationCreateDataTypeArgs,
  MutationUnarchiveDataTypeArgs,
  MutationUpdateDataTypeArgs,
  QueryCheckUserPermissionsOnDataTypeArgs,
  QueryFindDataTypeConversionTargetsArgs,
  QueryQueryDataTypesArgs,
  QueryQueryDataTypeSubgraphArgs,
  ResolverFn,
} from "../../api-types.gen";
import type { GraphQLContext, LoggedInGraphQLContext } from "../../context";
import { graphQLContextToImpureGraphContext } from "../util";

export const queryDataTypesResolver: ResolverFn<
  Promise<QueryDataTypesResponse>,
  Record<string, never>,
  GraphQLContext,
  QueryQueryDataTypesArgs
> = async (_, { request }, graphQLContext) =>
  queryDataTypes(
    graphQLContextToImpureGraphContext(graphQLContext).graphApi,
    graphQLContext.authentication,
    request,
  );

export const queryDataTypeSubgraphResolver: ResolverFn<
  Promise<SerializedQueryDataTypeSubgraphResponse>,
  Record<string, never>,
  GraphQLContext,
  QueryQueryDataTypeSubgraphArgs
> = async (_, { request }, graphQLContext) =>
  queryDataTypeSubgraph(
    graphQLContextToImpureGraphContext(graphQLContext).graphApi,
    graphQLContext.authentication,
    request,
  ).then(serializeQueryDataTypeSubgraphResponse);

export const findDataTypeConversionTargetsResolver: ResolverFn<
  Promise<DataTypeFullConversionTargetsMap>,
  Record<string, never>,
  GraphQLContext,
  QueryFindDataTypeConversionTargetsArgs
> = async (_, { dataTypeIds }, graphQLContext) =>
  findDataTypeConversionTargets(
    graphQLContextToImpureGraphContext(graphQLContext).graphApi,
    graphQLContext.authentication,
    { dataTypeIds },
  );

export const createDataTypeResolver: ResolverFn<
  Promise<DataTypeWithMetadata>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationCreateDataTypeArgs
> = async (_, params, { dataSources, authentication, provenance }) => {
  const { webId, conversions, dataType } = params;

  const createdDataType = await createDataType(
    {
      ...dataSources,
      provenance,
    },
    authentication,
    {
      webId,
      schema: dataType,
      conversions: conversions ?? {},
    },
  );

  return createdDataType;
};

export const updateDataTypeResolver: ResolverFn<
  Promise<DataTypeWithMetadata>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationUpdateDataTypeArgs
> = async (_, params, graphQLContext) =>
  updateDataType(
    graphQLContextToImpureGraphContext(graphQLContext),
    graphQLContext.authentication,
    {
      dataTypeId: params.dataTypeId,
      schema: params.dataType,
      conversions: {},
    },
  );

export const archiveDataTypeResolver: ResolverFn<
  Promise<OntologyTemporalMetadata>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationArchiveDataTypeArgs
> = async (_, params, graphQLContext) =>
  archiveDataType(
    graphQLContextToImpureGraphContext(graphQLContext),
    graphQLContext.authentication,
    params,
  );

export const unarchiveDataTypeResolver: ResolverFn<
  Promise<OntologyTemporalMetadata>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationUnarchiveDataTypeArgs
> = async (_, params, graphQLContext) =>
  unarchiveDataType(
    graphQLContextToImpureGraphContext(graphQLContext),
    graphQLContext.authentication,
    params,
  );

export const checkUserPermissionsOnDataTypeResolver: ResolverFn<
  Promise<UserPermissionsOnDataType>,
  Record<string, never>,
  LoggedInGraphQLContext,
  QueryCheckUserPermissionsOnDataTypeArgs
> = async (_, params, { dataSources, authentication, provenance }) =>
  checkPermissionsOnDataType(
    { ...dataSources, provenance },
    authentication,
    params,
  );
