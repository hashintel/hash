import {
  findDataTypeConversionTargets,
  queryDataTypes,
  queryDataTypeSubgraph,
  serializeQueryDataTypeSubgraphResponse,
} from "@local/hash-graph-sdk/data-type";

import {
  archiveDataType,
  checkPermissionsOnDataType,
  checkPermissionsOnDataTypes,
  createDataType,
  unarchiveDataType,
  updateDataType,
} from "../../../graph/ontology/primitive/data-type";
import { graphQLContextToImpureGraphContext } from "../util";

import type {
  DataTypePermissionsRecord,
  MutationArchiveDataTypeArgs,
  MutationCreateDataTypeArgs,
  MutationUnarchiveDataTypeArgs,
  MutationUpdateDataTypeArgs,
  QueryCheckUserPermissionsOnDataTypeArgs,
  QueryCheckUserPermissionsOnDataTypesArgs,
  QueryFindDataTypeConversionTargetsArgs,
  QueryQueryDataTypesArgs,
  QueryQueryDataTypeSubgraphArgs,
  ResolverFn,
} from "../../api-types.gen";
import type { GraphQLContext, LoggedInGraphQLContext } from "../../context";
import type {
  DataTypeWithMetadata,
  OntologyTemporalMetadata,
} from "@blockprotocol/type-system";
import type { UserPermissionsOnDataType } from "@local/hash-graph-sdk/authorization";
import type {
  QueryDataTypesResponse,
  SerializedQueryDataTypeSubgraphResponse,
} from "@local/hash-graph-sdk/data-type";
import type { DataTypeFullConversionTargetsMap } from "@local/hash-graph-sdk/ontology";

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

/**
 * The graph wraps every write failure in a generic outer message ("Could not
 * insert into store"), keeping the actual cause — a base-URL collision, an
 * unsatisfiable constraint, a missing parent — as nested source contexts.
 * Surface those so the client can tell the failures apart.
 */
const rethrowWithGraphErrorDetail = (error: unknown): never => {
  // Two levels only: the graph's own wrapper and its immediate cause. Deeper
  // frames carry database diagnostics that must not reach clients.
  const contexts: string[] = [];
  const walk = (frames: unknown, depth: number) => {
    if (!Array.isArray(frames) || depth > 1) {
      return;
    }
    for (const frame of frames) {
      if (Array.isArray(frame)) {
        walk(frame, depth);
      } else if (frame && typeof frame === "object") {
        if ("context" in frame && typeof frame.context === "string") {
          contexts.push(frame.context);
        }
        if ("sources" in frame) {
          walk(frame.sources, depth + 1);
        }
      }
    }
  };
  if (error && typeof error === "object" && "status" in error) {
    walk((error.status as { contents?: unknown }).contents, 0);
  }

  // Frames echoing Postgres diagnostics stay server-side even at the
  // allowed depth — the driver folds DETAIL/HINT into its error text
  const postgresDiagnostic =
    /duplicate key value|violates .{0,30}constraint|\bSQLSTATE\b|\bDETAIL:|\bHINT:|\bKey \(|relation "[^"]*"|syntax error at or near/i;
  const surfaced = contexts.filter(
    (context) => !postgresDiagnostic.test(context),
  );

  // With one context the outer wrapper is all there is — the original error
  // already says as much, unless it isn't an Error at all
  if (surfaced.length > (error instanceof Error ? 1 : 0)) {
    throw new Error(surfaced.join(": "), {
      cause: error instanceof Error ? error : undefined,
    });
  }
  throw error;
};

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
  ).catch(rethrowWithGraphErrorDetail);

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
      conversions: params.conversions ?? {},
    },
  ).catch(rethrowWithGraphErrorDetail);

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

export const checkUserPermissionsOnDataTypesResolver: ResolverFn<
  DataTypePermissionsRecord[],
  Record<string, never>,
  GraphQLContext,
  QueryCheckUserPermissionsOnDataTypesArgs
> = async (_, params, { dataSources, authentication, provenance }) =>
  checkPermissionsOnDataTypes({ ...dataSources, provenance }, authentication, {
    dataTypeIds: params.dataTypeIds,
  });
