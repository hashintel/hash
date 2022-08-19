import { ApolloError } from "apollo-server-express";
import { AxiosError } from "axios";

import {
  PersistedLinkType,
  MutationCreateLinkTypeArgs,
  MutationUpdateLinkTypeArgs,
  QueryGetLinkTypeArgs,
  ResolverFn,
} from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { LinkTypeModel } from "../../../model";
import { linkTypeModelToGQL } from "./model-mapping";

export const createLinkType: ResolverFn<
  Promise<PersistedLinkType>,
  {},
  LoggedInGraphQLContext,
  MutationCreateLinkTypeArgs
> = async (_, params, { dataSources, user }) => {
  const { graphApi } = dataSources;
  const { accountId, linkType } = params;

  const createdLinkTypeModel = await LinkTypeModel.create(graphApi, {
    accountId: accountId ?? user.getAccountId(),
    schema: linkType,
  }).catch((err: AxiosError) => {
    const msg =
      err.response?.status === 409
        ? `Link type with the same URI already exists. [URI=${linkType.$id}]`
        : `Couldn't create link type.`;

    throw new ApolloError(msg, "CREATION_ERROR");
  });

  return linkTypeModelToGQL(createdLinkTypeModel);
};

export const getAllLatestLinkTypes: ResolverFn<
  Promise<PersistedLinkType[]>,
  {},
  LoggedInGraphQLContext,
  {}
> = async (_, __, { dataSources, user }) => {
  const { graphApi } = dataSources;

  const allLatestLinkTypeModels = await LinkTypeModel.getAllLatest(graphApi, {
    accountId: user.getAccountId(),
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

export const getLinkType: ResolverFn<
  Promise<PersistedLinkType>,
  {},
  LoggedInGraphQLContext,
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

export const updateLinkType: ResolverFn<
  Promise<PersistedLinkType>,
  {},
  LoggedInGraphQLContext,
  MutationUpdateLinkTypeArgs
> = async (_, params, { dataSources, user }) => {
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
      accountId: accountId ?? user.getAccountId(),
      schema: newLinkType,
    })
    .catch((err: AxiosError) => {
      const msg =
        err.response?.status === 409
          ? `Link type URI doesn't exist, unable to update. [URI=${linkTypeVersionedUri}]`
          : `Couldn't update link type.`;

      throw new ApolloError(msg, "CREATION_ERROR");
    });

  return linkTypeModelToGQL(updatedLinkTypeModel);
};
