import { faComment } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon, IconButton } from "@hashintel/design-system";
import { TextToken } from "@local/hash-graphql-shared/graphql/types";
import { EntityId } from "@local/hash-graphql-shared/types";
import { Box } from "@mui/material";
import { FunctionComponent, useState } from "react";

import { useCreateComment } from "../../../components/hooks/use-create-comment";
import { usePageContext } from "../page-context";
import { CommentTextField } from "./comment-text-field";
import styles from "./style.module.css";

type CreateBlockCommentProps = {
  blockEntityId: EntityId | null;
  onClose?: () => void;
};

export const CreateBlockComment: FunctionComponent<CreateBlockCommentProps> = ({
  blockEntityId,
  onClose,
}) => {
  const { pageEntityId } = usePageContext();
  const [createComment, { loading }] = useCreateComment(pageEntityId);
  const [inputValue, setInputValue] = useState<TextToken[]>([]);

  const handleCommentSubmit = async () => {
    if (!loading && blockEntityId && inputValue.length) {
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
        onClick={onClose}
        sx={({ palette }) => ({
          padding: 0.5,
          borderRadius: 1,
          mx: 1,
          my: 1.375,
          alignSelf: "flex-start",
          color: palette.gray[50],
        })}
      >
        <FontAwesomeIcon icon={faComment} />
      </IconButton>

      <CommentTextField
        onClose={onClose}
        onSubmit={handleCommentSubmit}
        editable={!loading}
        loading={loading}
        className={styles.Comment__TextField_editable}
        onChange={setInputValue}
      />
    </Box>
  );
};
