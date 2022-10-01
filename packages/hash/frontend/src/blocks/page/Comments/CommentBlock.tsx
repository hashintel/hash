import { FunctionComponent, useState } from "react";
import { Box, Link, Typography } from "@mui/material";
import {
  Avatar,
  FontAwesomeIcon,
  IconButton,
} from "@hashintel/hash-design-system/ui";
import { formatDistanceToNowStrict } from "date-fns";
import { PageComment } from "../../../components/hooks/usePageComments";
import { CommentTextField } from "./CommentTextField";
import {
  faChevronDown,
  faChevronUp,
  faEllipsisVertical,
} from "@fortawesome/free-solid-svg-icons";
import { CommentBlockMenu } from "./CommentBlockMenu";
import { usePopupState } from "material-ui-popup-state/hooks";
import { bindTrigger } from "material-ui-popup-state";

type CommentProps = {
  comment: PageComment;
};

export const CommentBlock: FunctionComponent<CommentProps> = ({ comment }) => {
  const { tokens, author, textUpdatedAt } = comment;
  const [expanded, setExpanded] = useState(false);

  const commentMenuPopupState = usePopupState({
    variant: "popover",
    popupId: "comment-block-menu",
  });

  return (
    <Box>
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
            {`${formatDistanceToNowStrict(new Date(textUpdatedAt))} ago`}
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

      <CommentTextField initialText={tokens} expanded={expanded} />

      {expanded ? (
        <Link
          variant="microText"
          sx={{
            display: "flex",
            alignItems: "center",
            fontWeight: 600,
            textDecoration: "none",
            cursor: "pointer",
          }}
          onClick={() => setExpanded(false)}
        >
          Show Less
          <FontAwesomeIcon icon={faChevronUp} sx={{ fontSize: 12, ml: 0.75 }} />
        </Link>
      ) : (
        <Link
          variant="microText"
          sx={{
            display: "flex",
            alignItems: "center",
            fontWeight: 600,
            textDecoration: "none",
            cursor: "pointer",
          }}
          onClick={() => setExpanded(true)}
        >
          Show More
          <FontAwesomeIcon
            icon={faChevronDown}
            sx={{ fontSize: 12, ml: 0.75 }}
          />
        </Link>
      )}

      <CommentBlockMenu popupState={commentMenuPopupState} />
    </Box>
  );
};
