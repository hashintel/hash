import { ApolloError } from "apollo-server-express";
import { AxiosError } from "axios";

import {
  PersistedPropertyType,
  MutationCreatePropertyTypeArgs,
  MutationUpdatePropertyTypeArgs,
  QueryGetPropertyTypeArgs,
  Resolver,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { PropertyTypeModel } from "../../../model";
import { nilUuid } from "../../../model/util";
import { propertyTypeModelToGQL } from "./model-mapping";

export const createPropertyType: Resolver<
  Promise<PersistedPropertyType>,
  {},
  GraphQLContext,
  MutationCreatePropertyTypeArgs
> = async (_, params, { dataSources }) => {
  const { graphApi } = dataSources;
  const { accountId, propertyType } = params;

  const createdPropertyTypeModel = await PropertyTypeModel.create(graphApi, {
    accountId,
    schema: propertyType,
  }).catch((err: AxiosError) => {
    if (err.response?.status === 409) {
      throw new ApolloError(
        `Property type with the same URI already exists. [URI=${propertyType.$id}]`,
        "CREATION_ERROR",
      );
    }

    throw new ApolloError(`Couldn't create property type.`, "CREATION_ERROR");
  });

  return propertyTypeModelToGQL(createdPropertyTypeModel);
};

export const getAllLatestPropertyTypes: Resolver<
  Promise<PersistedPropertyType[]>,
  {},
  GraphQLContext,
  {}
> = async (_, __, { dataSources }) => {
  const { graphApi } = dataSources;

  const allLatestPropertyTypeModels = await PropertyTypeModel.getAllLatest(
    graphApi,
    {
      /** @todo Replace with User from the request */
      accountId: nilUuid,
    },
  ).catch((err: AxiosError) => {
    throw new ApolloError(
      `Unable to retrieve all latest property types. ${err.response?.data}`,
      "GET_ALL_ERROR",
    );
  });

  return allLatestPropertyTypeModels.map((propertyTypeModel) =>
    propertyTypeModelToGQL(propertyTypeModel),
  );
};

export const getPropertyType: Resolver<
  Promise<PersistedPropertyType>,
  {},
  GraphQLContext,
  QueryGetPropertyTypeArgs
> = async (_, { propertyTypeVersionedUri }, { dataSources }) => {
  const { graphApi } = dataSources;

  const propertyTypeModel = await PropertyTypeModel.get(graphApi, {
    versionedUri: propertyTypeVersionedUri,
  }).catch((err: AxiosError) => {
    throw new ApolloError(
      `Unable to retrieve property type. ${err.response?.data}`,
      "GET_ERROR",
    );
  });

  return propertyTypeModelToGQL(propertyTypeModel);
};

export const updatePropertyType: Resolver<
  Promise<PersistedPropertyType>,
  {},
  GraphQLContext,
  MutationUpdatePropertyTypeArgs
> = async (_, params, { dataSources }) => {
  const { graphApi } = dataSources;
  const { accountId, propertyTypeVersionedUri, updatedPropertyType } = params;

  const propertyTypeModel = await PropertyTypeModel.get(graphApi, {
    versionedUri: propertyTypeVersionedUri,
  }).catch((err: AxiosError) => {
    throw new ApolloError(
      `Unable to retrieve property type. ${err.response?.data} [URI=${propertyTypeVersionedUri}]`,
      "GET_ERROR",
    );
  });

  const updatedPropertyTypeModel = await propertyTypeModel
    .update(graphApi, {
      accountId,
      schema: updatedPropertyType,
    })
    .catch((err: AxiosError) => {
      if (err.response?.status === 409) {
        throw new ApolloError(
          `Property type URI doesn't exist, unable to update. [URI=${propertyTypeVersionedUri}]`,
          "CREATION_ERROR",
        );
      }
      throw new ApolloError(`Couldn't update property type.`, "CREATION_ERROR");
    });

  return propertyTypeModelToGQL(updatedPropertyTypeModel);
};
