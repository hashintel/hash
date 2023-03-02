import { faCheckCircle } from "@fortawesome/free-regular-svg-icons";
import {
  faChevronDown,
  faChevronUp,
  faEllipsisVertical,
  faLink,
  faPencil,
  faTrash,
  IconDefinition,
} from "@fortawesome/free-solid-svg-icons";
import {
  Avatar,
  Button,
  FontAwesomeIcon,
  IconButton,
  LoadingSpinner,
} from "@hashintel/design-system";
import { TextToken } from "@local/hash-graphql-shared/graphql/types";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import { EntityId } from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { Box, Collapse, Tooltip, Typography } from "@mui/material";
import { formatDistanceToNowStrict } from "date-fns";
import { isEqual } from "lodash";
import { bindTrigger } from "material-ui-popup-state";
import { usePopupState } from "material-ui-popup-state/hooks";
import {
  FunctionComponent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useDeleteComment } from "../../../components/hooks/use-delete-comment";
import { PageComment } from "../../../components/hooks/use-page-comments";
import { useResolveComment } from "../../../components/hooks/use-resolve-comment";
import { useUpdateCommentText } from "../../../components/hooks/use-update-comment-text";
import { useAuthenticatedUser } from "../../../pages/shared/auth-info-context";
import { PencilSlashIcon } from "../../../shared/icons/pencil-slash-icon";
import { CommentActionButtons } from "./comment-action-buttons";
import { CommentBlockDeleteConfirmationDialog } from "./comment-block-delete-confirmation-dialog";
import { CommentBlockMenu } from "./comment-block-menu";
import { CommentBlockMenuItem } from "./comment-block-menu-item";
import { CommentTextField } from "./comment-text-field";
import styles from "./style.module.css";

type ToggleTextExpandedButtonProps = {
  label: ReactNode;
  icon: IconDefinition;
  onClick: () => void;
};

export const ToggleTextExpandedButton: FunctionComponent<
  ToggleTextExpandedButtonProps
> = ({ label, icon, onClick }) => (
  <Button
    size="xs"
    variant="tertiary_quiet"
    sx={{
      display: "flex",
      fontWeight: 600,
      px: 0.5,
      py: 0,
      minHeight: 0,
      color: ({ palette }) => palette.primary.main,
      alignSelf: "flex-end",
    }}
    onClick={onClick}
  >
    {label}
    <FontAwesomeIcon icon={icon} sx={{ fontSize: 12, ml: 0.75 }} />
  </Button>
);

type CommentProps = {
  pageId: EntityId;
  comment: PageComment;
  resolvable?: boolean;
};

