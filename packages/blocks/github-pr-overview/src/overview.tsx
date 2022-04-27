import * as React from "react";
import Grid from "@mui/material/Grid";
import Avatar from "@mui/material/Avatar";
import Stack from "@mui/material/Stack";
import { uniqBy } from "lodash";
import moment from "moment";

import {
  GithubIssueEvent,
  GithubPullRequest,
  GithubReview,
  isDefined,
} from "./types";
import { GithubPrTimeline } from "./timeline";

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

export type GithubPrOverviewProps = {
  pullRequest: GithubPullRequest;
  reviews: GithubReview[];
  events: GithubIssueEvent[];
};

export const GithubPrOverview: React.FunctionComponent<
  GithubPrOverviewProps
> = ({ pullRequest, reviews, events }) => {
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

  return (
    <Grid container className="prOverviewContainer">
      <GithubPrTimeline pullRequest={pullRequest} events={events} />
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
