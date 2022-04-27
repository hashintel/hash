import * as React from "react";
import Grid from "@mui/material/Grid";
import Avatar from "@mui/material/Avatar";
import Stack from "@mui/material/Stack";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Cancel from "@mui/icons-material/Cancel";
import { uniqBy } from "lodash";
import moment from "moment";

import {
  GithubIssueEvent,
  GithubPullRequest,
  GithubReview,
  isDefined,
  PullRequestIdentifier,
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
  setSelectedPullRequestId: (x?: PullRequestIdentifier) => void;
};

export const GithubPrOverview: React.FunctionComponent<
  GithubPrOverviewProps
> = ({ pullRequest, reviews, events, setSelectedPullRequestId }) => {
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
      <GithubPrTimeline
        pullRequest={pullRequest}
        reviews={reviews}
        events={events}
      />
      <Grid item xs={8} style={{ paddingLeft: "1em" }}>
        <div style={{ position: "relative" }}>
          <div>
            <h1>
              {pullRequest.repository}{" "}
              <span style={{ color: "grey" }}>#{pullRequest.number}</span>
            </h1>
            <h2>
              Status:{" "}
              <span style={{ color: "green" }}>{pullRequest.state}</span>
            </h2>
            <Stack>
              {timeToMerge ? (
                <div>
                  <span style={{ fontWeight: "bold" }}>Merged After:</span>{" "}
                  {timeToMerge}
                </div>
              ) : undefined}
              <div>
                <span style={{ fontWeight: "bold" }}>Reviews:</span>{" "}
                {reviews.length}
              </div>
              <div>
                {pullRequest.requested_reviewers != null &&
                pullRequest.requested_reviewers.filter(isDefined).length > 0 ? (
                  <>
                    <span style={{ fontWeight: "bold" }}>
                      Pending New Reviews From:
                    </span>
                    {pullRequest.requested_reviewers
                      ?.filter(isDefined)
                      .map((reviewer) => (
                        <div key={reviewer.login}>
                          {Reviewer(reviewer.login!, reviewer.avatar_url)}
                        </div>
                      ))}
                  </>
                ) : null}
              </div>
              <div>
                <span style={{ fontWeight: "bold" }}>Reviewed By:</span>
                {uniqueReviewers.map((reviewer) => (
                  <div key={reviewer.login}>
                    {Reviewer(reviewer.login!, reviewer.avatar_url)}
                  </div>
                ))}
              </div>
            </Stack>
          </div>

          <IconButton
            onClick={() => setSelectedPullRequestId()}
            style={{
              position: "absolute",
              top: 0,
              right: "0.3em",
              zIndex: 3,
            }}
          >
            <Tooltip title="Change Pull Request">
              <Cancel key="cancelButton" />
            </Tooltip>
          </IconButton>
        </div>
      </Grid>
    </Grid>
  );
};
