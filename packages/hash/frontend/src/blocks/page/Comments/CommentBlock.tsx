import { FunctionComponent, useMemo } from "react";
import { Box, Typography } from "@mui/material";
import {
  Avatar,
  FontAwesomeIcon,
  IconButton,
} from "@hashintel/hash-design-system/ui";
import { formatDistanceToNowStrict } from "date-fns";
import { faEllipsisVertical } from "@fortawesome/free-solid-svg-icons";
import { usePopupState } from "material-ui-popup-state/hooks";
import { bindTrigger } from "material-ui-popup-state";
import { PageComment } from "../../../components/hooks/usePageComments";
import { CommentTextField } from "./CommentTextField";
import { CommentBlockMenu } from "./CommentBlockMenu";

type CommentProps = {
  comment: PageComment;
};

export const CommentBlock: FunctionComponent<CommentProps> = ({ comment }) => {
  const { tokens, author, createdAt } = comment;

  const commentCreatedAt = useMemo(
    () => `${formatDistanceToNowStrict(new Date(createdAt))} ago`,
    [createdAt],
  );

  const commentMenuPopupState = usePopupState({
    variant: "popover",
    popupId: "comment-block-menu",
  });

  return (
    <Box flexDirection="column" p={2}>
      <Box display="flex" justifyContent="space-between">
        <Avatar size={36} title={author?.properties.preferredName ?? "U"} />
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
            {author?.properties.preferredName}
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

        <IconButton
          {...bindTrigger(commentMenuPopupState)}
          sx={{
            color: ({ palette }) => palette.gray[40],
          }}
        >
          <FontAwesomeIcon icon={faEllipsisVertical} />
        </IconButton>
      </Box>

      <Box p={0.5} pt={2}>
        <CommentTextField initialText={tokens} collapsible />
      </Box>

      <CommentBlockMenu popupState={commentMenuPopupState} />
    </Box>
  );
};
