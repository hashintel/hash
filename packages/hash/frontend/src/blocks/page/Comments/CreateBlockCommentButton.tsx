import { FunctionComponent, useCallback, useState } from "react";
import { IconButton, FontAwesomeIcon } from "@hashintel/hash-design-system";
import { faComment } from "@fortawesome/free-regular-svg-icons";
import Box from "@mui/material/Box";
import Popper from "@mui/material/Popper";
import styles from "../style.module.css";
import { CreateBlockComment } from "./CreateBlockComment";

type CreateBlockCommentButtonProps = {
  blockId: string | null;
  rootNode: HTMLElement;
};

export const CreateBlockCommentButton: FunctionComponent<
  CreateBlockCommentButtonProps
> = ({ blockId, rootNode }) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

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
        <CreateBlockComment blockId={blockId} onClose={closeInput} />
      </Popper>
    </Box>
  );
};
