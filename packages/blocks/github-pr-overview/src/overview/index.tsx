import * as React from "react";
import Avatar from "@mui/material/Avatar";
import Stack from "@mui/material/Stack";
import { uniqBy } from "lodash";
import formatDistance from "date-fns/formatDistance";
import { Box, Typography, Divider, typographyClasses } from "@mui/material";
import { IconButton } from "@hashintel/hash-design-system";
import {
  GithubIssueEventEntityType,
  GithubPullRequestEntityType,
  GithubReviewEntityType,
  isDefined,
} from "../types";
import { GithubPrTimeline } from "../timeline";
import {
  CloseIcon,
  CommentIcon,
  GithubIcon,
  PullRequestClosedIcon,
  PullRequestMergedIcon,
  PullRequestOpenIcon,
} from "../icons";
import { Reviews } from "./reviews";
import { getEventTypeColor } from "../utils";

export type GithubPrOverviewProps = {
  pullRequest: GithubPullRequestEntityType["properties"];
  reviews: GithubReviewEntityType["properties"][];
  events: GithubIssueEventEntityType["properties"][];
  reset: () => void;
};

const PRStatus: React.FC<{
  pullRequest: GithubPullRequestEntityType["properties"];
}> = ({ pullRequest }) => {
  const status =
    pullRequest.merged_at != null
      ? "merged"
      : pullRequest.state === "closed"
      ? "closed"
      : "open";

  let icon;

  switch (status) {
    case "merged":
      icon = <PullRequestMergedIcon sx={{ mr: 0.75, fontSize: 12 }} />;
      break;

    case "closed":
      icon = <PullRequestClosedIcon sx={{ mr: 0.75, fontSize: 12 }} />;
      break;

    case "open":
    default:
      icon = <PullRequestOpenIcon sx={{ mr: 0.75, fontSize: 12 }} />;
      break;
  }

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
      {icon}
      <Typography fontWeight={500} color="currentcolor">
        {status}
      </Typography>
    </Box>
  );
};

export const GithubPrOverview: React.FunctionComponent<
  GithubPrOverviewProps
> = ({ pullRequest, reviews, events, reset }) => {
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

  console.log({ pullRequest });

  return (
    <Box sx={{ maxWidth: 800, mx: "auto" }}>
      <Box
        sx={({ palette, spacing }) => ({
          backgroundColor: palette.white,
          padding: 3,
          position: "relative",
          borderRadius: spacing(0.75, 0.75, 0, 0),
        })}
      >
        <IconButton
          onClick={reset}
          rounded
          size="large"
          sx={{ position: "absolute", right: 2, top: 2 }}
        >
          <CloseIcon />
        </IconButton>
        <Stack
          direction="row"
          spacing={1}
          sx={({ palette }) => ({
            alignItems: "center",
            mb: 1.5,
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
          <Box display="flex" alignItems="center" mr={3}>
            <PRStatus pullRequest={pullRequest} />
            <Typography fontWeight={500} ml={0.75}>
              within {timeToClose}
            </Typography>
          </Box>
          <Box display="flex" alignItems="center">
            <Avatar
              sx={{ height: 20, width: 20, mr: 1 }}
              src={pullRequest.user?.avatar_url ?? ""}
              alt={pullRequest.user?.login ?? "User"}
            >
              {pullRequest.user?.login ?? "User"}
            </Avatar>
            <Typography
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
          position: "relative",
          "&:before": {
            content: "''",
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            background:
              "linear-gradient(181.33deg, #F7FAFC 10.89%, rgba(251, 253, 254, 0) 94.8%)",
            height: 9,
          },
        }}
      >
        <GithubPrTimeline
          pullRequest={pullRequest}
          reviews={reviews}
          events={events}
        />
      </Box>
    </Box>
  );
};
