import { Filter } from "@hashintel/hash-graph-client";
import { AxiosError } from "axios";
import {
  ApolloError,
  ForbiddenError,
  UserInputError,
} from "apollo-server-express";
import {
  Entity,
  isEntityId,
  splitEntityId,
  Subgraph,
} from "@hashintel/hash-subgraph";
import { EntityModel, LinkEntityModel } from "../../auth/model";
import {
  QueryGetEntityArgs,
  MutationCreateEntityArgs,
  MutationUpdateEntityArgs,
  ResolverFn,
  QueryGetAllLatestEntitiesArgs,
  MutationArchiveEntityArgs,
} from "../../auth/model/aggregation.model/apiTypes.gen";
import { mapEntityModelToGQL } from "./page/update-page-contents/model-mapping";
import { LoggedInGraphQLContext } from "./embed/context";
import { beforeUpdateEntityHooks } from "./entity/before-update-entity-hooks";
import { getEntityTypeById } from "../../auth/model/entity.model/entity-type";

/**
 * @todo - Remove this when the Subgraph is appropriately queryable for a timestamp
 *   at the moment, (not in the roots) all versions of linked entities are returned,
 *   and with the lack of an `endTime`, this breaks the query ability of the graph to
 *   find the correct version of an entity.
 *   https://app.asana.com/0/1201095311341924/1203331904553375/f
 *
 */
const removeNonLatestEntities = (subgraph: Subgraph) => {
  for (const entityId of Object.keys(subgraph.vertices)) {
    if (isEntityId(entityId)) {
      for (const oldVersion of Object.keys(subgraph.vertices[entityId]!)
        .sort()
        .slice(0, -1)) {
        // eslint-disable-next-line no-param-reassign
        delete subgraph.vertices[entityId]![oldVersion];
      }
    }
  }
};

export const createEntityResolver: ResolverFn<
  Promise<Entity>,
  {},
  LoggedInGraphQLContext,
  MutationCreateEntityArgs
> = async (
  _,
  { ownedById, properties, entityTypeId, linkedEntities, linkData },
  { dataSources: { graphApi }, userModel },
) => {
  /**
   * @todo: prevent callers of this mutation from being able to create restricted
   * system types (e.g. a `User` or an `Org`)
   *
   * @see https://app.asana.com/0/1202805690238892/1203084714149803/f
   */

  let entityModel: EntityModel | LinkEntityModel;

  if (linkData) {
    const { leftEntityId, leftToRightOrder, rightEntityId, rightToLeftOrder } =
      linkData;

    const [leftEntityModel, rightEntityModel, linkEntityType] =
      await Promise.all([
        EntityModel.getLatest(graphApi, {
          entityId: leftEntityId,
        }),
        EntityModel.getLatest(graphApi, {
          entityId: rightEntityId,
        }),
        getEntityTypeById({ graphApi }, { entityTypeId }),
      ]);

    entityModel = await LinkEntityModel.createLinkEntity(graphApi, {
      leftEntityModel,
      leftToRightOrder: leftToRightOrder ?? undefined,
      rightEntityModel,
      rightToLeftOrder: rightToLeftOrder ?? undefined,
      properties,
      linkEntityType,
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

export const getAllLatestEntitiesResolver: ResolverFn<
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
    isOfType,
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
        isOfType,
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

  removeNonLatestEntities(entitySubgraph as Subgraph);
  return entitySubgraph as Subgraph;
};

export const getEntityResolver: ResolverFn<
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
    isOfType,
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
        isOfType,
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

  removeNonLatestEntities(entitySubgraph as Subgraph);
  return entitySubgraph as Subgraph;
};

export const updateEntityResolver: ResolverFn<
  Promise<Entity>,
  {},
  LoggedInGraphQLContext,
  MutationUpdateEntityArgs
> = async (
  _,
  { entityId, updatedProperties, leftToRightOrder, rightToLeftOrder },
  { dataSources: { graphApi }, userModel },
) => {
  // The user needs to be signed up if they aren't updating their own user entity
  if (
    entityId !== userModel.getBaseId() &&
    !userModel.isAccountSignupComplete()
  ) {
    throw new ForbiddenError(
      "You must complete the sign-up process to perform this action.",
    );
  }

  const entityModel = await EntityModel.getLatest(graphApi, { entityId });

  for (const beforeUpdateHook of beforeUpdateEntityHooks) {
    if (beforeUpdateHook.entityTypeId === entityModel.entityType.schema.$id) {
      await beforeUpdateHook.callback({
        graphApi,
        entityModel,
        updatedProperties,
      });
    }
  }

  let updatedEntityModel: EntityModel;

  if (entityModel instanceof LinkEntityModel) {
    updatedEntityModel = await entityModel.update(graphApi, {
      properties: updatedProperties,
      actorId: userModel.getEntityUuid(),
      leftToRightOrder: leftToRightOrder ?? undefined,
      rightToLeftOrder: rightToLeftOrder ?? undefined,
    });
  } else {
    if (leftToRightOrder || rightToLeftOrder) {
      throw new UserInputError(
        `Cannot update the left to right order or right to left order of entity with ID ${entityModel.getBaseId()} because it isn't a link.`,
      );
    }

    updatedEntityModel = await entityModel.update(graphApi, {
      properties: updatedProperties,
      actorId: userModel.getEntityUuid(),
    });
  }

  return mapEntityModelToGQL(updatedEntityModel);
};

export const archiveEntity: ResolverFn<
  Promise<boolean>,
  {},
  LoggedInGraphQLContext,
  MutationArchiveEntityArgs
> = async (_, { entityId }, { dataSources: { graphApi }, userModel }) => {
  const entityModel = await EntityModel.getLatest(graphApi, { entityId });

  await entityModel.archive(graphApi, { actorId: userModel.getEntityUuid() });

  return true;
};
