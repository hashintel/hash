import { ApolloError } from "apollo-server-express";
import { FieldNode } from "graphql";
import {
  Comment,
  UnresolvedGQLComment,
  UnresolvedGQLUnknownEntity,
} from "../../../model";
import {
  CommentProperties as GQLCommentProperties,
  ResolverFn,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";

/**
 * IMPORTANT NOTE: this is a temporary field resolver and will be removed
 * once API consumers have been refactored to stop accessing `properties.contents`
 * of a Comment, and access these using the `linkGroups` or `contents` fields instead
 *
 * @deprecated
 */
export const commentProperties: ResolverFn<
  Promise<
    Omit<GQLCommentProperties, "contents"> & {
      contents: UnresolvedGQLUnknownEntity | null;
    }
  >,
  UnresolvedGQLComment,
  GraphQLContext,
  {}
> = async ({ accountId, entityId }, _, { dataSources }, info) => {
  const { db } = dataSources;
  const comment = await Comment.getCommentById(db, { accountId, entityId });

  if (!comment) {
    throw new ApolloError(
      `Comment with entityId ${entityId} not found in account ${accountId}`,
      "NOT_FOUND",
    );
  }

  const { fieldNodes } = info;

  const propertiesFieldNode = fieldNodes.find(
    ({ name }) => name.value === "properties",
  );

  const shouldFetchContents =
    propertiesFieldNode?.selectionSet?.selections
      ?.filter(
        (selection): selection is FieldNode => selection.kind === "Field",
      )
      .find(({ name }) => name.value === "contents") !== undefined;

  return {
    ...comment.properties,
    contents: shouldFetchContents
      ? (await comment.getContents(dataSources.db)).toGQLUnknownEntity()
      : null,
    commentEntityId: entityId,
  };
};
