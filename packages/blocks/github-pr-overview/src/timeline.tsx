import * as React from "react";
import Grid from "@mui/material/Grid";
import Timeline from "@mui/lab/Timeline";
import TimelineItem from "@mui/lab/TimelineItem";
import TimelineSeparator from "@mui/lab/TimelineSeparator";
import TimelineConnector from "@mui/lab/TimelineConnector";
import TimelineContent from "@mui/lab/TimelineContent";
import TimelineDot from "@mui/lab/TimelineDot";
import { GithubIssueEvent, GithubPullRequest } from "./types";

export type GithubPrTimelineProps = {
  pullRequest: GithubPullRequest;
  events: GithubIssueEvent[];
};

const NODE_COLORS: {
  [key: string]:
    | "inherit"
    | "grey"
    | "primary"
    | "secondary"
    | "error"
    | "info"
    | "success"
    | "warning";
} = {
  opened: "info",
  reviewed: "primary",
  review_requested: "warning",
  ready_for_review: "secondary",
  closed: "error",
  merged: "success",
};

export const GithubPrTimeline: React.FunctionComponent<
  GithubPrTimelineProps
> = ({ pullRequest, events }) => {
  // there isn't an issue event for opening so we manually make an object to append to the timeline
  const openedEvent = { id: pullRequest.node_id, event: "opened" };
  const nodes = [openedEvent, ...events];
  const maxIdx = nodes.length - 1;

  return (
    <Grid item xs={4}>
      <div className="timeline">
        <Timeline position="left">
          {nodes.map((event, idx) => {
            if (event.event != null) {
              const color = NODE_COLORS[event.event] ?? "grey";
              return (
                <TimelineItem key={event.id}>
                  <TimelineSeparator>
                    <TimelineDot color={color} />
                    {idx < maxIdx ? <TimelineConnector /> : undefined}
                  </TimelineSeparator>
                  <TimelineContent>{event.event}</TimelineContent>
                </TimelineItem>
              );
            } else return undefined;
          })}
        </Timeline>
      </div>
    </Grid>
  );
};
