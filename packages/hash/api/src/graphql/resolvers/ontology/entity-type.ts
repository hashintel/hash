import { ApolloError } from "apollo-server-express";
import { AxiosError } from "axios";

import {
  PersistedEntityType,
  MutationCreateEntityTypeArgs,
  MutationUpdateEntityTypeArgs,
  QueryGetEntityTypeArgs,
  ResolverFn,
} from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { EntityTypeModel } from "../../../model";
import { entityTypeModelToGQL } from "./model-mapping";

export const createEntityType: ResolverFn<
  Promise<PersistedEntityType>,
  {},
  LoggedInGraphQLContext,
  MutationCreateEntityTypeArgs
> = async (_, params, { dataSources, user }) => {
  const { graphApi } = dataSources;
  const { accountId, entityType } = params;

  const createdEntityTypeModel = await EntityTypeModel.create(graphApi, {
    accountId: accountId ?? user.getAccountId(),
    schema: entityType,
  }).catch((err: AxiosError) => {
    const msg =
      err.response?.status === 409
        ? `Entity type with the same URI already exists. [URI=${entityType.$id}]`
        : `Couldn't create entity type.`;

    throw new ApolloError(msg, "CREATION_ERROR");
  });

  return entityTypeModelToGQL(createdEntityTypeModel);
};

export const getAllLatestEntityTypes: ResolverFn<
  Promise<PersistedEntityType[]>,
  {},
  LoggedInGraphQLContext,
  {}
> = async (_, __, { dataSources, user }) => {
  const { graphApi } = dataSources;

  const allLatestEntityTypeModels = await EntityTypeModel.getAllLatest(
    graphApi,
    {
      accountId: user.getAccountId(),
    },
  ).catch((err: AxiosError) => {
    throw new ApolloError(
      `Unable to retrieve all latest entity types. ${err.response?.data}`,
      "GET_ALL_ERROR",
    );
  });

  return allLatestEntityTypeModels.map(entityTypeModelToGQL);
};

export const getEntityType: ResolverFn<
  Promise<PersistedEntityType>,
  {},
  LoggedInGraphQLContext,
  QueryGetEntityTypeArgs
> = async (_, { entityTypeVersionedUri }, { dataSources }) => {
  const { graphApi } = dataSources;

  const entityTypeModel = await EntityTypeModel.get(graphApi, {
    versionedUri: entityTypeVersionedUri,
  }).catch((err: AxiosError) => {
    throw new ApolloError(
      `Unable to retrieve entity type. ${err.response?.data}`,
      "GET_ERROR",
    );
  });

  return entityTypeModelToGQL(entityTypeModel);
};

export const updateEntityType: ResolverFn<
  Promise<PersistedEntityType>,
  {},
  LoggedInGraphQLContext,
  MutationUpdateEntityTypeArgs
> = async (_, params, { dataSources, user }) => {
  const { graphApi } = dataSources;
  const { accountId, entityTypeVersionedUri, updatedEntityType } = params;

  const entityTypeModel = await EntityTypeModel.get(graphApi, {
    versionedUri: entityTypeVersionedUri,
  }).catch((err: AxiosError) => {
    throw new ApolloError(
      `Unable to retrieve entity type. ${err.response?.data} [URI=${entityTypeVersionedUri}]`,
      "GET_ERROR",
    );
  });

  const updatedEntityTypeModel = await entityTypeModel
    .update(graphApi, {
      accountId: accountId ?? user.getAccountId(),
      schema: updatedEntityType,
    })
    .catch((err: AxiosError) => {
      const msg =
        err.response?.status === 409
          ? `Entity type URI doesn't exist, unable to update. [URI=${entityTypeVersionedUri}]`
          : `Couldn't update entity type.`;

      throw new ApolloError(msg, "CREATION_ERROR");
    });

  return entityTypeModelToGQL(updatedEntityTypeModel);
};
