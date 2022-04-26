import * as React from "react";
import Grid from "@mui/material/Grid";
import Timeline from "@mui/lab/Timeline";
import TimelineItem from "@mui/lab/TimelineItem";
import TimelineSeparator from "@mui/lab/TimelineSeparator";
import TimelineConnector from "@mui/lab/TimelineConnector";
import TimelineContent from "@mui/lab/TimelineContent";
import TimelineDot from "@mui/lab/TimelineDot";

import { GithubIssueEvent } from "./types";

export type GithubPrLifeCycleProps = {
  repo: string;
  prNumber: number;
  events: GithubIssueEvent[];
};

export const GithubPrLifeCycle: React.FunctionComponent<
  GithubPrLifeCycleProps
> = ({ repo, prNumber, events }) => {
  return (
    <Grid container className="lifeCycleContainer">
      <Grid item xs={4}>
        <div className="timeline">
          <Timeline position="left">
            {events.map((event) => {
              return (
                <TimelineItem key={event.id}>
                  <TimelineSeparator>
                    <TimelineDot />
                    <TimelineConnector />
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
            {repo} <span style={{ color: "grey" }}>#{prNumber}</span>
          </h1>
          <br />
          Time Until Merge: 2 Days and 2 Hours
          <br />
          Reviews: 4
          <br />
          Ran out of ideas
        </div>
      </Grid>
    </Grid>
  );
};
