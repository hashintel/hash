import { FunctionComponent, useCallback, useMemo, useState } from "react";
import { IconButton, FontAwesomeIcon } from "@hashintel/hash-design-system";
import { faComment } from "@fortawesome/free-regular-svg-icons";
import Box from "@mui/material/Box";
import { TextToken } from "@hashintel/hash-shared/graphql/types";
import Popper from "@mui/material/Popper";
import { useCreateComment } from "../../../components/hooks/useCreateComment";
import { useRouteAccountInfo } from "../../../shared/routing";
import styles from "../style.module.css";
import { usePageComments } from "../../../components/hooks/usePageComments";
import { CreateBlockComment } from "./CreateBlockComment";

type CommentButtonProps = {
  blockId: string | null;
  rootNode: HTMLElement;
};

export const CommentButton: FunctionComponent<CommentButtonProps> = ({
  blockId,
  rootNode,
}) => {
  const { accountId } = useRouteAccountInfo();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [createComment] = useCreateComment(
    accountId,
    "142fbe88-ea94-4bac-a7fe-3bba04f02efb",
  );

  const submitComment = useCallback(
    async (content: TextToken[]) => {
      if (blockId) {
        await createComment(blockId, content);
      }
    },
    [createComment, blockId],
  );

  const closeInput = useCallback(() => setAnchorEl(null), []);

  return (
    <Box className={styles.Block__Comments_Button}>
      <IconButton
        onClick={(event) => setAnchorEl(anchorEl ? null : event.currentTarget)}
        sx={{
          padding: 0.5,
          borderRadius: 1,
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
        <CreateBlockComment onClose={closeInput} onSubmit={submitComment} />
      </Popper>
    </Box>
  );
};
