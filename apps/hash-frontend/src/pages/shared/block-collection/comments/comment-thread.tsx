import type { EntityId } from "@local/hash-graph-types/entity";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { UserProperties } from "@local/hash-isomorphic-utils/system-types/user";
import type { TextToken } from "@local/hash-isomorphic-utils/types";
import type { AccountEntityId } from "@local/hash-subgraph";
import { extractAccountId } from "@local/hash-subgraph";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Box, buttonClasses, Collapse } from "@mui/material";
import type { FunctionComponent } from "react";
import { useMemo, useRef, useState } from "react";

import { useCreateComment } from "../../../../components/hooks/use-create-comment";
import type { PageThread } from "../../../../components/hooks/use-page-comments";
import { Button } from "../../../../shared/ui";
import { useAuthenticatedUser } from "../../auth-info-context";
import { CommentActionButtons } from "./comment-action-buttons";
import { CommentBlock } from "./comment-block";
import { CommentTextField } from "./comment-text-field";
import styles from "./style.module.css";

const UNCOLLAPSIBLE_REPLIES_NUMBER = 2;

type CommentThreadProps = {
  pageId: EntityId;
  comment: PageThread;
};

export const CommentThread: FunctionComponent<CommentThreadProps> = ({
  pageId,
  comment,
}) => {
  const threadRef = useRef<HTMLDivElement>(null);
  const [threadFocused, setThreadFocused] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [inputValue, setInputValue] = useState<TextToken[]>([]);

  const [createReply, { loading }] = useCreateComment(pageId);

  const showInput = threadFocused || !!inputValue.length;
  const showInputButtons =
    (threadFocused && inputFocused) || !!inputValue.length;

  const { authenticatedUser } = useAuthenticatedUser();

  const cancelSubmit = () => {
    setInputValue([]);
    threadRef.current?.focus();
  };

  const handleReplySubmit = async () => {
    if (!loading && inputValue.length) {
      await createReply(comment.metadata.recordId.entityId, inputValue);
      setInputValue([]);
    }
  };

  const [collapsedReplies, uncollapsibleReplies] = useMemo(() => {
    const replies = comment.replies.toSorted((replyA, replyB) =>
      replyA.metadata.temporalVersioning.decisionTime.start.limit.localeCompare(
        replyB.metadata.temporalVersioning.decisionTime.start.limit,
      ),
    );
    const lastItems = replies.splice(
      replies.length - UNCOLLAPSIBLE_REPLIES_NUMBER,
      UNCOLLAPSIBLE_REPLIES_NUMBER,
    );
    return [replies, lastItems];
  }, [comment]);

  const displayName = useMemo(
    () =>
      simplifyProperties(comment.author.properties as UserProperties)
        .displayName,
    [comment.author.properties],
  );

  const authorId = useMemo(
    () =>
      extractAccountId(
        comment.author.metadata.recordId.entityId as AccountEntityId,
      ),
    [comment.author],
  );

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
      <CommentBlock
        key={comment.metadata.recordId.entityId}
        pageId={pageId}
        comment={comment}
        resolvable={
          /**
           * @todo The provenance fields shouldn't be used for this
           * @see https://linear.app/hash/issue/H-3003
           */
          authenticatedUser.accountId === authorId ||
          authenticatedUser.accountId ===
            comment.parent.metadata.provenance.edition.createdById
        }
      />

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
              <CommentBlock
                key={reply.metadata.recordId.entityId}
                pageId={pageId}
                comment={reply}
              />
            ))}
          </Collapse>
        </>
      ) : null}

      {uncollapsibleReplies.map((reply) => (
        <CommentBlock
          key={reply.metadata.recordId.entityId}
          pageId={pageId}
          comment={reply}
        />
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
              value={inputValue}
              placeholder={`Reply to ${displayName}`}
              onClose={cancelSubmit}
              onSubmit={handleReplySubmit}
              editable={!loading}
              onFocusChange={setInputFocused}
              onChange={setInputValue}
              className={styles.Comment__TextField_editable}
            />
          </Box>
        </Box>
      </Collapse>

      <Collapse in={showInputButtons}>
        <CommentActionButtons
          submitDisabled={!inputValue.length}
          loading={loading}
          loadingText="Saving..."
          onSubmit={handleReplySubmit}
          onCancel={cancelSubmit}
          sx={{ px: 1, pt: 0, pb: 0.75 }}
          submitLabel="Reply"
        />
      </Collapse>

      <Collapse in={showInput}>
        <Box pb={0.25} />
      </Collapse>
    </Box>
  );
};
