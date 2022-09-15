import { ApolloError } from "apollo-server-express";
import { AxiosError } from "axios";

import {
  PersistedPropertyType,
  MutationCreatePropertyTypeArgs,
  MutationUpdatePropertyTypeArgs,
  QueryGetPropertyTypeArgs,
  ResolverFn,
  PropertyTypeRootedSubgraph,
} from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { PropertyTypeModel } from "../../../model";
import {
  propertyTypeModelToGQL,
  propertyTypeRootedSubgraphToGQL,
} from "./model-mapping";
import { dataTypeQueryDepth, propertyTypeQueryDepth } from "../util";

export const createPropertyType: ResolverFn<
  Promise<PersistedPropertyType>,
  {},
  LoggedInGraphQLContext,
  MutationCreatePropertyTypeArgs
> = async (_, params, { dataSources, user }) => {
  const { graphApi } = dataSources;
  const { accountId, propertyType } = params;

  const createdPropertyTypeModel = await PropertyTypeModel.create(graphApi, {
    accountId: accountId ?? user.entityId,
    schema: propertyType,
  }).catch((err) => {
    throw new ApolloError(err, "CREATION_ERROR");
  });

  return propertyTypeModelToGQL(createdPropertyTypeModel);
};

export const getAllLatestPropertyTypes: ResolverFn<
  Promise<PropertyTypeRootedSubgraph[]>,
  {},
  LoggedInGraphQLContext,
  {}
> = async (_, __, { dataSources, user }, info) => {
  const { graphApi } = dataSources;

  const propertyTypeRootedSubgraphs =
    await PropertyTypeModel.getAllLatestResolved(graphApi, {
      accountId: user.entityId,
      dataTypeQueryDepth: dataTypeQueryDepth(info),
      propertyTypeQueryDepth: propertyTypeQueryDepth(info),
    }).catch((err: AxiosError) => {
      throw new ApolloError(
        `Unable to retrieve all latest property types. ${err.response?.data}`,
        "GET_ALL_ERROR",
      );
    });

  return propertyTypeRootedSubgraphs.map(propertyTypeRootedSubgraphToGQL);
};

export const getPropertyType: ResolverFn<
  Promise<PropertyTypeRootedSubgraph>,
  {},
  LoggedInGraphQLContext,
  QueryGetPropertyTypeArgs
> = async (_, { propertyTypeVersionedUri }, { dataSources }, info) => {
  const { graphApi } = dataSources;

  const propertyTypeRootedSubgraph = await PropertyTypeModel.getResolved(
    graphApi,
    {
      versionedUri: propertyTypeVersionedUri,
      dataTypeQueryDepth: dataTypeQueryDepth(info),
      propertyTypeQueryDepth: propertyTypeQueryDepth(info),
    },
  ).catch((err: AxiosError) => {
    throw new ApolloError(
      `Unable to retrieve property type. ${err.response?.data}`,
      "GET_ERROR",
    );
  });

  return propertyTypeRootedSubgraphToGQL(propertyTypeRootedSubgraph);
};

export const updatePropertyType: ResolverFn<
  Promise<PersistedPropertyType>,
  {},
  LoggedInGraphQLContext,
  MutationUpdatePropertyTypeArgs
> = async (_, params, { dataSources, user }) => {
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
      accountId: accountId ?? user.entityId,
      schema: updatedPropertyType,
    })
    .catch((err: AxiosError) => {
      const msg =
        err.response?.status === 409
          ? `Property type URI doesn't exist, unable to update. [URI=${propertyTypeVersionedUri}]`
          : `Couldn't update property type.`;

      throw new ApolloError(msg, "CREATION_ERROR");
    });

  return propertyTypeModelToGQL(updatedPropertyTypeModel);
};
