import type { FunctionComponent , useCallback, useState } from "react";
import { faComment } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon, IconButton } from "@hashintel/design-system";
import type { EntityId } from "@local/hash-graph-types/entity";
import { Box, Popper } from "@mui/material";

import { useBlockView } from "../block-view";
import styles from "../style.module.css";

import { CreateBlockComment } from "./create-block-comment";

interface CreateBlockCommentButtonProps {
  blockEntityId: EntityId | null;
  rootNode: HTMLElement;
}

export const CreateBlockCommentButton: FunctionComponent<
  CreateBlockCommentButtonProps
> = ({ blockEntityId, rootNode }) => {
  const [anchorElement, setAnchorElement] = useState<null | HTMLElement>(null);

  const { readonly } = useBlockView();

  const closeInput = useCallback(() => {
    setAnchorElement(null);
  }, []);

  if (readonly) {
    return null;
  }

  return (
    <Box className={styles.Block__Comments_Button}>
      <IconButton
        sx={{
          padding: 0.5,
          borderRadius: 1,
          transition: ({ transitions }) => transitions.create("opacity"),
        }}
        onClick={(event) => {
          setAnchorElement(anchorElement ? null : event.currentTarget);
        }}
      >
        <FontAwesomeIcon icon={faComment} />
      </IconButton>

      <Popper
        open={Boolean(anchorElement)}
        placement={"bottom-start"}
        container={rootNode}
        anchorEl={anchorElement}
        style={{ zIndex: 1 }}
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
                -(anchorElement?.getBoundingClientRect().height ?? 0) - 12,
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
      >
        <CreateBlockComment
          blockEntityId={blockEntityId}
          onClose={closeInput}
        />
      </Popper>
    </Box>
  );
};
