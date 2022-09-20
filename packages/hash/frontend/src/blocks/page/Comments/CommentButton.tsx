import { FunctionComponent, useCallback, useRef, useState } from "react";
import { IconButton, FontAwesomeIcon } from "@hashintel/hash-design-system";
import { faComment } from "@fortawesome/free-regular-svg-icons";
import Box from "@mui/material/Box";
import { TextToken } from "@hashintel/hash-shared/graphql/types";
import Popper from "@mui/material/Popper";
import { useBlockView } from "../BlockViewContext";
import { useCreateComment } from "../../../components/hooks/useCreateComment";
import { useRouteAccountInfo } from "../../../shared/routing";
import { CommentTextField } from "./CommentTextField";

type CommentButtonProps = {
  blockId: string | null;
  className: string;
  rootNode: HTMLElement;
};

export const CommentButton: FunctionComponent<CommentButtonProps> = ({
  blockId,
  className,
  rootNode,
}) => {
  const { accountId } = useRouteAccountInfo();
  const blockView = useBlockView();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [createComment] = useCreateComment(accountId);

  const submitComment = useCallback(
    async (content: TextToken[]) => {
      if (blockId) {
        await createComment(blockId, content);
      }
    },
    [createComment, blockId],
  );

  const closeInput = () => setOpen(false);

  const anchorNode = anchorRef.current;

  return (
    <Box ref={anchorRef} className={className}>
      <IconButton
        onClick={() => setOpen(true)}
        sx={{
          padding: 0.5,
          borderRadius: 1,
          opacity: blockView.hovered ? 1 : 0,
          transition: ({ transitions }) => transitions.create("opacity"),
        }}
      >
        <FontAwesomeIcon icon={faComment} />
      </IconButton>

      <Popper
        open={open}
        placement="bottom-start"
        container={rootNode}
        modifiers={[
          {
            name: "flip",
            enabled: false,
          },
          {
            name: "offset",
            options: {
              offset: () => [
                -13,
                -(anchorNode?.getBoundingClientRect().height ?? 0) - 13,
              ],
            },
          },
          {
            name: "preventOverflow",
            enabled: true,
            options: {
              padding: 20,
            },
          },
        ]}
        anchorEl={anchorNode}
      >
        <CommentTextField
          blockId={blockId!}
          onClose={closeInput}
          onSubmit={submitComment}
        />
      </Popper>
    </Box>
  );
};
