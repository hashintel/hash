import type { FunctionComponent, useState } from "react";
import { faComment } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon, IconButton } from "@hashintel/design-system";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { TextToken } from "@local/hash-isomorphic-utils/types";
import { Box } from "@mui/material";

import { useCreateComment } from "../../../../components/hooks/use-create-comment";
import { usePageContext } from "../page-context";

import { CommentTextField } from "./comment-text-field";
import styles from "./style.module.css";

interface CreateBlockCommentProps {
  blockEntityId: EntityId | null;
  onClose?: () => void;
}

export const CreateBlockComment: FunctionComponent<CreateBlockCommentProps> = ({
  blockEntityId,
  onClose,
}) => {
  const { pageEntityId } = usePageContext();
  const [createComment, { loading }] = useCreateComment(pageEntityId);
  const [inputValue, setInputValue] = useState<TextToken[]>([]);

  const handleCommentSubmit = async () => {
    if (!loading && blockEntityId && inputValue.length > 0) {
      await createComment(blockEntityId, inputValue);
      onClose?.();
    }
  };

  return (
    <Box
      sx={({ transitions, palette }) => ({
        width: 250,
        display: "flex",
        alignItems: "center",
        borderRadius: 1.5,
        border: `1px solid ${palette.gray[30]}`,
        backdropFilter: "blur(40px)",
        transition: transitions.create("border-color"),
        "&:focus-within": {
          borderColor: palette.blue[60],
        },
      })}
    >
      <IconButton
        sx={({ palette }) => ({
          padding: 0.5,
          borderRadius: 1,
          mx: 1,
          my: 1.375,
          alignSelf: "flex-start",
          color: palette.gray[50],
        })}
        onClick={onClose}
      >
        <FontAwesomeIcon icon={faComment} />
      </IconButton>

      <CommentTextField
        editable={!loading}
        loading={loading}
        className={styles.Comment__TextField_editable}
        onClose={onClose}
        onSubmit={handleCommentSubmit}
        onChange={setInputValue}
      />
    </Box>
  );
};
