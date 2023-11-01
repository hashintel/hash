import { ImpureGraphFunction } from "../../../..";
import { SYSTEM_TYPES } from "../../../../system-types";
import { Block, getBlockCollectionByBlock } from "../../../system-types/block";
import {
  Comment,
  getCommentAncestorBlock,
} from "../../../system-types/comment";
import { getPageFromEntity, Page } from "../../../system-types/page";
import {
  getCommentByText,
  getPageAndBlockByText,
  Text,
} from "../../../system-types/text";

export const getTextUpdateOccurredIn: ImpureGraphFunction<
  { text: Text },
  Promise<{
    occurredInPage?: Page;
    occurredInBlock?: Block;
    occurredInComment?: Comment;
  }>
> = async (context, authentication, { text }) => {
  const pageAndBlock = await getPageAndBlockByText(context, authentication, {
    text,
  });

  if (pageAndBlock) {
    const { page, block } = pageAndBlock;
    return { occurredInPage: page, occurredInBlock: block };
  }

  const commentWithText = await getCommentByText(context, authentication, {
    text,
  });

  if (commentWithText) {
    const commentAncestorBlock = await getCommentAncestorBlock(
      context,
      authentication,
      { commentEntityId: commentWithText.entity.metadata.recordId.entityId },
    );

    const blockCollectionEntity = await getBlockCollectionByBlock(
      context,
      authentication,
      {
        block: commentAncestorBlock,
      },
    );

    if (
      blockCollectionEntity &&
      blockCollectionEntity.metadata.entityTypeId ===
        SYSTEM_TYPES.entityType.page.schema.$id
    ) {
      const pageWithComment = getPageFromEntity({
        entity: blockCollectionEntity,
      });

      return {
        occurredInComment: commentWithText,
        occurredInBlock: commentAncestorBlock,
        occurredInPage: pageWithComment,
      };
    }

    return {
      occurredInComment: commentWithText,
      occurredInBlock: commentAncestorBlock,
    };
  }

  return {};
};
