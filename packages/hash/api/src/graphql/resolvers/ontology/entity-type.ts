import { ApolloError } from "apollo-server-express";
import { AxiosError } from "axios";

import {
  PersistedEntityType,
  MutationCreateEntityTypeArgs,
  MutationUpdateEntityTypeArgs,
  QueryGetEntityTypeArgs,
  ResolverFn,
  EntityTypeSubgraph,
} from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { EntityTypeModel } from "../../../model";
import { entityTypeModelToGQL, entityTypeSubgraphToGQL } from "./model-mapping";
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
  const { accountId, entityType } = params;

  const createdEntityTypeModel = await EntityTypeModel.create(graphApi, {
    accountId: accountId ?? user.entityId,
    schema: entityType,
  }).catch((err) => {
    throw new ApolloError(err, "CREATION_ERROR");
  });

  return entityTypeModelToGQL(createdEntityTypeModel);
};

export const getAllLatestEntityTypes: ResolverFn<
  Promise<EntityTypeSubgraph[]>,
  {},
  LoggedInGraphQLContext,
  {}
> = async (_, __, { dataSources, user }, info) => {
  const { graphApi } = dataSources;

  const entityTypeSubgraphs = await EntityTypeModel.getAllLatestResolved(
    graphApi,
    {
      accountId: user.entityId,
      dataTypeQueryDepth: dataTypeQueryDepth(info),
      propertyTypeQueryDepth: propertyTypeQueryDepth(info),
      linkTypeQueryDepth: linkTypeQueryDepth(info),
      entityTypeQueryDepth: entityTypeQueryDepth(info),
    },
  ).catch((err: AxiosError) => {
    throw new ApolloError(
      `Unable to retrieve all latest entity types. ${err.response?.data}`,
      "GET_ALL_ERROR",
    );
  });

  return entityTypeSubgraphs.map(entityTypeSubgraphToGQL);
};

export const getEntityType: ResolverFn<
  Promise<EntityTypeSubgraph>,
  {},
  LoggedInGraphQLContext,
  QueryGetEntityTypeArgs
> = async (_, { entityTypeVersionedUri }, { dataSources }, info) => {
  const { graphApi } = dataSources;

  const entityTypeSubgraph = await EntityTypeModel.getResolved(graphApi, {
    versionedUri: entityTypeVersionedUri,
    dataTypeQueryDepth: dataTypeQueryDepth(info),
    propertyTypeQueryDepth: propertyTypeQueryDepth(info),
    linkTypeQueryDepth: linkTypeQueryDepth(info),
    entityTypeQueryDepth: entityTypeQueryDepth(info),
  }).catch((err: AxiosError) => {
    throw new ApolloError(
      `Unable to retrieve entity type. ${err.response?.data}`,
      "GET_ERROR",
    );
  });

  return entityTypeSubgraphToGQL(entityTypeSubgraph);
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
      accountId: accountId ?? user.entityId,
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
