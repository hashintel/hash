import { FunctionComponent, useCallback, useRef } from "react";
import { IconButton, FontAwesomeIcon } from "@hashintel/hash-design-system";
import { faComment } from "@fortawesome/free-regular-svg-icons";
import Box from "@mui/material/Box";
import { TextToken } from "@hashintel/hash-shared/graphql/types";
import { useBlockView } from "../BlockViewContext";
import { blockCommentPluginKey } from "../createBlockCommentPlugin/createBlockComment";
import { useCreateComment } from "../../../components/hooks/useCreateComment";
import { useRouteAccountInfo } from "../../../shared/routing";

type CommentButtonProps = {
  blockId: string | null;
  className: string;
};

export const CommentButton: FunctionComponent<CommentButtonProps> = ({
  blockId,
  className,
}) => {
  const { accountId } = useRouteAccountInfo();
  const blockView = useBlockView();
  const containerRef = useRef<HTMLButtonElement>(null);

  const [createComment] = useCreateComment(accountId);

  const submitComment = useCallback(
    async (content: TextToken[]) => {
      if (blockId) {
        await createComment(blockId, content);
      }
    },
    [createComment, blockId],
  );

  const openCommentInput = () => {
    const view = blockView.editorView;
    const { tr } = view.state;
    tr.setMeta(blockCommentPluginKey, {
      type: "open",
      payload: {
        anchorNode: containerRef.current,
        blockId,
        onSubmit: submitComment,
      },
    });
    view.dispatch(tr);
  };

  return (
    <Box ref={containerRef} className={className}>
      <IconButton
        onClick={openCommentInput}
        sx={{
          padding: 0.5,
          borderRadius: 1,
          opacity: blockView.hovered ? 1 : 0,
          transition: ({ transitions }) => transitions.create("opacity"),
        }}
      >
        <FontAwesomeIcon icon={faComment} />
      </IconButton>
    </Box>
  );
};
