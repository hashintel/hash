import {
  OwnedById,
  PropertyTypeRootType,
  PropertyTypeWithMetadata,
  Subgraph,
} from "@local/hash-subgraph";

import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "../../../graph";
import {
  createPropertyType,
  getPropertyTypeSubgraphById,
  updatePropertyType,
} from "../../../graph/ontology/primitive/property-type";
import {
  MutationCreatePropertyTypeArgs,
  MutationUpdatePropertyTypeArgs,
  QueryGetPropertyTypeArgs,
  QueryQueryPropertyTypesArgs,
  ResolverFn,
} from "../../api-types.gen";
import { LoggedInGraphQLContext } from "../../context";
import { dataSourcesToImpureGraphContext } from "../util";

export const createPropertyTypeResolver: ResolverFn<
  Promise<PropertyTypeWithMetadata>,
  {},
  LoggedInGraphQLContext,
  MutationCreatePropertyTypeArgs
> = async (_, params, { dataSources, user }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const { ownedById, propertyType } = params;

  const createdPropertyType = await createPropertyType(context, {
    ownedById: (ownedById ?? user.accountId) as OwnedById,
    schema: propertyType,
    actorId: user.accountId,
  });

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
  { dataSources },
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
  LoggedInGraphQLContext,
  QueryGetPropertyTypeArgs
> = async (
  _,
  { propertyTypeId, constrainsValuesOn, constrainsPropertiesOn },
  { dataSources, user },
  __,
) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  return await getPropertyTypeSubgraphById(context, {
    graphResolveDepths: {
      ...zeroedGraphResolveDepths,
      constrainsValuesOn,
      constrainsPropertiesOn,
    },
    temporalAxes: currentTimeInstantTemporalAxes,
    propertyTypeId,
    actorId: user.accountId,
  });
};

export const updatePropertyTypeResolver: ResolverFn<
  Promise<PropertyTypeWithMetadata>,
  {},
  LoggedInGraphQLContext,
  MutationUpdatePropertyTypeArgs
> = async (_, params, { dataSources, user }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const { propertyTypeId, updatedPropertyType: updatedPropertyTypeSchema } =
    params;

  const updatedPropertyType = await updatePropertyType(context, {
    propertyTypeId,
    schema: updatedPropertyTypeSchema,
    actorId: user.accountId,
  });

  return updatedPropertyType;
};
