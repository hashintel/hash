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
> = async (_, params, { dataSources, userModel }) => {
  const { graphApi } = dataSources;
  const { ownedById, entityType } = params;

  const createdEntityTypeModel = await EntityTypeModel.create(graphApi, {
    ownedById: ownedById ?? userModel.entityId,
    schema: entityType,
    actorId: userModel.entityId,
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
> = async (_, __, { dataSources }, info) => {
  const { graphApi } = dataSources;

  const entityTypeRootedSubgraphs = await EntityTypeModel.getAllLatestResolved(
    graphApi,
    {
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
> = async (_, { entityTypeId }, { dataSources }, info) => {
  const { graphApi } = dataSources;

  const entityTypeRootedSubgraph = await EntityTypeModel.getResolved(graphApi, {
    entityTypeId,
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
> = async (_, params, { dataSources, userModel }) => {
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
      actorId: userModel.entityId,
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
