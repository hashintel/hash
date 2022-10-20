import { ApolloError } from "apollo-server-express";
import { MutationCreateCommentArgs, ResolverFn } from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { Block, Comment, UnresolvedGQLEntity } from "../../../model";

export const createComment: ResolverFn<
  Promise<UnresolvedGQLEntity>,
  {},
  LoggedInGraphQLContext,
  MutationCreateCommentArgs
> = async (
  _,
  { accountId, parentId, tokens },
  { dataSources: { db }, userModel },
) => {
  return await db.transaction(async (client) => {
    const parent = await Block.getBlockById(client, {
      accountId,
      entityId: parentId,
    });

    if (!parent) {
      throw new ApolloError(
        `Could not find parent entity with entityId = ${parentId} on account with id = ${accountId}.`,
        "NOT_FOUND",
      );
    }

    const comment = await Comment.createComment(db, {
      accountId,
      parent,
      createdBy:
        userModel as any /** @todo: replace with updated model class */,
      tokens,
    });

    return comment.toGQLUnknownEntity();
  });
};
