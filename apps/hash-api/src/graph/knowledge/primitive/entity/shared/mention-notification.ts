import { ImpureGraphFunction } from "../../../../context-types";
import { SYSTEM_TYPES } from "../../../../system-types";
import { getBlockCollectionByBlock } from "../../../system-types/block";
import {
  Comment,
  getCommentAncestorBlock,
} from "../../../system-types/comment";
import { getPageFromEntity, Page } from "../../../system-types/page";
import {
  getCommentByText,
  getPageByText,
  Text,
} from "../../../system-types/text";

export const getTextUpdateOccurredInPageAndComment: ImpureGraphFunction<
  { text: Text },
  Promise<{ occurredInPage?: Page; occurredInComment?: Comment }>
> = async (context, authentication, { text }) => {
  const pageWithText = await getPageByText(context, authentication, {
    text,
  });

  if (pageWithText) {
    return { occurredInPage: pageWithText };
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
        occurredInPage: pageWithComment,
      };
    }

    return { occurredInComment: commentWithText };
  }

  return {};
};
