import { ApolloError } from "apollo-server-express";
import { AxiosError } from "axios";
import { PropertyTypeWithMetadata, Subgraph } from "@hashintel/hash-subgraph";

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
  getPropertyType,
  updatePropertyType,
} from "../../../graph/ontology/primitive/property-type";

export const createPropertyTypeResolver: ResolverFn<
  Promise<PropertyTypeWithMetadata>,
  {},
  LoggedInGraphQLContext,
  MutationCreatePropertyTypeArgs
> = async (_, params, { dataSources, userModel }) => {
  const { graphApi } = dataSources;
  const { ownedById, propertyType } = params;

  const createdPropertyType = await createPropertyType(
    { graphApi },
    {
      ownedById: ownedById ?? userModel.getEntityUuid(),
      schema: propertyType,
      actorId: userModel.getEntityUuid(),
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
    .catch((err: AxiosError) => {
      throw new ApolloError(
        `Unable to retrieve all latest property types. ${err.response?.data}`,
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
    .catch((err: AxiosError) => {
      throw new ApolloError(
        `Unable to retrieve property type [${propertyTypeId}]: ${err.response?.data}`,
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
> = async (_, params, { dataSources, userModel }) => {
  const { graphApi } = dataSources;
  const { propertyTypeId, updatedPropertyType: updatedPropertyTypeSchema } =
    params;

  const propertyType = await getPropertyType(
    { graphApi },
    {
      propertyTypeId,
    },
  ).catch((err: AxiosError) => {
    throw new ApolloError(
      `Unable to retrieve property type. ${err.response?.data} [URI=${propertyTypeId}]`,
      "GET_ERROR",
    );
  });

  const updatedPropertyType = await updatePropertyType(
    { graphApi },
    {
      propertyTypeId: propertyType.schema.$id,
      schema: updatedPropertyTypeSchema,
      actorId: userModel.getEntityUuid(),
    },
  ).catch((err: AxiosError) => {
    const msg =
      err.response?.status === 409
        ? `Property type URI doesn't exist, unable to update. [URI=${propertyTypeId}]`
        : `Couldn't update property type.`;

    throw new ApolloError(msg, "CREATION_ERROR");
  });

  return updatedPropertyType;
};
