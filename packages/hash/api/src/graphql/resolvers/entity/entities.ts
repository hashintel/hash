import { Entity, UnresolvedGQLEntity } from "../../../model";
import { validateEntityTypeChoice } from "../../../util";

import { QueryEntitiesArgs, ResolverFn } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";

export const entities: ResolverFn<
  Promise<UnresolvedGQLEntity[]>,
  {},
  GraphQLContext,
  QueryEntitiesArgs
> = async (_, params, { dataSources: { db } }) => {
  const { accountId } = params;

  const entityTypeFilter = params.filter?.entityType
    ? validateEntityTypeChoice(params.filter.entityType)
    : undefined;

  const resultingEntities = await Entity.getAccountEntities(db, {
    accountId,
    entityTypeFilter,
  });

  return resultingEntities.map((entity) => entity.toGQLUnknownEntity());
};
