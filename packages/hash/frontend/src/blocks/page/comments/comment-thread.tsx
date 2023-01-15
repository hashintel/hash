import { extractBaseUri } from "@blockprotocol/type-system";
import { Button } from "@local/hash-design-system";
import { TextToken } from "@local/hash-isomorphic-utils/graphql/types";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import {
  AccountId,
  EntityId,
  extractEntityUuidFromEntityId,
  Uuid,
} from "@local/hash-isomorphic-utils/types";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Box, buttonClasses, Collapse } from "@mui/material";
import { FunctionComponent, useMemo, useRef, useState } from "react";

import { useCreateComment } from "../../../components/hooks/use-create-comment";
import { PageThread } from "../../../components/hooks/use-page-comments";
import { useAuthenticatedUser } from "../../../pages/shared/auth-info-context";
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
      await createReply(
        comment.metadata.editionId.baseId as EntityId,
        inputValue,
      );
      setInputValue([]);
    }
  };

  const [collapsedReplies, uncollapsibleReplies] = useMemo(() => {
    const replies = [...comment.replies].sort((replyA, replyB) =>
      replyA.metadata.version.decisionTime.start.localeCompare(
        replyB.metadata.version.decisionTime.start,
      ),
    );
    const lastItems = replies.splice(
      replies.length - UNCOLLAPSIBLE_REPLIES_NUMBER,
      UNCOLLAPSIBLE_REPLIES_NUMBER,
    );
    return [replies, lastItems];
  }, [comment]);

  const preferredName = useMemo(
    () =>
      comment.author.properties[
        extractBaseUri(types.propertyType.preferredName.propertyTypeId)
      ],
    [comment.author.properties],
  );

  const authorId = useMemo(
    () =>
      extractEntityUuidFromEntityId(
        comment.author.metadata.editionId.baseId,
      ) as Uuid as AccountId,
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
        key={comment.metadata.editionId.baseId}
        pageId={pageId}
        comment={comment}
        resolvable={
          // TODO: The provenance fields shouldn't be used for this
          //   see https://app.asana.com/0/1201095311341924/1203466351235289/f
          authenticatedUser.accountId === authorId ||
          authenticatedUser.accountId ===
            comment.parent.metadata.provenance.updatedById
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
                key={reply.metadata.editionId.baseId}
                pageId={pageId}
                comment={reply}
              />
            ))}
          </Collapse>
        </>
      ) : null}

      {uncollapsibleReplies.map((reply) => (
        <CommentBlock
          key={reply.metadata.editionId.baseId}
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
              placeholder={`Reply to ${preferredName}`}
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
