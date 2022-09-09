import { FunctionComponent, useRef } from "react";
import { IconButton, FontAwesomeIcon } from "@hashintel/hash-design-system";
import { faComment } from "@fortawesome/free-regular-svg-icons";
import Box from "@mui/material/Box";
import { useBlockView } from "../BlockViewContext";
import { blockCommentPluginKey } from "../createBlockCommentPlugin/createBlockComment";

type CommentButtonProps = {
  blockId: string | null;
  className: string;
};

export const CommentButton: FunctionComponent<CommentButtonProps> = ({
  blockId,
  className,
}) => {
  const blockView = useBlockView();
  const containerRef = useRef<HTMLButtonElement>(null);

  return (
    <Box ref={containerRef} className={className}>
      <IconButton
        onClick={() => {
          const view = blockView.editorView;
          const { tr } = view.state;
          tr.setMeta(blockCommentPluginKey, {
            type: "open",
            payload: { anchor: containerRef.current, blockId },
          });
          view.dispatch(tr);
        }}
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
