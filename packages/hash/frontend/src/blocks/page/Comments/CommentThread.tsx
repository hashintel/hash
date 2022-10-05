import { FunctionComponent, useState, useRef } from "react";
import { TextToken } from "@hashintel/hash-shared/graphql/types";
import { Box, Collapse } from "@mui/material";
import { PageThread } from "../../../components/hooks/usePageComments";
import { CommentTextField, CommentTextFieldRef } from "./CommentTextField";
import { CommentBlock } from "./CommentBlock";
import { Button } from "../../../shared/ui";

type CommentThreadProps = {
  comment: PageThread;
  createComment: (parentId: string, content: TextToken[]) => Promise<void>;
  loading: boolean;
};

export const CommentThread: FunctionComponent<CommentThreadProps> = ({
  comment,
  createComment,
  loading,
}) => {
  const inputRef = useRef<CommentTextFieldRef>(null);
  const [threadFocused, setThreadFocused] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [inputDisabled, setInputDisabled] = useState(false);

  const [inputValue, setInputValue] = useState<TextToken[]>([]);

  const showInput = threadFocused || !inputRef.current?.empty;
  const showInputButtons =
    (threadFocused && inputFocused) || !inputRef.current?.empty;

  const submitComment = async () => {
    const tokens = inputRef.current?.getTokens();
    if (tokens?.length) {
      await createComment(comment.entityId, tokens);
    }
  };

  return (
    <Box
      tabIndex={0}
      onFocus={() => setThreadFocused(true)}
      onBlur={() => setThreadFocused(false)}
      sx={({ palette, boxShadows }) => ({
        width: 320,
        background: palette.white,
        borderRadius: 1.5,
        boxShadow: boxShadows.md,
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

      <Collapse in={showInput}>
        <Box
          sx={{
            borderTop: ({ palette }) =>
              comment.replies.length ? `1px solid ${palette.gray[20]}` : "none",
            px: 1,
            pt: comment.replies.length ? 1 : 0,
            pb: 0.75,
          }}
        >
          <Box
            sx={({ palette, transitions }) => ({
              border: `1px solid ${palette.gray[30]}`,
              borderRadius: 1.5,
              pl: 2,
              transition: transitions.create("border-color"),
              "&:focus-within": {
                borderColor: palette.blue[60],
              },
            })}
          >
            <CommentTextField
              ref={inputRef}
              onSubmit={submitComment}
              onClose={() => {
                setThreadFocused(false);
              }}
              editable
              onFocusChange={setInputFocused}
              onEmptyDoc={setInputDisabled}
              setValue={setInputValue}
              value={inputValue}
            />
          </Box>
        </Box>
      </Collapse>

      {JSON.stringify(inputValue)}

      <Collapse in={showInputButtons}>
        <Box
          sx={{
            display: "flex",
            gap: 0.75,
            justifyContent: "flex-end",
            px: 1,
            pt: 0,
            pb: 0.75,
          }}
        >
          <Button
            size="xs"
            variant="tertiary"
            onClick={() => {
              inputRef.current?.resetEditor();
            }}
          >
            Cancel
          </Button>
          <Button
            size="xs"
            variant="secondary"
            disabled={inputDisabled}
            onClick={submitComment}
            loading={loading}
          >
            Reply
          </Button>
        </Box>
      </Collapse>

      <Collapse in={showInput}>
        <Box pb={0.25} />
      </Collapse>
    </Box>
  );
};
