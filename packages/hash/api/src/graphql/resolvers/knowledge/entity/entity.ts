import { Filter } from "@hashintel/hash-graph-client";
import { AxiosError } from "axios";
import { ApolloError, ForbiddenError } from "apollo-server-express";
import { Entity, splitEntityId, Subgraph } from "@hashintel/hash-subgraph";
import { EntityModel } from "../../../../model";
import {
  QueryGetEntityArgs,
  MutationCreateEntityArgs,
  MutationUpdateEntityArgs,
  ResolverFn,
  QueryGetAllLatestEntitiesArgs,
} from "../../../apiTypes.gen";
import { mapEntityModelToGQL } from "../model-mapping";
import { LoggedInGraphQLContext } from "../../../context";
import { beforeUpdateEntityHooks } from "./before-update-entity-hooks";

/** @todo - rename these and remove "withMetadata" - https://app.asana.com/0/0/1203157172269854/f */

export const createEntity: ResolverFn<
  Promise<Entity>,
  {},
  LoggedInGraphQLContext,
  MutationCreateEntityArgs
> = async (
  _,
  { ownedById, properties, entityTypeId, linkedEntities },
  { dataSources: { graphApi }, userModel },
) => {
  /**
   * @todo: prevent callers of this mutation from being able to create restricted
   * system types (e.g. a `User` or an `Org`)
   *
   * @see https://app.asana.com/0/1202805690238892/1203084714149803/f
   */

  const entity = await EntityModel.createEntityWithLinks(graphApi, {
    ownedById: ownedById ?? userModel.getEntityUuid(),
    entityTypeId,
    properties,
    linkedEntities: linkedEntities ?? undefined,
    actorId: userModel.getEntityUuid(),
  });

  return mapEntityModelToGQL(entity);
};

export const getAllLatestEntities: ResolverFn<
  Promise<Subgraph>,
  {},
  LoggedInGraphQLContext,
  QueryGetAllLatestEntitiesArgs
> = async (
  _,
  {
    constrainsValuesOn,
    constrainsPropertiesOn,
    entityTypeResolveDepth,
    entityResolveDepth,
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
        constrainsValuesOn,
        constrainsPropertiesOn,
        entityTypeResolveDepth,
        entityResolveDepth,
      },
    })
    .catch((err: AxiosError) => {
      throw new ApolloError(
        `Unable to retrieve all latest entities. ${err.response?.data}`,
        "GET_ALL_ERROR",
      );
    });

  return entitySubgraph as Subgraph;
};

export const getEntity: ResolverFn<
  Promise<Subgraph>,
  {},
  LoggedInGraphQLContext,
  QueryGetEntityArgs
> = async (
  _,
  {
    entityId,
    entityVersion,
    constrainsValuesOn,
    constrainsPropertiesOn,
    entityTypeResolveDepth,
    entityResolveDepth,
  },
  { dataSources },
  __,
) => {
  const { graphApi } = dataSources;
  const [ownedById, entityUuid] = splitEntityId(entityId);

  const filter: Filter = {
    all: [
      {
        equal: [
          { path: ["version"] },
          { parameter: entityVersion ?? "latest" },
        ],
      },
      {
        equal: [{ path: ["ownedById"] }, { parameter: ownedById }],
      },
      {
        equal: [{ path: ["uuid"] }, { parameter: entityUuid }],
      },
    ],
  };

  const { data: entitySubgraph } = await graphApi
    .getEntitiesByQuery({
      filter,
      graphResolveDepths: {
        constrainsValuesOn,
        constrainsPropertiesOn,
        entityTypeResolveDepth,
        entityResolveDepth,
      },
    })
    .catch((err: AxiosError) => {
      throw new ApolloError(
        `Unable to retrieve entity. ${err.response?.data}`,
        "GET_ERROR",
      );
    });

  return entitySubgraph as Subgraph;
};

export const updateEntity: ResolverFn<
  Promise<Entity>,
  {},
  LoggedInGraphQLContext,
  MutationUpdateEntityArgs
> = async (
  _,
  { entityId, updatedProperties },
  { dataSources: { graphApi }, userModel },
) => {
  // The user needs to be signed up if they aren't updating their own user entity
  if (
    entityId !== userModel.getEntityUuid() &&
    !userModel.isAccountSignupComplete()
  ) {
    throw new ForbiddenError(
      "You must complete the sign-up process to perform this action.",
    );
  }

  const entityModel = await EntityModel.getLatest(graphApi, { entityId });

  for (const beforeUpdateHook of beforeUpdateEntityHooks) {
    if (
      beforeUpdateHook.entityTypeId ===
      entityModel.entityTypeModel.getSchema().$id
    ) {
      await beforeUpdateHook.callback({
        graphApi,
        entityModel,
        updatedProperties,
      });
    }
  }

  const updatedEntityModel = await entityModel.update(graphApi, {
    properties: updatedProperties,
    actorId: userModel.getEntityUuid(),
  });

  return mapEntityModelToGQL(updatedEntityModel);
};
