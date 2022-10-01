import { FunctionComponent } from "react";
import { TextToken } from "@hashintel/hash-shared/graphql/types";
import { Box } from "@mui/material";
import { PageComment } from "../../../components/hooks/usePageComments";
import { CommentTextField } from "./CommentTextField";
import { CommentBlock } from "./CommentBlock";

type CommentThreadProps = {
  comments: PageComment[];
  onClose: () => void;
  onSubmit: (content: TextToken[]) => Promise<void>;
};

export const CommentThread: FunctionComponent<CommentThreadProps> = ({
  comments,
  onClose,
  onSubmit,
}) => {
  return (
    <Box sx={{ width: 320 }}>
      {comments.map((comment) => (
        <CommentBlock key={comment.entityId} comment={comment} />
      ))}

      <CommentTextField onClose={onClose} onSubmit={onSubmit} editable />
    </Box>
  );
};
