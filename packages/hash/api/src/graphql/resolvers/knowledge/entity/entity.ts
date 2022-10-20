import { EntityModel } from "../../../../model";
import {
  QueryPersistedEntityArgs,
  MutationCreatePersistedEntityArgs,
  MutationUpdatePersistedEntityArgs,
  ResolverFn,
} from "../../../apiTypes.gen";
import {
  mapEntityModelToGQL,
  UnresolvedPersistedEntityGQL,
} from "../model-mapping";
import { LoggedInGraphQLContext } from "../../../context";

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

export const persistedEntity: ResolverFn<
  Promise<UnresolvedPersistedEntityGQL>,
  {},
  LoggedInGraphQLContext,
  QueryPersistedEntityArgs
> = async (_, { entityId, entityVersion }, { dataSources: { graphApi } }) => {
  const entity = entityVersion
    ? await EntityModel.getVersion(graphApi, { entityId, entityVersion })
    : await EntityModel.getLatest(graphApi, { entityId });

  return mapEntityModelToGQL(entity);
};
