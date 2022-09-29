import { EntityModel } from "../../../../model";
import {
  MutationCreateKnowledgeEntityArgs,
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
