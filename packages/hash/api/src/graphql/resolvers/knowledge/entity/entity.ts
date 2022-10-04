import { EntityModel } from "../../../../model";
import { QueryPersistedEntityArgs, ResolverFn } from "../../../apiTypes.gen";
import {
  mapEntityModelToGQL,
  UnresolvedPersistedEntityGQL,
} from "../model-mapping";
import { LoggedInGraphQLContext } from "../../../context";

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
