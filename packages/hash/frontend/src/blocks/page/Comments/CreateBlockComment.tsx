import { FunctionComponent } from "react";
import { Box } from "@mui/material";
import { IconButton, FontAwesomeIcon } from "@hashintel/hash-design-system";
import { faComment } from "@fortawesome/free-regular-svg-icons";
import { TextToken } from "@hashintel/hash-shared/graphql/types";
import { CommentTextField } from "./CommentTextField";

type CreateBlockCommentProps = {
  onClose?: () => void;
  onSubmit?: (content: TextToken[]) => Promise<void>;
};

export const CreateBlockComment: FunctionComponent<CreateBlockCommentProps> = ({
  onClose,
  onSubmit,
}) => (
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

    <CommentTextField onClose={onClose} onSubmit={onSubmit} editable />
  </Box>
);
