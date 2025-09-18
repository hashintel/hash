import type {
  OntologyTemporalMetadata,
  PropertyTypeWithMetadata,
  WebId,
} from "@blockprotocol/type-system";
import { NotFoundError } from "@local/hash-backend-utils/error";
import type { SerializedSubgraph } from "@local/hash-graph-sdk/entity";
import {
  getPropertyTypeSubgraphById,
  queryPropertyTypeSubgraph,
  serializeQueryPropertyTypeSubgraphResponse,
} from "@local/hash-graph-sdk/property-type";
import {
  currentTimeInstantTemporalAxes,
  fullTransactionTimeAxis,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { serializeSubgraph } from "@local/hash-isomorphic-utils/subgraph-mapping";

import {
  archivePropertyType,
  createPropertyType,
  unarchivePropertyType,
  updatePropertyType,
} from "../../../graph/ontology/primitive/property-type";
import type {
  MutationArchivePropertyTypeArgs,
  MutationCreatePropertyTypeArgs,
  MutationUnarchivePropertyTypeArgs,
  MutationUpdatePropertyTypeArgs,
  QueryGetPropertyTypeArgs,
  QueryQueryPropertyTypesArgs,
  ResolverFn,
} from "../../api-types.gen";
import type { GraphQLContext, LoggedInGraphQLContext } from "../../context";
import { graphQLContextToImpureGraphContext } from "../util";

export const createPropertyTypeResolver: ResolverFn<
  Promise<PropertyTypeWithMetadata>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationCreatePropertyTypeArgs
> = async (_, params, graphQLContext) => {
  const { authentication, user } = graphQLContext;

  const context = graphQLContextToImpureGraphContext(graphQLContext);

  const { webId, propertyType } = params;

  const createdPropertyType = await createPropertyType(
    context,
    authentication,
    {
      webId: (webId ?? user.accountId) as WebId,
      schema: propertyType,
    },
  );

  return createdPropertyType;
};

export const queryPropertyTypesResolver: ResolverFn<
  Promise<SerializedSubgraph>,
  Record<string, never>,
  LoggedInGraphQLContext,
  QueryQueryPropertyTypesArgs
> = async (
  _,
  {
    constrainsValuesOn,
    constrainsPropertiesOn,
    filter,
    latestOnly = true,
    includeArchived = false,
  },
  { dataSources, authentication },
  __,
) => {
  const { graphApi } = dataSources;

  const latestOnlyFilter = {
    equal: [{ path: ["version"] }, { parameter: "latest" }],
  };

  /**
   * @todo: get all latest property types in specified account.
   *   This may mean implicitly filtering results by what an account is
   *   authorized to see.
   * @see https://linear.app/hash/issue/H-2995
   */
  const response = await queryPropertyTypeSubgraph(graphApi, authentication, {
    filter: latestOnly
      ? filter
        ? { all: [filter, latestOnlyFilter] }
        : latestOnlyFilter
      : (filter ?? { all: [] }),
    graphResolveDepths: {
      ...zeroedGraphResolveDepths,
      constrainsValuesOn,
      constrainsPropertiesOn,
    },
    temporalAxes: includeArchived
      ? fullTransactionTimeAxis
      : currentTimeInstantTemporalAxes,
  });

  return serializeQueryPropertyTypeSubgraphResponse(response).subgraph;
};

export const getPropertyTypeResolver: ResolverFn<
  Promise<SerializedSubgraph>,
  Record<string, never>,
  GraphQLContext,
  QueryGetPropertyTypeArgs
> = async (
  _,
  {
    propertyTypeId,
    constrainsValuesOn,
    constrainsPropertiesOn,
    includeArchived,
  },
  graphQLContext,
  __,
) => {
  const subgraph = await getPropertyTypeSubgraphById(
    graphQLContextToImpureGraphContext(graphQLContext).graphApi,
    graphQLContext.authentication,
    {
      propertyTypeId,
      graphResolveDepths: {
        ...zeroedGraphResolveDepths,
        constrainsValuesOn,
        constrainsPropertiesOn,
      },
      temporalAxes: includeArchived
        ? fullTransactionTimeAxis
        : currentTimeInstantTemporalAxes,
    },
  );

  if (!subgraph) {
    throw new NotFoundError(
      `Could not find property type with ID "${propertyTypeId}"`,
    );
  }

  return serializeSubgraph(subgraph);
};

export const updatePropertyTypeResolver: ResolverFn<
  Promise<PropertyTypeWithMetadata>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationUpdatePropertyTypeArgs
> = async (_, params, graphQLContext) =>
  updatePropertyType(
    graphQLContextToImpureGraphContext(graphQLContext),
    graphQLContext.authentication,
    {
      propertyTypeId: params.propertyTypeId,
      schema: params.updatedPropertyType,
    },
  );

export const archivePropertyTypeResolver: ResolverFn<
  Promise<OntologyTemporalMetadata>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationArchivePropertyTypeArgs
> = async (_, params, graphQLContext) =>
  archivePropertyType(
    graphQLContextToImpureGraphContext(graphQLContext),
    graphQLContext.authentication,
    params,
  );

export const unarchivePropertyTypeResolver: ResolverFn<
  Promise<OntologyTemporalMetadata>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationUnarchivePropertyTypeArgs
> = async (_, params, graphQLContext) =>
  unarchivePropertyType(
    graphQLContextToImpureGraphContext(graphQLContext),
    graphQLContext.authentication,
    params,
  );
