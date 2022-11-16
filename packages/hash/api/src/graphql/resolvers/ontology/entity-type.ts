import { ApolloError } from "apollo-server-express";
import { AxiosError } from "axios";
import { EntityTypeWithMetadata } from "@hashintel/subgraph/types";

import {
  MutationCreateEntityTypeArgs,
  MutationUpdateEntityTypeArgs,
  QueryGetEntityTypeArgs,
  QueryGetAllLatestEntityTypesArgs,
  ResolverFn,
  Subgraph,
} from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { EntityTypeModel } from "../../../model";
import { mapEntityTypeModelToGQL, mapSubgraphToGql } from "./model-mapping";

export const createEntityType: ResolverFn<
  Promise<EntityTypeWithMetadata>,
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

  return mapSubgraphToGql(entityTypeSubgraph);
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

  return mapSubgraphToGql(entityTypeSubgraph);
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
