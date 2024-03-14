import { isPageEntityTypeId } from "@local/hash-isomorphic-utils/page-entity-type-ids";

import type { ImpureGraphFunction } from "../../../../context-types";
import type { Block } from "../../../system-types/block";
import { getBlockCollectionByBlock } from "../../../system-types/block";
import type { Comment } from "../../../system-types/comment";
import { getCommentAncestorBlock } from "../../../system-types/comment";
import type { Page } from "../../../system-types/page";
import { getPageFromEntity } from "../../../system-types/page";
import type { Text } from "../../../system-types/text";
import {
  getCommentByText,
  getPageAndBlockByText,
} from "../../../system-types/text";

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
