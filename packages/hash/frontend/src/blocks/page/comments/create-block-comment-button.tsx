import { faComment } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon, IconButton } from "@hashintel/hash-design-system";
import { EntityId } from "@hashintel/hash-shared/types";
import { Box, Popper } from "@mui/material";
import { FunctionComponent, useCallback, useState } from "react";

import { useIsReadonlyMode } from "../../../shared/readonly-mode";
import styles from "../style.module.css";
import { CreateBlockComment } from "./create-block-comment";

type CreateBlockCommentButtonProps = {
  blockEntityId: EntityId | null;
  rootNode: HTMLElement;
};

export const CreateBlockCommentButton: FunctionComponent<
  CreateBlockCommentButtonProps
> = ({ blockEntityId, rootNode }) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const isReadonlyMode = useIsReadonlyMode();

  const closeInput = useCallback(() => {
    setAnchorEl(null);
  }, []);

  if (isReadonlyMode) {
    return null;
  }

  return (
    <Box className={styles.Block__Comments_Button}>
      <IconButton
        onClick={(event) => {
          setAnchorEl(anchorEl ? null : event.currentTarget);
        }}
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
                -9,
                -(anchorEl?.getBoundingClientRect().height ?? 0) - 12,
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
        style={{ zIndex: 1 }}
      >
        <CreateBlockComment
          blockEntityId={blockEntityId}
          onClose={closeInput}
        />
      </Popper>
    </Box>
  );
};
