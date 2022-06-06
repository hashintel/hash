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
  Box,
} from "@mui/material";
import { format } from "date-fns";
import { startCase } from "lodash";
import * as React from "react";
import { LinkIcon, PullRequestIcon } from "./icons";
import { GithubPullRequest, GithubReview } from "./types";

const NODE_COLORS = {
  opened: theme.palette.gray[40],
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

// @todo make popover come on hover instead of onClick
export const TimelineItem: React.FC<TimelineItemProps> = ({
  event,
  color,
  hideConnector,
  setTimelineOpacity,
}) => {
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);

  //   const color = React.useMemo(() => {}, [[event]]);

  return (
    <BaseTimelineItem className="timelineItem">
      <TimelineOppositeContent
        sx={({ typography, palette }) => ({
          flex: "unset",
          fontWeight: 500,
          ...typography.microText,
          py: 0.75,
          px: 0,
          mr: 1.5,
          color: palette.gray[80],
          alignSelf: "flex-start",
        })}
        color="text.secondary"
      >
        {event.created_at && format(new Date(event.created_at), "do MMM")}
      </TimelineOppositeContent>

      <TimelineSeparator sx={{ width: 30, flex: "unset" }}>
        {["opened", "merged", "closed"].includes(event.event) ? (
          <Box
            onMouseEnter={(evt) => {
              setAnchorEl(evt.currentTarget);
              setTimelineOpacity(true);
            }}
            sx={({ palette }) => ({
              height: 28,
              width: 28,
              borderRadius: "50%",
              backgroundColor: palette.white,
              border: `1px solid ${palette.gray[40]}`,
              color: palette.gray[40],
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              svg: {
                fontSize: 12,
              },
            })}
          >
            <PullRequestIcon />
          </Box>
        ) : (
          <TimelineDot
            sx={{
              alignSelf: "center",
            }}
            onMouseEnter={(evt) => {
              setAnchorEl(evt.currentTarget);
              setTimelineOpacity(true);
            }}
            color={color}
          />
        )}

        {hideConnector ? null : (
          <TimelineConnector
            sx={({ palette }) => ({
              color: palette.gray[40],
              width: "1px",
              my: 0.25,
              height: 34,
            })}
          />
        )}
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
        open={!!anchorEl}
        // open={showPopover}
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
          mb={0.5}
          position="relative"
        >
          <Typography variant="smallTextLabels" fontWeight={500}>
            {startCase(event.event)}
          </Typography>
          {event.html_url && (
            <IconButton
              href={event.html_url}
              sx={{ position: "absolute", top: 0, right: 0 }}
            >
              <LinkIcon />
            </IconButton>
          )}
        </Stack>
        <Typography
          sx={({ palette }) => ({
            color: palette.gray[60],
            mb: 1.5,
            display: "inline-block",
          })}
          variant="microText"
        >
          {event.created_at &&
            format(new Date(event.created_at), "h:mm b 'on' do MMM yyyy")}
        </Typography>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Avatar
            sx={{ height: 22, width: 22 }}
            src={event.actor?.avatar_url}
          />
          <Typography
            sx={({ palette }) => ({
              color: palette.gray[70],
              fontWeight: 500,
            })}
            variant="microText"
          >
            For {event.actor?.login}
          </Typography>
        </Stack>
      </Popover>
    </BaseTimelineItem>
  );
};
