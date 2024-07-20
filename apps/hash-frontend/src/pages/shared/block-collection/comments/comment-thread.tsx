import type { FunctionComponent, useMemo, useRef, useState } from "react";
import type { EntityId } from "@local/hash-graph-types/entity";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { UserProperties } from "@local/hash-isomorphic-utils/system-types/user";
import type { TextToken } from "@local/hash-isomorphic-utils/types";
import type { AccountEntityId, extractAccountId } from "@local/hash-subgraph";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Box, buttonClasses, Collapse } from "@mui/material";

import { useCreateComment } from "../../../../components/hooks/use-create-comment";
import type { PageThread } from "../../../../components/hooks/use-page-comments";
import { Button } from "../../../../shared/ui";
import { useAuthenticatedUser } from "../../auth-info-context";

import { CommentActionButtons } from "./comment-action-buttons";
import { CommentBlock } from "./comment-block";
import { CommentTextField } from "./comment-text-field";
import styles from "./style.module.css";

const UNCOLLAPSIBLE_REPLIES_NUMBER = 2;

interface CommentThreadProps {
  pageId: EntityId;
  comment: PageThread;
}

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

  const showInput = threadFocused || inputValue.length > 0;
  const showInputButtons =
    (threadFocused && inputFocused) || inputValue.length > 0;

  const { authenticatedUser } = useAuthenticatedUser();

  const cancelSubmit = () => {
    setInputValue([]);
    threadRef.current?.focus();
  };

  const handleReplySubmit = async () => {
    if (!loading && inputValue.length > 0) {
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
      sx={({ palette, boxShadows }) => ({
        width: 320,
        background: palette.white,
        borderRadius: 1.5,
        boxShadow: boxShadows.md,
        marginBottom: 4,
        outline: "none",
      })}
      onFocus={() => {
        setThreadFocused(true);
      }}
      onBlur={() => {
        setThreadFocused(false);
      }}
    >
      <CommentBlock
        key={comment.metadata.recordId.entityId}
        pageId={pageId}
        comment={comment}
        resolvable={
          /**
           * @see https://linear.app/hash/issue/H-3003
           * @todo The provenance fields shouldn't be used for this.
           */
          authenticatedUser.accountId === authorId ||
          authenticatedUser.accountId ===
            comment.parent.metadata.provenance.edition.createdById
        }
      />

      {collapsedReplies.length > 0 ? (
        <>
          <Button
            variant={"tertiary"}
            size={"small"}
            endIcon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
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
            onClick={() => {
              setExpanded(!expanded);
            }}
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
              comment.replies.length > 0
                ? `1px solid ${palette.gray[20]}`
                : "none",
            px: 1,
            pt: comment.replies.length > 0 ? 1 : 0,
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
              editable={!loading}
              className={styles.Comment__TextField_editable}
              onClose={cancelSubmit}
              onSubmit={handleReplySubmit}
              onFocusChange={setInputFocused}
              onChange={setInputValue}
            />
          </Box>
        </Box>
      </Collapse>

      <Collapse in={showInputButtons}>
        <CommentActionButtons
          submitDisabled={inputValue.length === 0}
          loading={loading}
          loadingText={"Saving..."}
          sx={{ px: 1, pt: 0, pb: 0.75 }}
          submitLabel={"Reply"}
          onSubmit={handleReplySubmit}
          onCancel={cancelSubmit}
        />
      </Collapse>

      <Collapse in={showInput}>
        <Box pb={0.25} />
      </Collapse>
    </Box>
  );
};
