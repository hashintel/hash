import { ApolloError } from "apollo-server-express";
import { AxiosError } from "axios";
import { EntityTypeWithMetadata, Subgraph } from "@hashintel/hash-subgraph";

import {
  MutationCreateEntityTypeArgs,
  MutationUpdateEntityTypeArgs,
  QueryGetEntityTypeArgs,
  QueryGetAllLatestEntityTypesArgs,
  ResolverFn,
} from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { EntityTypeModel } from "../../../model";

export const createEntityType: ResolverFn<
  Promise<EntityTypeWithMetadata>,
  {},
  LoggedInGraphQLContext,
  MutationCreateEntityTypeArgs
> = async (_, params, { dataSources, userModel }) => {
  const { graphApi } = dataSources;
  const { ownedById, entityType } = params;

  const createdEntityTypeModel = await EntityTypeModel.create(graphApi, {
    ownedById: ownedById ?? userModel.entityUuid,
    schema: entityType,
    actorId: userModel.entityUuid,
  }).catch((err) => {
    throw new ApolloError(err, "CREATION_ERROR");
  });

  return createdEntityTypeModel.entityType;
};

export const getAllLatestEntityTypes: ResolverFn<
  Promise<Subgraph>,
  {},
  LoggedInGraphQLContext,
  QueryGetAllLatestEntityTypesArgs
> = async (
  _,
  { dataTypeResolveDepth, propertyTypeResolveDepth, entityTypeResolveDepth },
  { dataSources },
  __,
) => {
  const { graphApi } = dataSources;

  const { data: entityTypeSubgraph } = await graphApi
    .getEntityTypesByQuery({
      filter: {
        equal: [{ path: ["version"] }, { parameter: "latest" }],
      },
      graphResolveDepths: {
        dataTypeResolveDepth,
        propertyTypeResolveDepth,
        entityTypeResolveDepth,
        entityResolveDepth: 0,
      },
    })
    .catch((err: AxiosError) => {
      throw new ApolloError(
        `Unable to retrieve all latest entity types. ${err.response?.data}`,
        "GET_ALL_ERROR",
      );
    });

  return entityTypeSubgraph as Subgraph;
};

export const getEntityType: ResolverFn<
  Promise<Subgraph>,
  {},
  LoggedInGraphQLContext,
  QueryGetEntityTypeArgs
> = async (
  _,
  {
    entityTypeId,
    dataTypeResolveDepth,
    propertyTypeResolveDepth,
    entityTypeResolveDepth,
  },
  { dataSources },
  __,
) => {
  const { graphApi } = dataSources;

  const { data: entityTypeSubgraph } = await graphApi
    .getEntityTypesByQuery({
      filter: {
        equal: [{ path: ["versionedUri"] }, { parameter: entityTypeId }],
      },
      graphResolveDepths: {
        dataTypeResolveDepth,
        propertyTypeResolveDepth,
        entityTypeResolveDepth,
        entityResolveDepth: 0,
      },
    })
    .catch((err: AxiosError) => {
      throw new ApolloError(
        `Unable to retrieve entity type. ${err.response?.data}`,
        "GET_ERROR",
      );
    });

  return entityTypeSubgraph as Subgraph;
};

export const updateEntityType: ResolverFn<
  Promise<EntityTypeWithMetadata>,
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
      actorId: userModel.entityUuid,
    })
    .catch((err: AxiosError) => {
      const msg =
        err.response?.status === 409
          ? `Entity type URI doesn't exist, unable to update. [URI=${entityTypeId}]`
          : `Couldn't update entity type.`;

      throw new ApolloError(msg, "CREATION_ERROR");
    });

  return updatedEntityTypeModel.entityType;
};
