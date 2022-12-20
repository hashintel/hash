import { ApolloError } from "apollo-server-express";
import { PropertyTypeWithMetadata, Subgraph } from "@hashintel/hash-subgraph";
import { OwnedById } from "@hashintel/hash-shared/types";

import {
  MutationCreatePropertyTypeArgs,
  MutationUpdatePropertyTypeArgs,
  QueryGetPropertyTypeArgs,
  QueryGetAllLatestPropertyTypesArgs,
  ResolverFn,
} from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import {
  createPropertyType,
  updatePropertyType,
} from "../../../graph/ontology/primitive/property-type";
import { GraphApiError } from "../../../graph";

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
  ).catch((err) => {
    throw new ApolloError(err, "CREATION_ERROR");
  });

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
  const { data: propertyTypeSubgraph } = await graphApi
    .getPropertyTypesByQuery({
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
    })
    .catch(({ payload }: GraphApiError) => {
      throw new ApolloError(
        `Unable to retrieve all latest property types. ${payload}`,
        "GET_ALL_ERROR",
      );
    });

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

  const { data: propertyTypeSubgraph } = await graphApi
    .getPropertyTypesByQuery({
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
    })
    .catch(({ payload }: GraphApiError) => {
      throw new ApolloError(
        `Unable to retrieve property type [${propertyTypeId}]: ${payload}`,
        "GET_ERROR",
      );
    });

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
  ).catch(({ status }: GraphApiError) => {
    const msg =
      status === 409
        ? `Property type URI doesn't exist, unable to update. [URI=${propertyTypeId}]`
        : `Couldn't update property type.`;

    throw new ApolloError(msg, "CREATION_ERROR");
  });

  return updatedPropertyType;
};
