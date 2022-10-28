import { AxiosError } from "axios";
import { ApolloError } from "apollo-server-express";
import { EntityModel } from "../../../../model";
import {
  QueryGetPersistedEntityArgs,
  MutationCreatePersistedEntityArgs,
  MutationUpdatePersistedEntityArgs,
  ResolverFn,
  Subgraph,
  QueryGetAllLatestPersistedEntitiesArgs,
} from "../../../apiTypes.gen";
import {
  mapEntityModelToGQL,
  UnresolvedPersistedEntityGQL,
} from "../model-mapping";
import { LoggedInGraphQLContext } from "../../../context";
import { mapSubgraphToGql } from "../../ontology/model-mapping";
import { Filter } from "packages/graph/clients/typescript";

/** @todo - rename these and remove "persisted" - https://app.asana.com/0/0/1203157172269854/f */

export const createPersistedEntity: ResolverFn<
  Promise<UnresolvedPersistedEntityGQL>,
  {},
  LoggedInGraphQLContext,
  MutationCreatePersistedEntityArgs
> = async (
  _,
  { ownedById, properties, entityTypeId, linkedEntities },
  { dataSources: { graphApi }, userModel },
) => {
  /**
   * @todo: prevent callers of this mutation from being able to create restricted
   * workspace types (e.g. a `User` or an `Org`)
   *
   * @see https://app.asana.com/0/1202805690238892/1203084714149803/f
   */

  const entity = await EntityModel.createEntityWithLinks(graphApi, {
    ownedById: ownedById ?? userModel.entityId,
    entityTypeId,
    properties,
    linkedEntities: linkedEntities ?? undefined,
    actorId: userModel.entityId,
  });

  return mapEntityModelToGQL(entity);
};

export const getAllLatestPersistedEntities: ResolverFn<
  Promise<Subgraph>,
  {},
  LoggedInGraphQLContext,
  QueryGetAllLatestPersistedEntitiesArgs
> = async (
  _,
  {
    dataTypeResolveDepth,
    propertyTypeResolveDepth,
    linkTypeResolveDepth,
    entityTypeResolveDepth,
    linkResolveDepth,
    linkTargetEntityResolveDepth,
  },
  { dataSources },
  __,
) => {
  const { graphApi } = dataSources;

  const { data: entitySubgraph } = await graphApi
    .getEntitiesByQuery({
      filter: {
        equal: [{ path: ["version"] }, { parameter: "latest" }],
      },
      graphResolveDepths: {
        dataTypeResolveDepth,
        propertyTypeResolveDepth,
        linkTypeResolveDepth,
        entityTypeResolveDepth,
        linkResolveDepth,
        linkTargetEntityResolveDepth,
      },
    })
    .catch((err: AxiosError) => {
      throw new ApolloError(
        `Unable to retrieve all latest entities. ${err.response?.data}`,
        "GET_ALL_ERROR",
      );
    });

  return mapSubgraphToGql(entitySubgraph);
};

export const getPersistedEntity: ResolverFn<
  Promise<Subgraph>,
  {},
  LoggedInGraphQLContext,
  QueryGetPersistedEntityArgs
> = async (
  _,
  {
    entityId,
    entityVersion,
    dataTypeResolveDepth,
    propertyTypeResolveDepth,
    linkTypeResolveDepth,
    entityTypeResolveDepth,
    linkResolveDepth,
    linkTargetEntityResolveDepth,
  },
  { dataSources },
  __,
) => {
  const { graphApi } = dataSources;

  const filter: Filter = {
    all: [
      {
        equal: [
          { path: ["version"] },
          { parameter: entityVersion ?? "latest" },
        ],
      },
      { equal: [{ path: ["id"] }, { parameter: entityId }] },
    ],
  };

  const { data: entitySubgraph } = await graphApi
    .getEntitiesByQuery({
      filter,
      graphResolveDepths: {
        dataTypeResolveDepth,
        propertyTypeResolveDepth,
        linkTypeResolveDepth,
        entityTypeResolveDepth,
        linkResolveDepth,
        linkTargetEntityResolveDepth,
      },
    })
    .catch((err: AxiosError) => {
      throw new ApolloError(
        `Unable to retrieve entity. ${err.response?.data}`,
        "GET_ERROR",
      );
    });

  return mapSubgraphToGql(entitySubgraph);
};

export const updatePersistedEntity: ResolverFn<
  Promise<UnresolvedPersistedEntityGQL>,
  {},
  LoggedInGraphQLContext,
  MutationUpdatePersistedEntityArgs
> = async (
  _,
  { entityId, updatedProperties },
  { dataSources: { graphApi }, userModel },
) => {
  const entityModel = await EntityModel.getLatest(graphApi, {
    entityId,
  });

  const updatedEntityModel = await entityModel.update(graphApi, {
    properties: updatedProperties,
    actorId: userModel.entityId,
  });

  return mapEntityModelToGQL(updatedEntityModel);
};
