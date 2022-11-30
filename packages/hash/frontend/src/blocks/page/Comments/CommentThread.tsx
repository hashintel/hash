import { FunctionComponent, useState, useRef, useMemo } from "react";
import { TextToken } from "@hashintel/hash-shared/graphql/types";
import { Box, buttonClasses, Collapse } from "@mui/material";
import { Button } from "@hashintel/hash-design-system";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { extractBaseUri } from "@blockprotocol/type-system-web";
import { types } from "@hashintel/hash-shared/types";
import { EntityId } from "@hashintel/hash-subgraph";
import { PageThread } from "../../../components/hooks/usePageComments";
import { CommentTextField } from "./CommentTextField";
import { CommentBlock } from "./CommentBlock";
import styles from "./style.module.css";
import { useCreateComment } from "../../../components/hooks/useCreateComment";
import { CommentActionButtons } from "./CommentActionButtons";
import { useAuthenticatedUser } from "../../../components/hooks/useAuthenticatedUser";

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
    if (!loading && inputValue?.length) {
      await createReply(comment.metadata.editionId.baseId, inputValue);
      setInputValue([]);
    }
  };

  const [collapsedReplies, uncollapsibleReplies] = useMemo(() => {
    const replies = [...comment.replies].sort((replyA, replyB) =>
      replyA.metadata.editionId.version.localeCompare(
        replyB.metadata.editionId.version,
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
    () => comment.author.metadata.editionId.baseId.split("%")[1],
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
          authenticatedUser?.userAccountId === authorId ||
          authenticatedUser?.userAccountId ===
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
