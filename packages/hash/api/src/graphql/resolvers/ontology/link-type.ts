import { ApolloError } from "apollo-server-express";
import { AxiosError } from "axios";

import {
  PersistedLinkType,
  MutationCreateLinkTypeArgs,
  MutationUpdateLinkTypeArgs,
  QueryGetLinkTypeArgs,
  Resolver,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { LinkTypeModel } from "../../../model";
import { nilUuid } from "../../../model/util";
import { linkTypeModelToGQL } from "./model-mapping";

export const createLinkType: Resolver<
  Promise<PersistedLinkType>,
  {},
  GraphQLContext,
  MutationCreateLinkTypeArgs
> = async (_, params, { dataSources }) => {
  const { graphApi } = dataSources;
  const { accountId, linkType } = params;

  const createdLinkTypeModel = await LinkTypeModel.create(graphApi, {
    accountId,
    schema: linkType,
  }).catch((err: AxiosError) => {
    if (err.response?.status === 409) {
      throw new ApolloError(
        `Link type with the same URI already exists. [URI=${linkType.$id}]`,
        "CREATION_ERROR",
      );
    }
    throw new ApolloError(`Couldn't create link type`, "CREATION_ERROR");
  });

  return linkTypeModelToGQL(createdLinkTypeModel);
};

export const getAllLatestLinkTypes: Resolver<
  Promise<PersistedLinkType[]>,
  {},
  GraphQLContext,
  {}
> = async (_, __, { dataSources }) => {
  const { graphApi } = dataSources;

  const allLatestLinkTypeModels = await LinkTypeModel.getAllLatest(graphApi, {
    /** @todo Replace with User from the request */
    accountId: nilUuid,
  }).catch((err: AxiosError) => {
    throw new ApolloError(
      `Unable to retrieve all latest link types. ${err.response?.data}`,
      "GET_ALL_ERROR",
    );
  });

  return allLatestLinkTypeModels.map((linkTypeModel) =>
    linkTypeModelToGQL(linkTypeModel),
  );
};

export const getLinkType: Resolver<
  Promise<PersistedLinkType>,
  {},
  GraphQLContext,
  QueryGetLinkTypeArgs
> = async (_, { linkTypeVersionedUri }, { dataSources }) => {
  const { graphApi } = dataSources;

  const linkTypeModel = await LinkTypeModel.get(graphApi, {
    versionedUri: linkTypeVersionedUri,
  }).catch((err: AxiosError) => {
    throw new ApolloError(
      `Unable to retrieve link type. ${err.response?.data} [URI=${linkTypeVersionedUri}]`,
      "GET_ERROR",
    );
  });

  return linkTypeModelToGQL(linkTypeModel);
};

export const updateLinkType: Resolver<
  Promise<PersistedLinkType>,
  {},
  GraphQLContext,
  MutationUpdateLinkTypeArgs
> = async (_, params, { dataSources }) => {
  const { graphApi } = dataSources;
  const { accountId, linkTypeVersionedUri, newLinkType } = params;

  const linkTypeModel = await LinkTypeModel.get(graphApi, {
    versionedUri: linkTypeVersionedUri,
  }).catch((err: AxiosError) => {
    throw new ApolloError(
      `Unable to retrieve link type. ${err.response?.data} [URI=${linkTypeVersionedUri}]`,
      "GET_ERROR",
    );
  });

  const updatedLinkTypeModel = await linkTypeModel
    .update(graphApi, {
      accountId,
      schema: newLinkType,
    })
    .catch((err: AxiosError) => {
      if (err.response?.status === 409) {
        throw new ApolloError(
          `Link type URI doesn't exist, unable to update. [URI=${linkTypeVersionedUri}]`,
          "CREATION_ERROR",
        );
      }
      throw new ApolloError(`Couldn't update link type.`, "CREATION_ERROR");
    });

  return linkTypeModelToGQL(updatedLinkTypeModel);
};
