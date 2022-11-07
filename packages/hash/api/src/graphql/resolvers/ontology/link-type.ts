import { ApolloError } from "apollo-server-express";
import { AxiosError } from "axios";

import {
  PersistedLinkType,
  MutationCreateLinkTypeArgs,
  MutationUpdateLinkTypeArgs,
  QueryGetLinkTypeArgs,
  ResolverFn,
  Subgraph,
} from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { LinkTypeModel } from "../../../model";
import { mapLinkTypeModelToGQL, mapSubgraphToGql } from "./model-mapping";

export const createLinkType: ResolverFn<
  Promise<PersistedLinkType>,
  {},
  LoggedInGraphQLContext,
  MutationCreateLinkTypeArgs
> = async (_, params, { dataSources, userModel }) => {
  const { graphApi } = dataSources;
  const { ownedById, linkType } = params;

  const createdLinkTypeModel = await LinkTypeModel.create(graphApi, {
    ownedById: ownedById ?? userModel.entityId,
    schema: linkType,
    actorId: userModel.entityId,
  }).catch((err) => {
    throw new ApolloError(err, "CREATION_ERROR");
  });

  return mapLinkTypeModelToGQL(createdLinkTypeModel);
};

export const getAllLatestLinkTypes: ResolverFn<
  Promise<Subgraph>,
  {},
  LoggedInGraphQLContext,
  {}
> = async (_, __, { dataSources }) => {
  const { graphApi } = dataSources;

  const { data: linkTypeSubgraph } = await graphApi
    .getLinkTypesByQuery({
      filter: {
        equal: [{ path: ["version"] }, { parameter: "latest" }],
      },
      graphResolveDepths: {
        dataTypeResolveDepth: 0,
        propertyTypeResolveDepth: 0,
        entityTypeResolveDepth: 0,
        entityResolveDepth: 0,
      },
    })
    .catch((err: AxiosError) => {
      throw new ApolloError(
        `Unable to retrieve all latest link types. ${err.response?.data}`,
        "GET_ALL_ERROR",
      );
    });

  return mapSubgraphToGql(linkTypeSubgraph);
};

export const getLinkType: ResolverFn<
  Promise<Subgraph>,
  {},
  LoggedInGraphQLContext,
  QueryGetLinkTypeArgs
> = async (_, { linkTypeId }, { dataSources }) => {
  const { graphApi } = dataSources;

  const { data: linkTypeSubgraph } = await graphApi
    .getLinkTypesByQuery({
      filter: {
        equal: [{ path: ["versionedUri"] }, { parameter: linkTypeId }],
      },
      graphResolveDepths: {
        dataTypeResolveDepth: 0,
        propertyTypeResolveDepth: 0,
        entityTypeResolveDepth: 0,
        entityResolveDepth: 0,
      },
    })
    .catch((err: AxiosError) => {
      throw new ApolloError(
        `Unable to retrieve link type. ${err.response?.data}`,
        "GET_ALL_ERROR",
      );
    });

  return mapSubgraphToGql(linkTypeSubgraph);
};

export const updateLinkType: ResolverFn<
  Promise<PersistedLinkType>,
  {},
  LoggedInGraphQLContext,
  MutationUpdateLinkTypeArgs
> = async (_, params, { dataSources, userModel }) => {
  const { graphApi } = dataSources;
  const { linkTypeId, updatedLinkType } = params;

  const linkTypeModel = await LinkTypeModel.get(graphApi, {
    linkTypeId,
  }).catch((err: AxiosError) => {
    throw new ApolloError(
      `Unable to retrieve link type. ${err.response?.data} [URI=${linkTypeId}]`,
      "GET_ERROR",
    );
  });

  const updatedLinkTypeModel = await linkTypeModel
    .update(graphApi, {
      schema: updatedLinkType,
      actorId: userModel.entityId,
    })
    .catch((err: AxiosError) => {
      const msg =
        err.response?.status === 409
          ? `Link type URI doesn't exist, unable to update. [URI=${linkTypeId}]`
          : `Couldn't update link type.`;

      throw new ApolloError(msg, "CREATION_ERROR");
    });

  return mapLinkTypeModelToGQL(updatedLinkTypeModel);
};
