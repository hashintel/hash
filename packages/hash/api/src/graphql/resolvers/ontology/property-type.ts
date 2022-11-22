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
import { PropertyTypeModel } from "../../../model";

export const createPropertyType: ResolverFn<
  Promise<PropertyTypeWithMetadata>,
  {},
  LoggedInGraphQLContext,
  MutationCreatePropertyTypeArgs
> = async (_, params, { dataSources, userModel }) => {
  const { graphApi } = dataSources;
  const { ownedById, propertyType } = params;

  const createdPropertyTypeModel = await PropertyTypeModel.create(graphApi, {
    ownedById: ownedById ?? userModel.getEntityUuid(),
    schema: propertyType,
    actorId: userModel.getEntityUuid(),
  }).catch((err) => {
    throw new ApolloError(err, "CREATION_ERROR");
  });

  return createdPropertyTypeModel.propertyType;
};

export const getAllLatestPropertyTypes: ResolverFn<
  Promise<Subgraph>,
  {},
  LoggedInGraphQLContext,
  QueryGetAllLatestPropertyTypesArgs
> = async (
  _,
  { dataTypeResolveDepth, propertyTypeResolveDepth },
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
        dataTypeResolveDepth,
        propertyTypeResolveDepth,
        entityTypeResolveDepth: 0,
        entityResolveDepth: 0,
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

export const getPropertyType: ResolverFn<
  Promise<Subgraph>,
  {},
  LoggedInGraphQLContext,
  QueryGetPropertyTypeArgs
> = async (
  _,
  { propertyTypeId, dataTypeResolveDepth, propertyTypeResolveDepth },
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
        dataTypeResolveDepth,
        propertyTypeResolveDepth,
        entityTypeResolveDepth: 0,
        entityResolveDepth: 0,
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

export const updatePropertyType: ResolverFn<
  Promise<PropertyTypeWithMetadata>,
  {},
  LoggedInGraphQLContext,
  MutationUpdatePropertyTypeArgs
> = async (_, params, { dataSources, userModel }) => {
  const { graphApi } = dataSources;
  const { propertyTypeId, updatedPropertyType } = params;

  const propertyTypeModel = await PropertyTypeModel.get(graphApi, {
    propertyTypeId,
  }).catch((err: AxiosError) => {
    throw new ApolloError(
      `Unable to retrieve property type. ${err.response?.data} [URI=${propertyTypeId}]`,
      "GET_ERROR",
    );
  });

  const updatedPropertyTypeModel = await propertyTypeModel
    .update(graphApi, {
      schema: updatedPropertyType,
      actorId: userModel.getEntityUuid(),
    })
    .catch((err: AxiosError) => {
      const msg =
        err.response?.status === 409
          ? `Property type URI doesn't exist, unable to update. [URI=${propertyTypeId}]`
          : `Couldn't update property type.`;

      throw new ApolloError(msg, "CREATION_ERROR");
    });

  return updatedPropertyTypeModel.propertyType;
};
