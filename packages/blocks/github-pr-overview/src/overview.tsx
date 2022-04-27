import * as React from "react";
import Grid from "@mui/material/Grid";
import Avatar from "@mui/material/Avatar";
import Stack from "@mui/material/Stack";
import Timeline from "@mui/lab/Timeline";
import TimelineItem from "@mui/lab/TimelineItem";
import TimelineSeparator from "@mui/lab/TimelineSeparator";
import TimelineConnector from "@mui/lab/TimelineConnector";
import TimelineContent from "@mui/lab/TimelineContent";
import TimelineDot from "@mui/lab/TimelineDot";
import { uniqBy } from "lodash";
import moment from "moment";

import {
  GithubIssueEvent,
  GithubPullRequest,
  GithubReview,
  isDefined,
} from "./types";

export type GithubPrOverviewProps = {
  pullRequest: GithubPullRequest;
  reviews: GithubReview[];
  events: GithubIssueEvent[];
};

export const Reviewer = (login: string, avatar_url?: string | null) => (
  <Stack direction="row" spacing={1}>
    <Avatar
      alt={login}
      src={avatar_url ?? undefined}
      sx={{ width: "0.8em", height: "0.8em" }}
      style={{ alignSelf: "center" }}
    />
    <span>{login}</span>
  </Stack>
);

export const GithubPrOverview: React.FunctionComponent<
  GithubPrOverviewProps
> = ({ pullRequest, reviews, events }) => {
  const maxIdx = events.length - 1;
  const uniqueReviewers = uniqBy(
    reviews.map((review) => {
      return { login: review.user!.login, avatar_url: review.user!.avatar_url };
    }),
    "login",
  );

  const timeToMerge =
    pullRequest.closed_at != null
      ? moment(pullRequest.closed_at).from(moment(pullRequest.created_at), true)
      : undefined;
  // there isn't an issue event for opening so we manually make an object to append to the timeline
  const openedEvent = { id: pullRequest.node_id, event: "opened" };
  return (
    <Grid container className="prOverviewContainer">
      <Grid item xs={4}>
        <div className="timeline">
          <Timeline position="left">
            {[openedEvent, ...events].map((event, idx) => {
              return (
                <TimelineItem key={event.id}>
                  <TimelineSeparator>
                    <TimelineDot />
                    {idx < maxIdx ? <TimelineConnector /> : undefined}
                  </TimelineSeparator>
                  <TimelineContent>{event.event}</TimelineContent>
                </TimelineItem>
              );
            })}
          </Timeline>
        </div>
      </Grid>
      <Grid item xs={8}>
        <div>
          <h1>
            {pullRequest.repository}{" "}
            <span style={{ color: "grey" }}>#{pullRequest.number}</span>
          </h1>
          <h2>
            Status: <span style={{ color: "green" }}>{pullRequest.state}</span>
          </h2>
          <Stack>
            {timeToMerge ? <div>Merged After: {timeToMerge}</div> : undefined}
            <div>Reviews: {reviews.length}</div>
            <div>
              Pending Reviewers:
              {pullRequest.requested_reviewers
                ?.filter(isDefined)
                .map((reviewer) => (
                  <div key={reviewer.login}>
                    {Reviewer(reviewer.login!, reviewer.avatar_url)}
                  </div>
                ))}
            </div>
            <div>
              Reviewed By:
              {uniqueReviewers.map((reviewer) => (
                <div key={reviewer.login}>
                  {Reviewer(reviewer.login!, reviewer.avatar_url)}
                </div>
              ))}
            </div>
          </Stack>
        </div>
      </Grid>
    </Grid>
  );
};
