import * as React from "react";
import Grid from "@mui/material/Grid";
import Avatar from "@mui/material/Avatar";
import Stack from "@mui/material/Stack";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Cancel from "@mui/icons-material/Cancel";
import { uniqBy } from "lodash";
import formatDistance from "date-fns/formatDistance";
import {
  Box,
  Typography,
  Button,
  Divider,
  AvatarGroup,
  typographyClasses,
} from "@mui/material";
// import { Button } from "@hashintel/hash-design-system";
import {
  GithubIssueEvent,
  GithubPullRequest,
  GithubReview,
  isDefined,
  PullRequestIdentifier,
} from "./types";
import { GithubPrTimeline } from "./timeline1";
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

export const Reviews: React.FC<{
  pendingReviews: { avatar_url: string; login: string }[];
  completedReviews: { avatar_url: string; login: string }[];
}> = ({ pendingReviews, completedReviews }) => (
  <Box>
    <Typography
      variant="regularTextParagraphs"
      sx={({ palette }) => ({ color: palette.gray[90], mb: 1.75 })}
    >
      Reviews
    </Typography>
    <Stack direction="row" spacing={4}>
      <Box>
        <Stack direction="row" alignItems="center">
          <Typography
            variant="smallTextLabels"
            sx={({ palette }) => ({ color: palette.gray[90] })}
          >
            Pending
          </Typography>
          <Box
            sx={({ palette }) => ({
              height: 20,
              width: 20,
              borderRadius: "50%",
              backgroundColor: palette.gray[20],
              ml: 0.75,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              [`& ${typographyClasses.root}`]: {
                color: palette.gray[70],
              },
            })}
          >
            <Typography variant="microText">{pendingReviews.length}</Typography>
          </Box>
        </Stack>

        <Stack direction="row" alignItems="center" spacing={1}>
          <AvatarGroup max={1}>
            {pendingReviews.map(({ avatar_url }, index) => (
              <Avatar
                key={index}
                src={avatar_url}
                sx={{ height: 28, width: 28 }}
              />
            ))}
          </AvatarGroup>
          <Typography
            sx={({ palette }) => ({
              color: palette.gray[70],
            })}
          >
            {pendingReviews.map(({ login }, index) => (
              <span>
                {login} {index < pendingReviews.length - 1 ? "," : ""}
              </span>
            ))}
          </Typography>
        </Stack>
      </Box>
      <Box>
        <Stack direction="row" alignItems="center">
          <Typography
            variant="smallTextLabels"
            sx={({ palette }) => ({ color: palette.gray[90] })}
          >
            Completed
          </Typography>
          <Box
            sx={({ palette }) => ({
              height: 20,
              width: 20,
              borderRadius: "50%",
              backgroundColor: palette.gray[20],
              ml: 0.75,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              [`& ${typographyClasses.root}`]: {
                color: palette.gray[70],
              },
            })}
          >
            <Typography variant="microText">
              {completedReviews.length}
            </Typography>
          </Box>
        </Stack>

        <Stack direction="row" alignItems="center" spacing={1}>
          <AvatarGroup max={1}>
            {completedReviews.map(({ avatar_url }, index) => (
              <Avatar
                key={index}
                src={avatar_url}
                sx={{ height: 28, width: 28 }}
              />
            ))}
          </AvatarGroup>
          <Typography
            sx={({ palette }) => ({
              color: palette.gray[70],
            })}
          >
            {pendingReviews.map(({ login }, index) => (
              <span>
                {login} {index < pendingReviews.length - 1 ? "," : ""}
              </span>
            ))}
          </Typography>
        </Stack>
      </Box>
    </Stack>
  </Box>
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
    <Box sx={{ maxWidth: 800, mx: "auto" }}>
      <Box
        sx={({ palette }) => ({ backgroundColor: palette.white, padding: 3 })}
      >
        <Stack direction="row" alignItems="center" spacing={1} mb={1.5}>
          <GithubIcon
            sx={({ palette }) => ({
              height: 20,
              width: 20,
              color: palette.gray[50],
            })}
          />
          <Typography
            sx={({ palette }) => ({
              color: palette.gray[80],
            })}
          >
            hashintel/hash
          </Typography>
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
            #453
          </Box>{" "}
          Very long title of a pull request that needs to wrap onto another line
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
            <Stack direction="row">
              {/* Add comments icon */}
              {`${reviews.length} review${reviews.length > 1 ? "s" : ""}`}
            </Stack>
          </Box>
        </Box>

        <Divider sx={{ mt: 3, mb: 2 }} />

        <Reviews
          // pendingReviews={(pullRequest.requested_reviewers ?? [])
          //   ?.filter(isDefined)
          //   .map(({ login, avatar_url }) => ({ login, avatar_url }))}
          // completedReviews={uniqueReviewers}
          pendingReviews={[
            {
              login: "kachkaev",
              avatar_url: "https://avatars.githubusercontent.com/u/608862?v=4",
            },
            {
              login: "Ciaran",
              avatar_url: "https://avatars.githubusercontent.com/u/608862?v=4",
            },
          ]}
          completedReviews={[
            {
              login: "kachkaev",
              avatar_url: "https://avatars.githubusercontent.com/u/608862?v=4",
            },
            {
              login: "Ciaran",
              avatar_url: "https://avatars.githubusercontent.com/u/608862?v=4",
            },
          ]}
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
          reviews={reviews}
          events={events}
        />
      </Box>
    </Box>
  );
};
