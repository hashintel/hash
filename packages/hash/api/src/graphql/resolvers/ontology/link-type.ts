import { ApolloError } from "apollo-server-express";
import { AxiosError } from "axios";
import { LinkType } from "@hashintel/hash-graph-client";

import {
  IdentifiedLinkType,
  MutationCreateLinkTypeArgs,
  MutationUpdateLinkTypeArgs,
  QueryGetLinkTypeArgs,
  Resolver,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { LinkTypeModel } from "../../../model";
import { NIL_UUID } from "../../../model/util";

export const createLinkType: Resolver<
  Promise<IdentifiedLinkType>,
  {},
  GraphQLContext,
  MutationCreateLinkTypeArgs
> = async (_, params, { dataSources }) => {
  const { graphApi } = dataSources;
  const { accountId } = params;
  const linkType = params.linkType as LinkType;

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

  return {
    createdBy: accountId,
    linkTypeVersionedUri: createdLinkTypeModel.schema.$id,
    schema: createdLinkTypeModel.schema,
  };
};

export const getAllLatestLinkTypes: Resolver<
  Promise<IdentifiedLinkType[]>,
  {},
  GraphQLContext,
  {}
> = async (_, __, { dataSources }) => {
  const { graphApi } = dataSources;

  const allLatestLinkTypeModels = await LinkTypeModel.getAllLatest(graphApi, {
    /** @todo Replace with User from the request */
    accountId: NIL_UUID,
  }).catch((err: AxiosError) => {
    throw new ApolloError(`${err.response?.data}`, "GET_ALL_ERROR");
  });

  return allLatestLinkTypeModels.map(
    (linkType) =>
      <IdentifiedLinkType>{
        createdBy: linkType.accountId,
        linkTypeVersionedUri: linkType.schema.$id,
        schema: linkType.schema,
      },
  );
};

export const getLinkType: Resolver<
  Promise<IdentifiedLinkType>,
  {},
  GraphQLContext,
  QueryGetLinkTypeArgs
> = async (_, { linkTypeVersionedUri }, { dataSources }) => {
  const { graphApi } = dataSources;

  const linkTypeModel = await LinkTypeModel.get(graphApi, {
    versionedUri: linkTypeVersionedUri,
  }).catch((err: AxiosError) => {
    throw new ApolloError(`${err.response?.data}`, "GET_ERROR");
  });

  return {
    createdBy: linkTypeModel.accountId,
    linkTypeVersionedUri: linkTypeModel.schema.$id,
    schema: linkTypeModel.schema,
  };
};

export const updateLinkType: Resolver<
  Promise<IdentifiedLinkType>,
  {},
  GraphQLContext,
  MutationUpdateLinkTypeArgs
> = async (_, params, { dataSources }) => {
  const { graphApi } = dataSources;
  const { accountId } = params;
  const linkType = params.linkType as LinkType;

  const linkTypeModel = await LinkTypeModel.get(graphApi, {
    versionedUri: linkType.$id,
  }).catch((err: AxiosError) => {
    throw new ApolloError(`${err.response?.data}`, "GET_ERROR");
  });

  const updatedLinkTypeModel = await linkTypeModel
    .update(graphApi, {
      accountId,
      schema: linkType,
    })
    .catch((err: AxiosError) => {
      if (err.response?.status === 409) {
        throw new ApolloError(
          `Link type URI doesn't exist, unable to update. [URI=${linkType.$id}]`,
          "CREATION_ERROR",
        );
      }
      throw new ApolloError(`Couldn't update link type.`, "CREATION_ERROR");
    });

  return {
    createdBy: updatedLinkTypeModel.accountId,
    linkTypeVersionedUri: updatedLinkTypeModel.schema.$id,
    schema: updatedLinkTypeModel.schema,
  };
};
