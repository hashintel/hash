import {
  PageStructure,
  QueryAccountPagesArgs,
  Resolver,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { Entity, UnresolvedGQLEntity } from "../../../model";

export const accountPages: Resolver<
  Promise<UnresolvedGQLEntity[]>,
  {},
  GraphQLContext,
  QueryAccountPagesArgs
> = async (_, { accountId, structure }, { dataSources }) => {
  let pages: UnresolvedGQLEntity[] = [];
  if (structure === PageStructure.Flat) {
    pages = (
      await Entity.getEntitiesBySystemType(dataSources.db, {
        accountId,
        systemTypeName: "Page",
        latestOnly: true,
      })
    ).map((page) => page.toGQLUnknownEntity());
  } else if (structure === PageStructure.Tree) {
    pages = (
      await Entity.getLinkedEntityBySystemType(dataSources.db, {
        accountId,
        systemTypeName: "Page",
      })
    ).map((page) => ({
      ...page.toGQLUnknownEntity(),
      parentPageId: page.parentEntityId,
    }));
  }
  return pages;
};
