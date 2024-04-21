import type { OntologyTemporalMetadata } from "@local/hash-graph-client";
import {
  currentTimeInstantTemporalAxes,
  defaultPropertyTypeAuthorizationRelationships,
  fullTransactionTimeAxis,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { mapGraphApiSubgraphToSubgraph } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type {
  OwnedById,
  PropertyTypeRootType,
  PropertyTypeWithMetadata,
  Subgraph,
} from "@local/hash-subgraph";

import {
  archivePropertyType,
  createPropertyType,
  getPropertyTypeSubgraphById,
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

  const { ownedById, propertyType } = params;

  const createdPropertyType = await createPropertyType(
    context,
    authentication,
    {
      ownedById: (ownedById ?? user.accountId) as OwnedById,
      schema: propertyType,
      relationships: defaultPropertyTypeAuthorizationRelationships,
    },
  );

  return createdPropertyType;
};

export const queryPropertyTypesResolver: ResolverFn<
  Promise<Subgraph>,
  Record<string, never>,
  LoggedInGraphQLContext,
  QueryQueryPropertyTypesArgs
> = async (
  _,
  {
    constrainsValuesOn,
    constrainsPropertiesOn,
    latestOnly = true,
    includeArchived = false,
  },
  { dataSources, authentication },
  __,
) => {
  const { graphApi } = dataSources;

  /**
   * @todo: get all latest property types in specified account.
   *   This may mean implicitly filtering results by what an account is
   *   authorized to see.
   *   https://app.asana.com/0/1202805690238892/1202890446280569/f
   */
  const { data } = await graphApi.getPropertyTypesByQuery(
    authentication.actorId,
    {
      filter: latestOnly
        ? {
            equal: [{ path: ["version"] }, { parameter: "latest" }],
          }
        : { all: [] },
      graphResolveDepths: {
        ...zeroedGraphResolveDepths,
        constrainsValuesOn,
        constrainsPropertiesOn,
      },
      temporalAxes: includeArchived
        ? fullTransactionTimeAxis
        : currentTimeInstantTemporalAxes,
      includeDrafts: false,
    },
  );

  const subgraph = mapGraphApiSubgraphToSubgraph<PropertyTypeRootType>(
    data,
    authentication.actorId,
  );

  return subgraph;
};

export const getPropertyTypeResolver: ResolverFn<
  Promise<Subgraph>,
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
) =>
  getPropertyTypeSubgraphById(
    graphQLContextToImpureGraphContext(graphQLContext),
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
      relationships: [
        {
          relation: "setting",
          subject: {
            kind: "setting",
            subjectId: "updateFromWeb",
          },
        },
        {
          relation: "viewer",
          subject: {
            kind: "public",
          },
        },
      ],
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
