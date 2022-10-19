import { ApolloError } from "apollo-server-express";
import { AxiosError } from "axios";

import {
  PersistedEntityType,
  MutationCreateEntityTypeArgs,
  MutationUpdateEntityTypeArgs,
  QueryGetEntityTypeArgs,
  ResolverFn,
  Subgraph,
} from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { EntityTypeModel } from "../../../model";
import { mapEntityTypeModelToGQL, mapSubgraphToGql } from "./model-mapping";
import {
  dataTypeQueryDepth,
  entityTypeQueryDepth,
  linkTypeQueryDepth,
  propertyTypeQueryDepth,
} from "../util";

export const createEntityType: ResolverFn<
  Promise<PersistedEntityType>,
  {},
  LoggedInGraphQLContext,
  MutationCreateEntityTypeArgs
> = async (_, params, { dataSources, user }) => {
  const { graphApi } = dataSources;
  const { ownedById, entityType } = params;

  const createdEntityTypeModel = await EntityTypeModel.create(graphApi, {
    ownedById: ownedById ?? user.entityId,
    schema: entityType,
  }).catch((err) => {
    throw new ApolloError(err, "CREATION_ERROR");
  });

  return mapEntityTypeModelToGQL(createdEntityTypeModel);
};

export const getAllLatestEntityTypes: ResolverFn<
  Promise<Subgraph>,
  {},
  LoggedInGraphQLContext,
  {}
> = async (_, __, { dataSources }, info) => {
  const { graphApi } = dataSources;

  const { data: entityTypeSubgraph } = await graphApi
    .getEntityTypesByQuery({
      query: { eq: [{ path: ["version"] }, { literal: "latest" }] },
      graphResolveDepths: {
        dataTypeResolveDepth: dataTypeQueryDepth(info),
        propertyTypeResolveDepth: propertyTypeQueryDepth(info),
        linkTypeResolveDepth: 0,
        entityTypeResolveDepth: 0,
        linkTargetEntityResolveDepth: 0,
        linkResolveDepth: 0,
      },
    })
    .catch((err: AxiosError) => {
      throw new ApolloError(
        `Unable to retrieve all latest entity types. ${err.response?.data}`,
        "GET_ALL_ERROR",
      );
    });

  return mapSubgraphToGql(entityTypeSubgraph);
};

export const getEntityType: ResolverFn<
  Promise<Subgraph>,
  {},
  LoggedInGraphQLContext,
  QueryGetEntityTypeArgs
> = async (_, { entityTypeId }, { dataSources }, info) => {
  const { graphApi } = dataSources;

  const { data: entityTypeSubgraph } = await graphApi
    .getEntityTypesByQuery({
      query: {
        eq: [{ path: ["versionedUri"] }, { literal: entityTypeId }],
      },
      graphResolveDepths: {
        dataTypeResolveDepth: dataTypeQueryDepth(info),
        propertyTypeResolveDepth: propertyTypeQueryDepth(info),
        linkTypeResolveDepth: linkTypeQueryDepth(info),
        entityTypeResolveDepth: entityTypeQueryDepth(info),
        linkTargetEntityResolveDepth: 0,
        linkResolveDepth: 0,
      },
    })
    .catch((err: AxiosError) => {
      throw new ApolloError(
        `Unable to retrieve entity type. ${err.response?.data}`,
        "GET_ERROR",
      );
    });

  return mapSubgraphToGql(entityTypeSubgraph);
};

export const updateEntityType: ResolverFn<
  Promise<PersistedEntityType>,
  {},
  LoggedInGraphQLContext,
  MutationUpdateEntityTypeArgs
> = async (_, params, { dataSources }) => {
  const { graphApi } = dataSources;
  const { entityTypeId, updatedEntityType } = params;

  const entityTypeModel = await EntityTypeModel.get(graphApi, {
    entityTypeId,
  }).catch((err: AxiosError) => {
    throw new ApolloError(
      `Unable to retrieve entity type. ${err.response?.data} [URI=${entityTypeId}]`,
      "GET_ERROR",
    );
  });

  const updatedEntityTypeModel = await entityTypeModel
    .update(graphApi, {
      schema: updatedEntityType,
    })
    .catch((err: AxiosError) => {
      const msg =
        err.response?.status === 409
          ? `Entity type URI doesn't exist, unable to update. [URI=${entityTypeId}]`
          : `Couldn't update entity type.`;

      throw new ApolloError(msg, "CREATION_ERROR");
    });

  return mapEntityTypeModelToGQL(updatedEntityTypeModel);
};
