import { FunctionComponent, useState } from "react";
import { TextToken } from "@hashintel/hash-shared/graphql/types";
import { Box, Collapse } from "@mui/material";
import { PageThread } from "../../../components/hooks/usePageComments";
import { CommentTextField } from "./CommentTextField";
import { CommentBlock } from "./CommentBlock";
import { Button } from "../../../shared/ui";

type CommentThreadProps = {
  comment: PageThread;
  onClose: () => void;
  onSubmit: (parentId: string, content: TextToken[]) => Promise<void>;
};

export const CommentThread: FunctionComponent<CommentThreadProps> = ({
  comment,
  onClose,
  onSubmit,
}) => {
  const [threadFocused, setThreadFocused] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [inputDisabled, setInputDisabled] = useState(false);

  return (
    <Box
      tabIndex={0}
      onFocus={() => setThreadFocused(true)}
      onBlur={() => setThreadFocused(false)}
      sx={({ palette }) => ({
        width: 320,
        background: palette.white,
        borderRadius: 1.5,
        boxShadow:
          "0px 11px 30px rgba(61, 78, 133, 0.04), 0px 7.12963px 18.37px rgba(61, 78, 133, 0.05), 0px 4.23704px 8.1px rgba(61, 78, 133, 0.06), 0px 0.203704px 0.62963px rgba(61, 78, 133, 0.07)",
        marginBottom: 4,
      })}
    >
      <CommentBlock key={comment.entityId} comment={comment} />

      {comment.replies.map((reply) => (
        <Box
          key={reply.entityId}
          sx={{
            borderTop: ({ palette }) => `1px solid ${palette.gray[20]}`,
          }}
        >
          <CommentBlock comment={reply} />
        </Box>
      ))}

      <Collapse in={threadFocused}>
        <Box
          sx={{
            borderTop: ({ palette }) =>
              comment.replies.length ? `1px solid ${palette.gray[20]}` : "none",
            p: 1,
            paddingTop: comment.replies.length ? 1 : 0,
          }}
        >
          <Box
            sx={{
              border: ({ palette }) => `1px solid ${palette.gray[30]}`,
              borderRadius: 1.5,
            }}
          >
            <CommentTextField
              onClose={onClose}
              onSubmit={(content: TextToken[]) =>
                onSubmit(comment.entityId, content)
              }
              editable
              onFocusChange={setInputFocused}
              onEmptyDoc={setInputDisabled}
            />
          </Box>
        </Box>
      </Collapse>
      <Collapse in={threadFocused && inputFocused}>
        <Box
          sx={{
            display: "flex",
            p: 1,
            paddingTop: 0,
            gap: 0.75,
            justifyContent: "flex-end",
          }}
        >
          <Button size="xs" variant="tertiary">
            Cancel
          </Button>
          <Button size="xs" variant="secondary" disabled={inputDisabled}>
            Reply
          </Button>
        </Box>
      </Collapse>
    </Box>
  );
};
