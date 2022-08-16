import { ApolloError } from "apollo-server-express";
import { AxiosError } from "axios";

import {
  PersistedEntityType,
  MutationCreateEntityTypeArgs,
  MutationUpdateEntityTypeArgs,
  QueryGetEntityTypeArgs,
  Resolver,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { EntityTypeModel } from "../../../model";
import { nilUuid } from "../../../model/util";
import { entityTypeModelToGQL } from "./model-mapping";

export const createEntityType: Resolver<
  Promise<PersistedEntityType>,
  {},
  GraphQLContext,
  MutationCreateEntityTypeArgs
> = async (_, params, { dataSources }) => {
  const { graphApi } = dataSources;
  const { accountId, entityType } = params;

  const createdEntityTypeModel = await EntityTypeModel.create(graphApi, {
    accountId,
    schema: entityType,
  }).catch((err: AxiosError) => {
    if (err.response?.status === 409) {
      throw new ApolloError(
        `Entity type with the same URI already exists. [URI=${entityType.$id}]`,
        "CREATION_ERROR",
      );
    }

    throw new ApolloError(`Couldn't create entity type.`, "CREATION_ERROR");
  });

  return entityTypeModelToGQL(createdEntityTypeModel);
};

export const getAllLatestEntityTypes: Resolver<
  Promise<PersistedEntityType[]>,
  {},
  GraphQLContext,
  {}
> = async (_, __, { dataSources }) => {
  const { graphApi } = dataSources;

  const allLatestEntityTypeModels = await EntityTypeModel.getAllLatest(
    graphApi,
    {
      /** @todo Replace with User from the request */
      accountId: nilUuid,
    },
  ).catch((err: AxiosError) => {
    throw new ApolloError(
      `Unable to retrieve all latest entity types. ${err.response?.data}`,
      "GET_ALL_ERROR",
    );
  });

  return allLatestEntityTypeModels.map((entityTypeModel) =>
    entityTypeModelToGQL(entityTypeModel),
  );
};

export const getEntityType: Resolver<
  Promise<PersistedEntityType>,
  {},
  GraphQLContext,
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

export const updateEntityType: Resolver<
  Promise<PersistedEntityType>,
  {},
  GraphQLContext,
  MutationUpdateEntityTypeArgs
> = async (_, params, { dataSources }) => {
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
      accountId,
      schema: updatedEntityType,
    })
    .catch((err: AxiosError) => {
      if (err.response?.status === 409) {
        throw new ApolloError(
          `Entity type URI doesn't exist, unable to update. [URI=${entityTypeVersionedUri}]`,
          "CREATION_ERROR",
        );
      }
      throw new ApolloError(`Couldn't update entity type.`, "CREATION_ERROR");
    });

  return entityTypeModelToGQL(updatedEntityTypeModel);
};
