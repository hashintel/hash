import { OntologyTemporalMetadata } from "@local/hash-graph-client";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  OwnedById,
  PropertyTypeRootType,
  PropertyTypeWithMetadata,
  Subgraph,
} from "@local/hash-subgraph";

import { publicUserAccountId } from "../../../graph";
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
> = async (_, params, { dataSources, user }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const { ownedById, propertyType } = params;

  const createdPropertyType = await createPropertyType(
    context,
    { actorId: user.accountId },
    {
      ownedById: (ownedById ?? user.accountId) as OwnedById,
      schema: propertyType,
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
  { constrainsValuesOn, constrainsPropertiesOn },
  { dataSources, user },
  __,
) => {
  const { graphApi } = dataSources;

  /**
   * @todo: get all latest property types in specified account.
   *   This may mean implicitly filtering results by what an account is
   *   authorized to see.
   *   https://app.asana.com/0/1202805690238892/1202890446280569/f
   */
  const { data: propertyTypeSubgraph } = await graphApi.getPropertyTypesByQuery(
    user.accountId,
    {
      filter: {
        equal: [{ path: ["version"] }, { parameter: "latest" }],
      },
      graphResolveDepths: {
        ...zeroedGraphResolveDepths,
        constrainsValuesOn,
        constrainsPropertiesOn,
      },
      temporalAxes: currentTimeInstantTemporalAxes,
    },
  );

  return propertyTypeSubgraph as Subgraph<PropertyTypeRootType>;
};

export const getPropertyTypeResolver: ResolverFn<
  Promise<Subgraph>,
  {},
  GraphQLContext,
  QueryGetPropertyTypeArgs
> = async (
  _,
  { propertyTypeId, constrainsValuesOn, constrainsPropertiesOn },
  { dataSources, user },
  __,
) =>
  getPropertyTypeSubgraphById(
    dataSourcesToImpureGraphContext(dataSources),
    { actorId: user?.accountId ?? publicUserAccountId },
    {
      propertyTypeId,
      actorId: user?.accountId,
      graphResolveDepths: {
        ...zeroedGraphResolveDepths,
        constrainsValuesOn,
        constrainsPropertiesOn,
      },
      temporalAxes: currentTimeInstantTemporalAxes,
    },
  );

export const updatePropertyTypeResolver: ResolverFn<
  Promise<PropertyTypeWithMetadata>,
  {},
  LoggedInGraphQLContext,
  MutationUpdatePropertyTypeArgs
> = async (_, params, { dataSources, user }) =>
  updatePropertyType(
    dataSourcesToImpureGraphContext(dataSources),
    { actorId: user.accountId },
    {
      propertyTypeId: params.propertyTypeId,
      schema: params.updatedPropertyType,
    },
  );

export const archivePropertyTypeResolver: ResolverFn<
  Promise<OntologyTemporalMetadata>,
  {},
  LoggedInGraphQLContext,
  MutationArchivePropertyTypeArgs
> = async (_, params, { dataSources, user }) =>
  archivePropertyType(dataSources, { actorId: user.accountId }, params);

export const unarchivePropertyTypeResolver: ResolverFn<
  Promise<OntologyTemporalMetadata>,
  {},
  LoggedInGraphQLContext,
  MutationUnarchivePropertyTypeArgs
> = async (_, params, { dataSources, user }) =>
  unarchivePropertyType(dataSources, { actorId: user.accountId }, params);
