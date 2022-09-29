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
import { mapLinkTypeModelToGQL } from "./model-mapping";

export const createLinkType: ResolverFn<
  Promise<PersistedLinkType>,
  {},
  LoggedInGraphQLContext,
  MutationCreateLinkTypeArgs
> = async (_, params, { dataSources, user }) => {
  const { graphApi } = dataSources;
  const { ownedById, linkType } = params;

  const createdLinkTypeModel = await LinkTypeModel.create(graphApi, {
    ownedById: ownedById ?? user.entityId,
    schema: linkType,
  }).catch((err) => {
    throw new ApolloError(err, "CREATION_ERROR");
  });

  return mapLinkTypeModelToGQL(createdLinkTypeModel);
};

export const getAllLatestLinkTypes: ResolverFn<
  Promise<PersistedLinkType[]>,
  {},
  LoggedInGraphQLContext,
  {}
> = async (_, __, { dataSources }) => {
  const { graphApi } = dataSources;

  const allLatestLinkTypeModels = await LinkTypeModel.getAllLatest(
    graphApi,
  ).catch((err: AxiosError) => {
    throw new ApolloError(
      `Unable to retrieve all latest link types. ${err.response?.data}`,
      "GET_ALL_ERROR",
    );
  });

  return allLatestLinkTypeModels.map((linkTypeModel) =>
    mapLinkTypeModelToGQL(linkTypeModel),
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
    linkTypeId: linkTypeVersionedUri,
  }).catch((err: AxiosError) => {
    throw new ApolloError(
      `Unable to retrieve link type. ${err.response?.data} [URI=${linkTypeVersionedUri}]`,
      "GET_ERROR",
    );
  });

  return mapLinkTypeModelToGQL(linkTypeModel);
};

export const updateLinkType: ResolverFn<
  Promise<PersistedLinkType>,
  {},
  LoggedInGraphQLContext,
  MutationUpdateLinkTypeArgs
> = async (_, params, { dataSources }) => {
  const { graphApi } = dataSources;
  const { linkTypeVersionedUri, updatedLinkType } = params;

  const linkTypeModel = await LinkTypeModel.get(graphApi, {
    linkTypeId: linkTypeVersionedUri,
  }).catch((err: AxiosError) => {
    throw new ApolloError(
      `Unable to retrieve link type. ${err.response?.data} [URI=${linkTypeVersionedUri}]`,
      "GET_ERROR",
    );
  });

  const updatedLinkTypeModel = await linkTypeModel
    .update(graphApi, {
      schema: updatedLinkType,
    })
    .catch((err: AxiosError) => {
      const msg =
        err.response?.status === 409
          ? `Link type URI doesn't exist, unable to update. [URI=${linkTypeVersionedUri}]`
          : `Couldn't update link type.`;

      throw new ApolloError(msg, "CREATION_ERROR");
    });

  return mapLinkTypeModelToGQL(updatedLinkTypeModel);
};
