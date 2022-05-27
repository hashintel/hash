import * as React from "react";
import Grid from "@mui/material/Grid";
import Avatar from "@mui/material/Avatar";
import Stack from "@mui/material/Stack";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Cancel from "@mui/icons-material/Cancel";
import { uniqBy } from "lodash";
import formatDistance from "date-fns/formatDistance";
import { Box, Typography, Button, Divider } from "@mui/material";
// import { Button } from "@hashintel/hash-design-system";
import {
  GithubIssueEvent,
  GithubPullRequest,
  GithubReview,
  isDefined,
  PullRequestIdentifier,
} from "./types";
import { GithubPrTimeline } from "./timeline";
import { BlockState } from "./app";
import { GithubIcon, PullRequestIcon } from "./icons";

// move to different file
const PRStatus: React.FC<{ status: "open" | "closed" | "merged" }> = ({
  status,
}) => {
  return (
    <Box
      sx={({ palette }) => ({
        display: "inline-flex",
        py: 1.5,
        px: 2,
        color: palette.white,
        borderRadius: 20,
        textTransform: "capitalize",
        backgroundColor:
          status === "merged"
            ? palette.purple[70]
            : status === "open"
            ? palette.blue[60]
            : palette.gray[60],
      })}
    >
      <PullRequestIcon sx={{ mr: 0.75, fontSize: 12 }} />
      <Typography variant="smallTextLabels" color="currentcolor">
        {status}
      </Typography>
    </Box>
  );
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

export type GithubPrOverviewProps = {
  pullRequest: GithubPullRequest;
  reviews: GithubReview[];
  events: GithubIssueEvent[];
  setSelectedPullRequestId: (x?: PullRequestIdentifier) => void;
  setBlockState: (x: any) => void;
};

export const GithubPrOverview: React.FunctionComponent<
  GithubPrOverviewProps
> = ({
  pullRequest,
  reviews,
  events,
  setSelectedPullRequestId,
  setBlockState,
}) => {
  const uniqueReviewers = uniqBy(
    reviews.map((review) => {
      return { login: review.user!.login, avatar_url: review.user!.avatar_url };
    }),
    "login",
  );

  const timeToClose =
    pullRequest.created_at != null && pullRequest.closed_at != null
      ? formatDistance(
          new Date(pullRequest.closed_at),
          new Date(pullRequest.created_at),
        )
      : undefined;

  /** @todo - Get colours from theme? */
  const status =
    pullRequest.merged_at != null
      ? { text: "Merged", color: "DarkMagenta" }
      : pullRequest.state === "closed"
      ? { text: "Closed", color: "darkred" }
      : { text: "Open", color: "green" };

  console.log({ pullRequest });

  return (
    <>
      <Box sx={{ maxWidth: 800, mx: "auto", border: "1px solid red" }}>
        <Box sx={({ palette }) => ({ backgroundColor: palette.white })}>
          <Box display="flex" mb={1.5}>
            <GithubIcon
              sx={({ palette }) => ({
                height: 20,
                width: 20,
                color: palette.gray[50],
              })}
            />
            <Typography>hashintel/hash</Typography>
          </Box>

          <Typography
            sx={({ palette }) => ({ color: palette.gray[90], mb: 2 })}
            variant="h1"
          >
            <Box
              sx={({ palette }) => ({ color: palette.gray[50] })}
              component="span"
            >
              #453
            </Box>{" "}
            Very long title of a pull request that needs to wrap onto another
            line
          </Typography>
          <Box display="flex" alignItems="center">
            {/*  */}
            <Box display="flex" alignItems="center" mr={3}>
              <PRStatus status={status.text.toLowerCase()} />
              <Typography sx={{ ml: 0.75 }}>within {timeToClose}</Typography>
            </Box>
            <Box display="flex" alignItems="center">
              <Avatar
                sx={{ height: 20, width: 20, mr: 1 }}
                // @todo add default image
                src={pullRequest.user?.avatar_url ?? ""}
                alt={pullRequest.user?.login ?? "User"}
              />
              <Typography
                variant="smallTextLabels"
                sx={({ palette }) => ({ color: palette.gray[70], mr: 3 })}
              >
                Opened by {pullRequest.user?.login}
              </Typography>
              <Button variant="tertiary_quiet">29 reviews</Button>
            </Box>
          </Box>

          <Divider />
        </Box>
      </Box>
      {/* <Grid container className="prOverviewContainer">
       <GithubPrTimeline
        pullRequest={pullRequest}
        reviews={reviews}
        events={events}
      />
      <Grid item xs={6} style={{ paddingLeft: "1em" }}>
        <div style={{ position: "relative" }}>
          <div>
            <h1>
              <span>{pullRequest.repository} </span>
              <span style={{ color: "grey" }}>#{pullRequest.number}</span>
            </h1>
            <h2>
              <span>Status: </span>
              <span style={{ color: status.color }}>{status.text}</span>
            </h2>
            <Stack>
              {timeToClose ? (
                <div>
                  <span style={{ fontWeight: "bold" }}>Merged After: </span>
                  {timeToClose}
                </div>
              ) : undefined}
              <div>
                <span style={{ fontWeight: "bold" }}>Reviews: </span>
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
            onClick={() => {
              setSelectedPullRequestId();
              setBlockState(BlockState.Loading);
            }}
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
    </Grid> */}
    </>
  );
};