export const CommentBlock: FunctionComponent<CommentProps> = ({
  pageId,
  comment,
  resolvable,
}) => {
  const {
    metadata: {
      recordId: { entityId },
      // TODO: The provenance fields shouldn't be used for this
      //   see https://app.asana.com/0/1201095311341924/1203466351235289/f
      provenance: { updatedById: commentCreatedById },
    },
    hasText,
    author,
    textUpdatedAt,
  } = comment;

  const commentEntityId = entityId;

  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [collapsed, setCollapsed] = useState(true);
  const [shouldCollapse, setShouldCollapse] = useState(false);
  const [editable, setEditable] = useState(false);
  const [inputValue, setInputValue] = useState<TextToken[]>(hasText);
  const [deleteConfirmationDialogOpen, setDeleteConfirmationDialogOpen] =
    useState(false);

  const { authenticatedUser } = useAuthenticatedUser();
  const [updateCommentText, { loading: updateCommentTextLoading }] =
    useUpdateCommentText(pageId);
  const [resolveComment, { loading: resolveCommentLoading }] =
    useResolveComment(pageId);
  const [deleteComment, { loading: deleteCommentLoading }] =
    useDeleteComment(pageId);

  useEffect(() => {
    setInputValue(hasText);
  }, [hasText]);

  const commentCreatedAt = useMemo(() => {
    // @todo: replace this with the createdAt from the comment entity
    const updatedAt = new Date(textUpdatedAt.decisionTime.start.limit);
    const timeDistance = formatDistanceToNowStrict(updatedAt);
    return timeDistance === "0 seconds"
      ? "Just now"
      : `${formatDistanceToNowStrict(updatedAt)} ago`;
  }, [textUpdatedAt]);

  const commentMenuPopupState = usePopupState({
    variant: "popover",
    popupId: "comment-block-menu",
  });

  const preferredName = useMemo(
    () =>
      author.properties[
        extractBaseUrl(types.propertyType.preferredName.propertyTypeId)
      ] as string,
    [author.properties],
  );

  const submitUpdateDisabled = useMemo(
    () => isEqual(hasText, inputValue),
    [hasText, inputValue],
  );

  const resetCommentText = () => {
    setInputValue(hasText);
    setEditable(false);
  };

  const handleEditComment = async () => {
    if (!submitUpdateDisabled) {
      await updateCommentText(commentEntityId, inputValue);
      resetCommentText();
    }
  };

  const onLineCountChange = useCallback(
    (lines: number) => !editable && setShouldCollapse(lines > 2),
    [editable, setShouldCollapse],
  );

  return (
    <Box
      ref={(ref: HTMLDivElement) => setContainer(ref)}
      sx={{
        display: "flex",
        flexDirection: "column",
        position: "relative",
        p: 2,
        borderTop: ({ palette }) => `1px solid ${palette.gray[20]}`,
        minHeight: deleteConfirmationDialogOpen ? 140 : 0,
        transition: ({ transitions }) => transitions.create("min-height"),

        ":first-of-type": {
          borderTopWidth: 0,
        },
      }}
    >
      <Box display="flex" justifyContent="space-between">
        {/* eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment */}
        <Avatar size={36} title={preferredName ?? "U"} />
        <Box
          sx={{ flexDirection: "column", flex: 1, overflow: "hidden", pl: 1.5 }}
        >
          <Typography
            component="p"
            variant="microText"
            sx={{
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
              overflow: "hidden",
              fontWeight: 500,
              color: ({ palette }) => palette.gray[90],
            }}
          >
            {preferredName}
          </Typography>
          <Typography
            component="p"
            variant="microText"
            sx={{
              color: ({ palette }) => palette.gray[70],
            }}
          >
            {commentCreatedAt}
          </Typography>
        </Box>

        {resolvable ? (
          <Box
            sx={({ palette }) => ({
              height: 1,
              mr: 0.5,
              p: 0.25,
              color: resolveCommentLoading
                ? palette.primary.main
                : palette.gray[40],
            })}
          >
            {resolveCommentLoading ? (
              <LoadingSpinner size={18} />
            ) : (
              <Tooltip title="Resolve Comment Thread" placement="bottom">
                <IconButton
                  onClick={() => resolveComment(commentEntityId)}
                  size="medium"
                  sx={({ palette, transitions }) => ({
                    p: 0,
                    transition: transitions.create("color"),
                    "&:hover": {
                      color: palette.primary.main,
                      background: "none",
                    },
                  })}
                  disabled={resolveCommentLoading}
                >
                  <FontAwesomeIcon
                    icon={faCheckCircle}
                    sx={{ fontSize: "18px !important" }}
                  />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        ) : null}

        <Tooltip title="Edit, delete and more" placement="bottom">
          <IconButton
            {...bindTrigger(commentMenuPopupState)}
            sx={{
              width: 24,
              height: 24,
              color: ({ palette }) => palette.gray[40],
            }}
          >
            <FontAwesomeIcon icon={faEllipsisVertical} />
          </IconButton>
        </Tooltip>
      </Box>

      <Box p={0.5} pt={2} position="relative">
        <Box
          sx={({ palette, transitions }) => ({
            border: `${editable ? 1 : 0}px solid ${palette.gray[30]}`,
            pl: editable ? 2 : 0,
            borderRadius: 1.5,
            transition: transitions.create(["padding", "border-color"]),
            "&:focus-within": {
              borderColor: palette.blue[60],
            },
          })}
        >
          <CommentTextField
            onLineCountChange={onLineCountChange}
            value={inputValue}
            className={`${styles.Comment__TextField} ${
              editable
                ? styles.Comment__TextField_editable
                : collapsed
                ? styles.Comment__TextField_collapsed!
                : ""
            }`}
            editable={editable}
            readOnly={!editable}
            placeholder="Edit comment"
            onClose={resetCommentText}
            onSubmit={handleEditComment}
            onChange={setInputValue}
          />
        </Box>

        <Collapse in={editable}>
          <CommentActionButtons
            submitDisabled={submitUpdateDisabled}
            loading={updateCommentTextLoading}
            loadingText="Saving..."
            onSubmit={handleEditComment}
            onCancel={resetCommentText}
            sx={{ pt: 0.75 }}
          />
        </Collapse>

        {!editable && shouldCollapse && collapsed ? (
          <Box
            sx={{
              display: "flex",
              flexDirection: "row",
              position: "absolute",
              bottom: 4,
              right: 0,
              background:
                "linear-gradient(90deg, transparent 0, rgba(255,255,255,1) 16px, rgba(255,255,255,1) 100%)",
            }}
          >
            <Typography
              sx={{
                fontSize: 14,
                lineHeight: "150%",
                paddingRight: 1,
                paddingLeft: 2,
              }}
            >
              ...
            </Typography>
            <ToggleTextExpandedButton
              label="Show More"
              icon={faChevronDown}
              onClick={() => setCollapsed(false)}
            />
          </Box>
        ) : null}
      </Box>

      {!editable && shouldCollapse && !collapsed ? (
        <ToggleTextExpandedButton
          label="Show Less"
          icon={faChevronUp}
          onClick={() => setCollapsed(true)}
        />
      ) : null}

      <CommentBlockMenu popupState={commentMenuPopupState}>
        {authenticatedUser.accountId === commentCreatedById ? (
          <CommentBlockMenuItem
            title={editable ? "Cancel Edit" : "Edit"}
            icon={
              editable ? (
                <PencilSlashIcon sx={{ fontSize: 16 }} />
              ) : (
                <FontAwesomeIcon icon={faPencil} />
              )
            }
            onClick={() => {
              setEditable(!editable);
              setCollapsed(false);
              setShouldCollapse(false);
              commentMenuPopupState.close();
            }}
          />
        ) : null}
        <CommentBlockMenuItem
          title="Copy Link"
          icon={<FontAwesomeIcon icon={faLink} />}
          // @todo Commented implement functionality
          onClick={() => {
            commentMenuPopupState.close();
          }}
        />
        {authenticatedUser.accountId === commentCreatedById ? (
          <CommentBlockMenuItem
            title="Delete Comment"
            icon={<FontAwesomeIcon icon={faTrash} />}
            onClick={() => {
              setDeleteConfirmationDialogOpen(true);
              commentMenuPopupState.close();
            }}
          />
        ) : null}
      </CommentBlockMenu>

      <CommentBlockDeleteConfirmationDialog
        container={container}
        open={deleteConfirmationDialogOpen}
        loading={deleteCommentLoading}
        onDelete={async () => await deleteComment(commentEntityId)}
        onCancel={() => setDeleteConfirmationDialogOpen(false)}
      />
    </Box>
  );
};
