import * as React from "react";
import {
  Box,
  Typography,
  Stack,
  typographyClasses,
  AvatarGroup,
  Avatar,
} from "@mui/material";

// @todo fix types properly
type SectionProps = {
  title: string;
  reviews: {
    avatar_url: string | null | undefined;
    login: string | null | undefined;
  }[];
};

const Section: React.FC<SectionProps> = ({ title, reviews }) => {
  return (
    <Box>
      <Stack direction="row" alignItems="center">
        <Typography
          variant="smallTextLabels"
          sx={({ palette }) => ({ color: palette.gray[90], fontWeight: 500 })}
        >
          {title}
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
              fontWeight: 600,
            },
          })}
        >
          <Typography variant="microText">{reviews.length}</Typography>
        </Box>
      </Stack>

      <Stack direction="row" alignItems="center" spacing={1}>
        <AvatarGroup max={3}>
          {reviews.map(({ avatar_url, login }) => (
            <Avatar
              key={avatar_url}
              src={avatar_url!}
              alt={login!}
              sx={{ height: 28, width: 28 }}
            />
          ))}
        </AvatarGroup>
        <Typography
          variant="smallTextLabels"
          sx={({ palette }) => ({
            color: palette.gray[70],
            lineHeight: 1,
            fontWeight: 500,
          })}
        >
          {reviews.map(({ login }, index) => (
            <span key={login}>
              {login}
              {index < reviews.length - 1 ? ", " : ""}
            </span>
          ))}
        </Typography>
      </Stack>
    </Box>
  );
};

type ReviewsProps = {
  pendingReviews: {
    avatar_url: string | null | undefined;
    login: string | null | undefined;
  }[];
  completedReviews: {
    avatar_url: string | null | undefined;
    login: string | null | undefined;
  }[];
};

export const Reviews: React.FC<ReviewsProps> = ({
  pendingReviews,
  completedReviews,
}) => (
  <Box>
    <Typography
      variant="regularTextParagraphs"
      sx={({ palette }) => ({
        display: "block",
        color: palette.gray[90],
        mb: 1.75,
        fontWeight: 600,
      })}
    >
      Reviews
    </Typography>
    <Stack direction="row" spacing={4}>
      <Section title="Pending" reviews={pendingReviews} />
      <Section title="Complete" reviews={completedReviews} />
    </Stack>
  </Box>
);
