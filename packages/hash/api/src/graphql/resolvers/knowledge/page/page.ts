import { PageModel } from "../../../../model";

import { QueryPersistedPageArgs, ResolverFn } from "../../../apiTypes.gen";
import { GraphQLContext } from "../../../context";
import {
  UnresolvedPersistedPageGQL,
  mapPageModelToGQL,
} from "../model-mapping";

export const persistedPage: ResolverFn<
  Promise<UnresolvedPersistedPageGQL>,
  {},
  GraphQLContext,
  QueryPersistedPageArgs
> = async (_, { entityId, entityVersion }, { dataSources: { graphApi } }) => {
  const pageModel = await PageModel.getPageById(graphApi, {
    entityId,
    entityVersion: entityVersion ?? undefined,
  });

  return mapPageModelToGQL(pageModel);
};
