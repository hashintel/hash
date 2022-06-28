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
  Popover,
  Typography,
  Stack,
  Avatar,
  IconButton,
  Box,
  Tooltip,
} from "@mui/material";
import { format } from "date-fns";
import { startCase } from "lodash";
import * as React from "react";
import {
  LinkIcon,
  PullRequestClosedIcon,
  PullRequestMergedIcon,
  PullRequestOpenIcon,
} from "../icons";
import { GithubPullRequestEntityType, GithubReviewEntityType } from "../types";
import { getEventTypeColor } from "../utils";

// @todo properly type this
type Event = {
  id?: number | null | undefined;
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
  actor:
    | GithubPullRequestEntityType["properties"]["user"]
    | GithubReviewEntityType["properties"]["user"];
};

export type TimelineItemProps = {
  event: Event;
  hideConnector?: boolean;
  setTimelineOpacity: (val: boolean) => void;
  hideDate?: boolean;
} & BaseTimelineItemProps;

export const TimelineItem: React.FC<TimelineItemProps> = ({
  event,
  hideConnector,
  setTimelineOpacity,
  hideDate,
}) => {
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);

  //   const color = React.useMemo(() => {}, [[event]]);

  const copyToClipboard = (link: string | null | undefined) => {
    if (link) {
      void navigator.clipboard.writeText(link);
    }
  };

  return (
    <BaseTimelineItem className="timelineItem">
      <TimelineOppositeContent
        sx={({ typography, palette }) => ({
          flex: "unset",
          ...typography.microText,
          fontWeight: 500,
          py: 0.75,
          px: 0,
          mr: 1.5,
          color: palette.gray[80],
          alignSelf: "flex-start",
          opacity: hideDate ? 0 : 1,
        })}
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
            {event.event === "opened" ? (
              <PullRequestOpenIcon />
            ) : event.event === "closed" ? (
              <PullRequestClosedIcon />
            ) : (
              <PullRequestMergedIcon />
            )}
          </Box>
        ) : (
          <TimelineDot
            sx={{
              alignSelf: "center",
              backgroundColor: getEventTypeColor(event.event),
            }}
            onMouseEnter={(evt) => {
              setAnchorEl(evt.currentTarget);
              setTimelineOpacity(true);
            }}
          />
        )}

        {hideConnector ? null : (
          <TimelineConnector
            sx={({ palette }) => ({
              backgroundColor: palette.gray[40],
              width: "1px",
              my: 0.25,
              height: 34,
            })}
          />
        )}
      </TimelineSeparator>
      <TimelineContent
        sx={({ palette }) => ({
          color: palette.gray[70],
        })}
      >
        <span>{startCase(event.event)}</span>
      </TimelineContent>
      <Popover
        open={!!anchorEl}
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
          sx: {
            borderTop: `4px solid ${getEventTypeColor(event.event)}`,
            padding: "12px 16px",
            width: 250,
          },
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          mb={0.5}
          position="relative"
        >
          <Typography fontWeight={500}>{startCase(event.event)}</Typography>
          {event.html_url && (
            <Tooltip title="Copy link to request">
              <IconButton
                onClick={() => copyToClipboard(event.html_url)}
                sx={{ position: "absolute", top: 0, right: 0 }}
              >
                <LinkIcon />
              </IconButton>
            </Tooltip>
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
            src={event.actor?.avatar_url!}
            alt={event.actor?.login!}
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
