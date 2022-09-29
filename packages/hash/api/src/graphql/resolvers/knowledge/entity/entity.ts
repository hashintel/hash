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
  { ownedById, entity: entityDefinition },
  { dataSources: { graphApi } },
) => {
  /** @todo restrict creation of protected types, e.g. User, Org */
  const entity = await EntityModel.createEntityWithLinks(graphApi, {
    ownedById,
    entityDefinition,
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
