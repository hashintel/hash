import { ApolloError } from "apollo-server-express";
import { AxiosError } from "axios";

import {
  PersistedEntityType,
  MutationCreateEntityTypeArgs,
  MutationUpdateEntityTypeArgs,
  QueryGetEntityTypeArgs,
  ResolverFn,
  EntityTypeRootedSubgraph,
} from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { EntityTypeModel } from "../../../model";
import {
  mapEntityTypeModelToGQL,
  mapEntityTypeRootedSubgraphToGQL,
} from "./model-mapping";
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

  return mapEntityTypeModelToGQL(createdEntityTypeModel);
};

export const getAllLatestEntityTypes: ResolverFn<
  Promise<EntityTypeRootedSubgraph[]>,
  {},
  LoggedInGraphQLContext,
  {}
> = async (_, __, { dataSources, user }, info) => {
  const { graphApi } = dataSources;

  const entityTypeRootedSubgraphs = await EntityTypeModel.getAllLatestResolved(
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

  return entityTypeRootedSubgraphs.map(mapEntityTypeRootedSubgraphToGQL);
};

export const getEntityType: ResolverFn<
  Promise<EntityTypeRootedSubgraph>,
  {},
  LoggedInGraphQLContext,
  QueryGetEntityTypeArgs
> = async (_, { entityTypeVersionedUri }, { dataSources }, info) => {
  const { graphApi } = dataSources;

  const entityTypeRootedSubgraph = await EntityTypeModel.getResolved(graphApi, {
    entityTypeId: entityTypeVersionedUri,
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

  return mapEntityTypeRootedSubgraphToGQL(entityTypeRootedSubgraph);
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
    entityTypeId: entityTypeVersionedUri,
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

  return mapEntityTypeModelToGQL(updatedEntityTypeModel);
};
