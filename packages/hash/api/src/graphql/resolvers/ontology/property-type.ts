import { OwnedById } from "@hashintel/hash-shared/types";
import { PropertyTypeWithMetadata, Subgraph } from "@hashintel/hash-subgraph";

import {
  createPropertyType,
  updatePropertyType,
} from "../../../graph/ontology/primitive/property-type";
import {
  MutationCreatePropertyTypeArgs,
  MutationUpdatePropertyTypeArgs,
  QueryGetAllLatestPropertyTypesArgs,
  QueryGetPropertyTypeArgs,
  ResolverFn,
} from "../../api-types.gen";
import { LoggedInGraphQLContext } from "../../context";

export const createPropertyTypeResolver: ResolverFn<
  Promise<PropertyTypeWithMetadata>,
  {},
  LoggedInGraphQLContext,
  MutationCreatePropertyTypeArgs
> = async (_, params, { dataSources, user }) => {
  const { graphApi } = dataSources;
  const { ownedById, propertyType } = params;

  const createdPropertyType = await createPropertyType(
    { graphApi },
    {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
      ownedById: (ownedById as OwnedById) ?? user.accountId,
      schema: propertyType,
      actorId: user.accountId,
    },
  );

  return createdPropertyType;
};

export const getAllLatestPropertyTypesResolver: ResolverFn<
  Promise<Subgraph>,
  {},
  LoggedInGraphQLContext,
  QueryGetAllLatestPropertyTypesArgs
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
        inheritsFrom: { outgoing: 0 },
        constrainsValuesOn,
        constrainsPropertiesOn,
        constrainsLinksOn: { outgoing: 0 },
        constrainsLinkDestinationsOn: { outgoing: 0 },
        isOfType: { outgoing: 0 },
        hasLeftEntity: { incoming: 0, outgoing: 0 },
        hasRightEntity: { incoming: 0, outgoing: 0 },
      },
    },
  );
  return propertyTypeSubgraph as Subgraph;
};

export const getPropertyTypeResolver: ResolverFn<
  Promise<Subgraph>,
  {},
  LoggedInGraphQLContext,
  QueryGetPropertyTypeArgs
> = async (
  _,
  { propertyTypeId, constrainsValuesOn, constrainsPropertiesOn },
  { dataSources },
  __,
) => {
  const { graphApi } = dataSources;

  const { data: propertyTypeSubgraph } = await graphApi.getPropertyTypesByQuery(
    {
      filter: {
        equal: [{ path: ["versionedUri"] }, { parameter: propertyTypeId }],
      },
      graphResolveDepths: {
        inheritsFrom: { outgoing: 0 },
        constrainsValuesOn,
        constrainsPropertiesOn,
        constrainsLinksOn: { outgoing: 0 },
        constrainsLinkDestinationsOn: { outgoing: 0 },
        isOfType: { outgoing: 0 },
        hasLeftEntity: { incoming: 0, outgoing: 0 },
        hasRightEntity: { incoming: 0, outgoing: 0 },
      },
    },
  );

  return propertyTypeSubgraph as Subgraph;
};

export const updatePropertyTypeResolver: ResolverFn<
  Promise<PropertyTypeWithMetadata>,
  {},
  LoggedInGraphQLContext,
  MutationUpdatePropertyTypeArgs
> = async (_, params, { dataSources, user }) => {
  const { graphApi } = dataSources;
  const { propertyTypeId, updatedPropertyType: updatedPropertyTypeSchema } =
    params;

  const updatedPropertyType = await updatePropertyType(
    { graphApi },
    {
      propertyTypeId,
      schema: updatedPropertyTypeSchema,
      actorId: user.accountId,
    },
  );

  return updatedPropertyType;
};
