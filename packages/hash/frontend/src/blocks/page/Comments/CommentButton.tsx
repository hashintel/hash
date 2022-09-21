import { FunctionComponent, useCallback, useState } from "react";
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
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [createComment] = useCreateComment(accountId);

  const submitComment = useCallback(
    async (content: TextToken[]) => {
      if (blockId) {
        await createComment(blockId, content);
      }
    },
    [createComment, blockId],
  );

  const closeInput = () => setAnchorEl(null);

  return (
    <Box className={className}>
      <IconButton
        onClick={(event) => setAnchorEl(anchorEl ? null : event.currentTarget)}
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
        open={!!anchorEl}
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
                -(anchorEl?.getBoundingClientRect().height ?? 0) - 13,
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
        anchorEl={anchorEl}
      >
        <CommentTextField onClose={closeInput} onSubmit={submitComment} />
      </Popper>
    </Box>
  );
};
