import { FunctionComponent, useState, useRef } from "react";
import { TextToken } from "@hashintel/hash-shared/graphql/types";
import { Box, Collapse } from "@mui/material";
import { PageThread } from "../../../components/hooks/usePageComments";
import { CommentTextField, CommentTextFieldRef } from "./CommentTextField";
import { CommentBlock } from "./CommentBlock";
import { Button } from "../../../shared/ui";

type CommentThreadProps = {
  comment: PageThread;
  onClose?: () => void;
  onSubmit: (parentId: string, content: TextToken[]) => Promise<void>;
};

export const CommentThread: FunctionComponent<CommentThreadProps> = ({
  comment,
  onClose,
  onSubmit,
}) => {
  const inputRef = useRef<CommentTextFieldRef>(null);
  const [threadFocused, setThreadFocused] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [inputDisabled, setInputDisabled] = useState(false);

  const showInput = threadFocused || !inputRef.current?.empty;
  const showInputButtons =
    (threadFocused && inputFocused) || !inputRef.current?.empty;

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
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <Button
            size="xs"
            variant="tertiary"
            onClick={() => {
              setThreadFocused(false);
              // setInputFocused(false);
            }}
          >
            Cancel
          </Button>
          <Button
            size="xs"
            variant="secondary"
            disabled={inputDisabled}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              inputRef.current?.submit();
            }}
            loading={inputRef.current?.loading}
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
