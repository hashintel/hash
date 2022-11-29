import { Filter } from "@hashintel/hash-graph-client";
import { AxiosError } from "axios";
import { ApolloError, ForbiddenError } from "apollo-server-express";
import { Entity, splitEntityId, Subgraph } from "@hashintel/hash-subgraph";
import {
  EntityModel,
  EntityTypeModel,
  LinkEntityModel,
} from "../../../../model";
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
  { ownedById, properties, entityTypeId, linkedEntities, linkMetadata },
  { dataSources: { graphApi }, userModel },
) => {
  /**
   * @todo: prevent callers of this mutation from being able to create restricted
   * system types (e.g. a `User` or an `Org`)
   *
   * @see https://app.asana.com/0/1202805690238892/1203084714149803/f
   */

  let entityModel: EntityModel | LinkEntityModel;

  if (linkMetadata) {
    const { leftEntityId, leftOrder, rightEntityId, rightOrder } = linkMetadata;

    const [leftEntityModel, rightEntityModel, linkEntityTypeModel] =
      await Promise.all([
        EntityModel.getLatest(graphApi, {
          entityId: leftEntityId,
        }),
        EntityModel.getLatest(graphApi, {
          entityId: rightEntityId,
        }),
        EntityTypeModel.get(graphApi, { entityTypeId }),
      ]);

    entityModel = await LinkEntityModel.createLinkEntity(graphApi, {
      leftEntityModel,
      leftOrder: leftOrder ?? undefined,
      rightEntityModel,
      rightOrder: rightOrder ?? undefined,
      properties,
      linkEntityTypeModel,
      ownedById: ownedById ?? userModel.getEntityUuid(),
      actorId: userModel.getEntityUuid(),
    });
  } else {
    entityModel = await EntityModel.createEntityWithLinks(graphApi, {
      ownedById: ownedById ?? userModel.getEntityUuid(),
      entityTypeId,
      properties,
      linkedEntities: linkedEntities ?? undefined,
      actorId: userModel.getEntityUuid(),
    });
  }

  return mapEntityModelToGQL(entityModel);
};

export const getAllLatestEntities: ResolverFn<
  Promise<Subgraph>,
  {},
  LoggedInGraphQLContext,
  QueryGetAllLatestEntitiesArgs
> = async (
  _,
  {
    rootEntityTypeIds,
    constrainsValuesOn,
    constrainsPropertiesOn,
    constrainsLinksOn,
    constrainsLinkDestinationsOn,
    hasLeftEntity,
    hasRightEntity,
  },
  { dataSources },
  __,
) => {
  const { graphApi } = dataSources;

  const filter: Filter = {
    all: [
      {
        equal: [{ path: ["version"] }, { parameter: "latest" }],
      },
      {
        equal: [{ path: ["archived"] }, { parameter: false }],
      },
    ],
  };

  if (rootEntityTypeIds && rootEntityTypeIds.length > 0) {
    filter.all.push({
      any: rootEntityTypeIds.map((entityTypeId) => ({
        equal: [
          { path: ["type", "versionedUri"] },
          { parameter: entityTypeId },
        ],
      })),
    });
  }

  const { data: entitySubgraph } = await graphApi
    .getEntitiesByQuery({
      filter,
      graphResolveDepths: {
        inheritsFrom: { outgoing: 0 },
        constrainsValuesOn,
        constrainsPropertiesOn,
        constrainsLinksOn,
        constrainsLinkDestinationsOn,
        isOfType: { outgoing: 1 },
        hasLeftEntity,
        hasRightEntity,
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
    constrainsLinksOn,
    constrainsLinkDestinationsOn,
    hasLeftEntity,
    hasRightEntity,
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
        inheritsFrom: { outgoing: 0 },
        constrainsValuesOn,
        constrainsPropertiesOn,
        constrainsLinksOn,
        constrainsLinkDestinationsOn,
        isOfType: { outgoing: 1 },
        hasLeftEntity,
        hasRightEntity,
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
