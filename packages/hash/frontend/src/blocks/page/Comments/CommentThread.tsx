import { FunctionComponent, useState, useRef, useMemo } from "react";
import { TextToken } from "@hashintel/hash-shared/graphql/types";
import { Box, buttonClasses, Collapse } from "@mui/material";
import { Button } from "@hashintel/hash-design-system";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { PageThread } from "../../../components/hooks/usePageComments";
import { CommentTextField, CommentTextFieldRef } from "./CommentTextField";
import { CommentBlock } from "./CommentBlock";
import styles from "./style.module.css";

const UNCOLLAPSIBLE_REPLIES_NUMBER = 2;

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
  const threadRef = useRef<HTMLDivElement>(null);
  const [threadFocused, setThreadFocused] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [inputValue, setInputValue] = useState<TextToken[]>([]);

  const showInput = threadFocused || !!inputValue.length;
  const showInputButtons =
    (threadFocused && inputFocused) || !!inputValue.length;

  const cancelSubmit = () => {
    inputRef.current?.resetDocument();
    threadRef.current?.focus();
  };

  const submitComment = async () => {
    if (!loading && inputValue?.length) {
      await createComment(comment.entityId, inputValue).then(() => {
        inputRef.current?.resetDocument();
      });
    }
  };

  const [collapsedReplies, uncollapsibleReplies] = useMemo(() => {
    const replies = [...comment.replies];
    const lastItems = replies.splice(
      replies.length - UNCOLLAPSIBLE_REPLIES_NUMBER,
      UNCOLLAPSIBLE_REPLIES_NUMBER,
    );
    return [replies, lastItems];
  }, [comment]);

  return (
    <Box
      ref={threadRef}
      tabIndex={0}
      onFocus={() => setThreadFocused(true)}
      onBlur={() => setThreadFocused(false)}
      sx={({ palette, boxShadows }) => ({
        width: 320,
        background: palette.white,
        borderRadius: 1.5,
        boxShadow: boxShadows.md,
        marginBottom: 4,
        outline: "none",
      })}
    >
      <CommentBlock key={comment.entityId} comment={comment} />

      {collapsedReplies.length ? (
        <>
          <Button
            variant="tertiary"
            onClick={() => setExpanded(!expanded)}
            size="small"
            sx={({ palette }) => ({
              minHeight: 0,
              height: 40,
              width: 1,
              borderRadius: 0,
              border: "none",
              borderTop: `1px solid ${palette.gray[20]}`,
              [`.${buttonClasses.endIcon}`]: {
                ml: 0.5,
                color: palette.gray[70],
                fontSize: 20,
              },
            })}
            endIcon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          >
            {expanded
              ? "Show fewer responses"
              : `Show all ${comment.replies.length} responses`}
          </Button>
          <Collapse in={expanded}>
            {collapsedReplies.map((reply) => (
              <Box
                key={reply.entityId}
                sx={{
                  borderTop: ({ palette }) => `1px solid ${palette.gray[20]}`,
                }}
              >
                <CommentBlock comment={reply} />
              </Box>
            ))}
          </Collapse>
        </>
      ) : null}

      {uncollapsibleReplies.map((reply) => (
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
              placeholder={`Reply to ${
                // TODO: REPLACE WITH ACTUAL TYPED PROPERTY URI
                (comment.author?.properties as any)[
                  "http://localhost:3000/@example/types/property-type/preferred-name/"
                ]
              }`}
              onClose={cancelSubmit}
              onSubmit={submitComment}
              editable={!loading}
              onFocusChange={setInputFocused}
              onChange={setInputValue}
              classNames={styles.Comment__TextField_editable}
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
        >
          <Button size="xs" variant="tertiary" onClick={cancelSubmit}>
            Cancel
          </Button>
          <Button
            size="xs"
            variant="secondary"
            disabled={!inputValue.length}
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
