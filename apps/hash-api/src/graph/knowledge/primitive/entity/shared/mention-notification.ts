import { isPageEntityTypeId } from "@local/hash-isomorphic-utils/page-entity-type-ids";

import type { ImpureGraphFunction } from "../../../../context-types.js";
import type { Block } from "../../../system-types/block.js";
import { getBlockCollectionByBlock } from "../../../system-types/block.js";
import type { Comment } from "../../../system-types/comment.js";
import { getCommentAncestorBlock } from "../../../system-types/comment.js";
import type { Page } from "../../../system-types/page.js";
import { getPageFromEntity } from "../../../system-types/page.js";
import type { Text } from "../../../system-types/text.js";
import {
  getCommentByText,
  getPageAndBlockByText,
} from "../../../system-types/text.js";

export const getTextUpdateOccurredIn: ImpureGraphFunction<
  { text: Text; includeDrafts?: boolean },
  Promise<{
    occurredInEntity?: Page;
    occurredInBlock?: Block;
    occurredInComment?: Comment;
  }>
> = async (context, authentication, params) => {
  const pageAndBlock = await getPageAndBlockByText(
    context,
    authentication,
    params,
  );

  if (pageAndBlock) {
    const { page, block } = pageAndBlock;
    return { occurredInEntity: page, occurredInBlock: block };
  }

  const commentWithText = await getCommentByText(
    context,
    authentication,
    params,
  );

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
      isPageEntityTypeId(blockCollectionEntity.metadata.entityTypeId)
    ) {
      const pageWithComment = getPageFromEntity({
        entity: blockCollectionEntity,
      });

      return {
        occurredInComment: commentWithText,
        occurredInBlock: commentAncestorBlock,
        occurredInEntity: pageWithComment,
      };
    }

    return {
      occurredInComment: commentWithText,
      occurredInBlock: commentAncestorBlock,
    };
  }

  return {};
};
