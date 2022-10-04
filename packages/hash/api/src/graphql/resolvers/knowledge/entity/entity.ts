import { EntityModel } from "../../../../model";
import {
  MutationCreateKnowledgeEntityArgs,
  QueryKnowledgeEntityArgs,
  ResolverFn,
} from "../../../apiTypes.gen";
import {
  mapEntityModelToGQL,
  UnresolvedKnowledgeEntityGQL,
} from "../model-mapping";
import { LoggedInGraphQLContext } from "../../../context";

export const createKnowledgeEntity: ResolverFn<
  Promise<UnresolvedKnowledgeEntityGQL>,
  {},
  LoggedInGraphQLContext,
  MutationCreateKnowledgeEntityArgs
> = async (
  _,
  { ownedById, properties, entityTypeId, linkedEntities },
  { dataSources: { graphApi }, user },
) => {
  /**
   * @todo: prevent callers of this mutation from being able to create restricted
   * workspace types (e.g. a `User` or an `Org`)
   *
   * @see https://app.asana.com/0/1202805690238892/1203084714149803/f
   */

  const entity = await EntityModel.createEntityWithLinks(graphApi, {
    ownedById: ownedById ?? user.entityId,
    entityTypeId,
    properties,
    linkedEntities: linkedEntities ?? undefined,
  });

  return mapEntityModelToGQL(entity);
};

export const knowledgeEntity: ResolverFn<
  Promise<UnresolvedKnowledgeEntityGQL>,
  {},
  LoggedInGraphQLContext,
  QueryKnowledgeEntityArgs
> = async (_, { entityId, entityVersion }, { dataSources: { graphApi } }) => {
  const entity = entityVersion
    ? await EntityModel.getVersion(graphApi, { entityId, entityVersion })
    : await EntityModel.getLatest(graphApi, { entityId });

  return mapEntityModelToGQL(entity);
};
