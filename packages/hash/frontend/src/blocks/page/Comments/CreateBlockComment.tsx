import { FunctionComponent, useState } from "react";
import { Box } from "@mui/material";
import { IconButton, FontAwesomeIcon } from "@hashintel/hash-design-system";
import { faComment } from "@fortawesome/free-regular-svg-icons";
import { TextToken } from "@hashintel/hash-shared/graphql/types";
import { CommentTextField } from "./CommentTextField";
import styles from "../style.module.css";
import { useRouteAccountInfo, useRoutePageInfo } from "../../../shared/routing";
import { useCreateComment } from "../../../components/hooks/useCreateComment";

type CreateBlockCommentProps = {
  blockId: string | null;
  onClose?: () => void;
};

export const CreateBlockComment: FunctionComponent<CreateBlockCommentProps> = ({
  blockId,
  onClose,
}) => {
  const { accountId } = useRouteAccountInfo();
  const { pageEntityId } = useRoutePageInfo();
  const [createComment, { loading }] = useCreateComment(
    accountId,
    pageEntityId,
  );
  const [inputValue, setInputValue] = useState<TextToken[]>([]);

  const submitComment = async () => {
    if (!loading && blockId && inputValue?.length) {
      await createComment(blockId, inputValue).then(() => {
        onClose?.();
      });
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
        onSubmit={submitComment}
        editable={!loading}
        loading={loading}
        classNames={styles.Comment__TextField_editable}
        onChange={setInputValue}
      />
    </Box>
  );
};
