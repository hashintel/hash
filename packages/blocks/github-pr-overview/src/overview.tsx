import * as React from "react";
import Avatar from "@mui/material/Avatar";
import Stack from "@mui/material/Stack";
import { uniqBy } from "lodash";
import formatDistance from "date-fns/formatDistance";
import { Box, Typography, Divider, typographyClasses } from "@mui/material";
// import { Button } from "@hashintel/hash-design-system";
import {
  GithubIssueEvent,
  GithubPullRequest,
  GithubReview,
  isDefined,
  PullRequestIdentifier,
} from "./types";
import { GithubPrTimeline } from "./timeline";
import { CommentIcon, GithubIcon, PullRequestIcon } from "./icons";
import { Reviews } from "./reviews";
import { getEventTypeColor } from "./utils";

export type GithubPrOverviewProps = {
  pullRequest: GithubPullRequest["properties"];
  reviews: GithubReview["properties"][];
  events: GithubIssueEvent["properties"][];
  setSelectedPullRequestId: (x?: PullRequestIdentifier) => void;
  setBlockState: (x: any) => void;
};

const PRStatus: React.FC<{ status: string }> = ({ status }) => {
  return (
    <Box
      sx={({ palette }) => ({
        display: "inline-flex",
        alignItems: "center",
        py: 1.3125,
        px: 2,
        color: palette.white,
        borderRadius: 20,
        textTransform: "capitalize",
        backgroundColor: getEventTypeColor(status),
      })}
    >
      <PullRequestIcon sx={{ mr: 0.75, fontSize: 12 }} />
      <Typography
        variant="smallTextLabels"
        fontWeight={500}
        color="currentcolor"
      >
        {status}
      </Typography>
    </Box>
  );
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
  console.log({ reviews });
  const uniqueReviewers = uniqBy(
    reviews.map(({ user }) => {
      return {
        login: user?.login,
        avatar_url: user?.avatar_url,
      };
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
      ? "merged"
      : pullRequest.state === "closed"
      ? "closed"
      : "open";

  console.log({ pullRequest });

  return (
    <Box sx={{ maxWidth: 800, mx: "auto" }}>
      <Box
        sx={({ palette }) => ({ backgroundColor: palette.white, padding: 3 })}
      >
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          mb={1.5}
          sx={({ palette }) => ({
            svg: {
              height: 20,
              width: 20,
              color: palette.gray[50],
            },
            [`.${typographyClasses.root}`]: {
              color: palette.gray[80],
            },
          })}
        >
          <GithubIcon />
          <Typography fontWeight={500}>{pullRequest.repository}</Typography>
        </Stack>

        <Typography
          sx={({ palette }) => ({
            color: palette.gray[90],
            mb: 2,
            fontWeight: 600,
          })}
          variant="h1"
        >
          <Box
            sx={({ palette }) => ({ color: palette.gray[50] })}
            component="span"
          >
            #{pullRequest.number}
          </Box>{" "}
          {pullRequest.title}
        </Typography>
        <Box display="flex" alignItems="center">
          {/*  */}
          <Box display="flex" alignItems="center" mr={3}>
            <PRStatus status={status} />
            <Typography variant="smallTextLabels" fontWeight={500} ml={0.75}>
              within {timeToClose}
            </Typography>
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
              sx={({ palette }) => ({
                color: palette.gray[70],
                mr: 3,
                fontWeight: 500,
              })}
            >
              Opened by {pullRequest.user?.login}
            </Typography>
            <Stack
              direction="row"
              alignItems="center"
              typography="smallTextLabels"
              sx={({ palette }) => ({
                color: palette.gray[70],
                fontWeight: 500,
                svg: {
                  color: palette.gray[50],
                },
              })}
            >
              <CommentIcon sx={{ mr: 1 }} />
              <span>
                {`${reviews.length} review${reviews.length > 1 ? "s" : ""}`}
              </span>
            </Stack>
          </Box>
        </Box>

        <Divider
          sx={({ palette }) => ({
            mt: 3,
            mb: 2,
            borderColor: palette.gray[30],
          })}
        />

        <Reviews
          pendingReviews={(pullRequest.requested_reviewers ?? [])
            ?.filter(isDefined)
            .map(({ login, avatar_url }) => ({ login, avatar_url }))}
          completedReviews={uniqueReviewers}
        />
      </Box>
      <Box
        sx={{
          background: `linear-gradient(181.33deg, #F7FAFC 10.89%, rgba(251, 253, 254, 0) 94.8%`,
          height: 9,
        }}
      />
      <Box
        sx={({ palette }) => ({
          backgroundColor: palette.gray[10],
          height: 580, // this should be max height
          borderRadius: "0 0 6px 6px",
          px: 2,
        })}
      >
        <GithubPrTimeline
          pullRequest={pullRequest}
          // @todo move this upward in a use memo
          reviews={reviews}
          events={events}
        />
      </Box>
    </Box>
  );
};
