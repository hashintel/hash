import { OntologyTemporalMetadata } from "@local/hash-graph-client";
import {
  currentTimeInstantTemporalAxes,
  fullTransactionTimeAxis,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  OwnedById,
  PropertyTypeRootType,
  PropertyTypeWithMetadata,
  Subgraph,
} from "@local/hash-subgraph";
import { mapGraphApiSubgraphToSubgraph } from "@local/hash-subgraph/stdlib";

import {
  archivePropertyType,
  createPropertyType,
  getPropertyTypeSubgraphById,
  unarchivePropertyType,
  updatePropertyType,
} from "../../../graph/ontology/primitive/property-type";
import {
  MutationArchivePropertyTypeArgs,
  MutationCreatePropertyTypeArgs,
  MutationUnarchivePropertyTypeArgs,
  MutationUpdatePropertyTypeArgs,
  QueryGetPropertyTypeArgs,
  QueryQueryPropertyTypesArgs,
  ResolverFn,
} from "../../api-types.gen";
import { GraphQLContext, LoggedInGraphQLContext } from "../../context";
import { dataSourcesToImpureGraphContext } from "../util";

export const createPropertyTypeResolver: ResolverFn<
  Promise<PropertyTypeWithMetadata>,
  {},
  LoggedInGraphQLContext,
  MutationCreatePropertyTypeArgs
> = async (_, params, { dataSources, authentication, user }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const { ownedById, propertyType } = params;

  const createdPropertyType = await createPropertyType(
    context,
    authentication,
    {
      ownedById: (ownedById ?? user.accountId) as OwnedById,
      schema: propertyType,
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

  return createdPropertyType;
};

export const queryPropertyTypesResolver: ResolverFn<
  Promise<Subgraph>,
  {},
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

  const subgraph = mapGraphApiSubgraphToSubgraph<PropertyTypeRootType>(data);

  return subgraph;
};

export const getPropertyTypeResolver: ResolverFn<
  Promise<Subgraph>,
  {},
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
  { dataSources, authentication },
  __,
) =>
  getPropertyTypeSubgraphById(
    dataSourcesToImpureGraphContext(dataSources),
    authentication,
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
  {},
  LoggedInGraphQLContext,
  MutationUpdatePropertyTypeArgs
> = async (_, params, { dataSources, authentication }) =>
  updatePropertyType(
    dataSourcesToImpureGraphContext(dataSources),
    authentication,
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
  {},
  LoggedInGraphQLContext,
  MutationArchivePropertyTypeArgs
> = async (_, params, { dataSources, authentication }) =>
  archivePropertyType(dataSources, authentication, params);

export const unarchivePropertyTypeResolver: ResolverFn<
  Promise<OntologyTemporalMetadata>,
  {},
  LoggedInGraphQLContext,
  MutationUnarchivePropertyTypeArgs
> = async (_, params, { dataSources, authentication }) =>
  unarchivePropertyType(dataSources, authentication, params);
