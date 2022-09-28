import { QueryPageCommentsArgs, ResolverFn } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { Comment, UnresolvedGQLEntity } from "../../../model";

export const pageComments: ResolverFn<
  Promise<UnresolvedGQLEntity[]>,
  {},
  GraphQLContext,
  QueryPageCommentsArgs
> = async (_, { accountId, pageId }, { dataSources }) => {
  const comments = await Comment.getAllCommentsInPage(dataSources.db, {
    accountId,
    pageId,
  });

  return comments.map((comment) => comment.toGQLUnknownEntity());
};
