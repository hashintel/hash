import * as React from "react";
import Grid from "@mui/material/Grid";
import Timeline from "@mui/lab/Timeline";
import TimelineItem from "@mui/lab/TimelineItem";
import TimelineSeparator from "@mui/lab/TimelineSeparator";
import TimelineConnector from "@mui/lab/TimelineConnector";
import TimelineContent from "@mui/lab/TimelineContent";
import TimelineDot from "@mui/lab/TimelineDot";

import { GithubIssueEvent, GithubPullRequest, GithubReview } from "./types";

export type GithubPrLifeCycleProps = {
  pullRequest: GithubPullRequest;
  reviews: GithubReview[];
  events: GithubIssueEvent[];
};

export const GithubPrLifeCycle: React.FunctionComponent<
  GithubPrLifeCycleProps
> = ({ pullRequest, reviews, events }) => {
  const maxIdx = events.length - 1;

  return (
    <Grid container className="lifeCycleContainer">
      <Grid item xs={4}>
        <div className="timeline">
          <Timeline position="left">
            {events.map((event, idx) => {
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
            Status: <span style={{ color: "green" }}>Merged</span>
          </h2>
          <br />
          Merged After: 2 Days and 2 Hours
          <br />
          Reviews: 4
          <br />
          Reviewers:
          <ol>
            <li>kachkaev</li>
            <li>semgrep-app</li>
            <li>teenoh</li>
            <li>nathggns</li>
          </ol>
          <br />
        </div>
      </Grid>
    </Grid>
  );
};
