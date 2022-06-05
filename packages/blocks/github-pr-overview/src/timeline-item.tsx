import { theme } from "@hashintel/hash-design-system";
import { Link } from "@mui/icons-material";
import {
  TimelineConnector,
  TimelineContent,
  TimelineDot,
  TimelineItem as BaseTimelineItem,
  TimelineItemProps as BaseTimelineItemProps,
  TimelineOppositeContent,
  TimelineSeparator,
} from "@mui/lab";
import {
  Tooltip,
  Button,
  Popover,
  Typography,
  Stack,
  Avatar,
  IconButton,
} from "@mui/material";
import { format } from "date-fns";
import { startCase } from "lodash";
import * as React from "react";
import { GithubPullRequest, GithubReview } from "./types";

const NODE_COLORS = {
  reviewed: theme.palette.blue[50],
  review_requested: theme.palette.orange[50],
  mentioned: theme.palette.red[50],
  deployed: theme.palette.purple[60],
};

// @todo properly type this
type Event = {
  id: number | null | undefined;
  event:
    | "opened"
    | "reviewed"
    | "review_requested"
    | "ready_for_review"
    | "closed"
    | "merged"
    | string;
  created_at: string | null | undefined;
  html_url?: string | null | undefined;
  actor: GithubPullRequest["user"] | GithubReview["user"];
};

export type TimelineItemProps = {
  color:
    | "inherit"
    | "grey"
    | "primary"
    | "secondary"
    | "error"
    | "info"
    | "success"
    | "warning";
  event: Event;
  hideConnector?: boolean;
  setTimelineOpacity: (val: boolean) => void;
  showPopover: boolean;
} & BaseTimelineItemProps;

// @todo consider extracting this
export const TimelineItem: React.FC<TimelineItemProps> = ({
  event,
  color,
  hideConnector,
  setTimelineOpacity,
  showPopover,
}) => {
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);

  //   const color = React.useMemo(() => {}, [[event]]);

  return (
    <BaseTimelineItem className="timelineItem">
      <TimelineOppositeContent sx={{ flex: "unset" }} color="text.secondary">
        {event.created_at && format(new Date(event.created_at), "do MMM")}
      </TimelineOppositeContent>

      <TimelineSeparator>
        <TimelineDot
          ref={(el) => setAnchorEl(el)}
          onClick={(evt) => {
            setAnchorEl(evt.currentTarget);
            setTimelineOpacity(true);
          }}
          color={color}
        />
        {hideConnector ? null : <TimelineConnector />}
      </TimelineSeparator>
      <TimelineContent>
        <Tooltip
          title={
            <>
              {event.actor?.login != null ? (
                <span>Actor: {event.actor.login}</span>
              ) : null}
              {event.html_url != null && typeof event.html_url === "string" ? (
                <>
                  <br />
                  <Button
                    startIcon={<Link />}
                    href={event.html_url}
                    variant="primary"
                    size="small"
                  >
                    Link
                  </Button>
                </>
              ) : null}
            </>
          }
        >
          {/* Even though this span isn't in a list, React complains about list elements needing unique keys unless 
                    we add a key here. Assuming it's because of some weird behavior of the Tooltip */}
          <span key={`LABEL_${event.id?.toString()}`}>
            {startCase(event.event)}
          </span>
        </Tooltip>
      </TimelineContent>
      <Popover
        // open={!!anchorEl}
        open={showPopover}
        anchorEl={anchorEl}
        onClose={() => {
          setAnchorEl(null);
          setTimelineOpacity(false);
        }}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "left",
        }}
        PaperProps={{
          sx: ({ palette }) => ({
            borderTop: `4px solid ${NODE_COLORS[event.event]}`,
            padding: "12px 16px",
            width: 250,
          }),
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          mb={1}
        >
          <Typography>{startCase(event.event)}</Typography>
          {event.html_url && (
            <IconButton href={event.html_url}>
              <Link />
            </IconButton>
          )}
        </Stack>
        <Typography mb={1.5}>
          {event.created_at && format(new Date(event.created_at), "do MMM")}
        </Typography>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Avatar
            sx={{ height: 22, width: 22 }}
            src={event.actor?.avatar_url}
          />
          <Typography>For {event.actor?.login}</Typography>
        </Stack>
      </Popover>
    </BaseTimelineItem>
  );
};
