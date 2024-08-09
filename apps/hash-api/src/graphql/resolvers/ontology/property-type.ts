import type { OntologyTemporalMetadata } from "@local/hash-graph-client";
import type { PropertyTypeWithMetadata } from "@local/hash-graph-types/ontology";
import type { OwnedById } from "@local/hash-graph-types/web";
import {
  currentTimeInstantTemporalAxes,
  defaultPropertyTypeAuthorizationRelationships,
  fullTransactionTimeAxis,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  mapGraphApiSubgraphToSubgraph,
  serializeSubgraph,
} from "@local/hash-isomorphic-utils/subgraph-mapping";
import type {
  PropertyTypeRootType,
  SerializedSubgraph,
} from "@local/hash-subgraph";

import {
  archivePropertyType,
  createPropertyType,
  getPropertyTypeSubgraphById,
  unarchivePropertyType,
  updatePropertyType,
} from "../../../graph/ontology/primitive/property-type.js";
import type {
  MutationArchivePropertyTypeArgs,
  MutationCreatePropertyTypeArgs,
  MutationUnarchivePropertyTypeArgs,
  MutationUpdatePropertyTypeArgs,
  QueryGetPropertyTypeArgs,
  QueryQueryPropertyTypesArgs,
  ResolverFn,
} from "../../api-types.gen.js";
import type { GraphQLContext, LoggedInGraphQLContext } from "../../context.js";
import { graphQLContextToImpureGraphContext } from "../util.js";

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
  Promise<SerializedSubgraph>,
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
   * @see https://linear.app/hash/issue/H-2995
   */
  const { data: response } = await graphApi.getPropertyTypeSubgraph(
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

  return serializeSubgraph(
    mapGraphApiSubgraphToSubgraph<PropertyTypeRootType>(
      response.subgraph,
      authentication.actorId,
    ),
  );
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
) =>
  serializeSubgraph(
    await getPropertyTypeSubgraphById(
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
    ),
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
