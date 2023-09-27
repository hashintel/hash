// import { faLocationDot } from "@fortawesome/free-solid-svg-icons";
// import { FontAwesomeIcon } from "@hashintel/design-system";
import { sanitizeHref } from "@local/hash-isomorphic-utils/sanitize";
import { Box, Container, Skeleton, styled, Typography } from "@mui/material";
import { format } from "date-fns";
import { FunctionComponent } from "react";

import { Org, User } from "../../lib/user-and-org";
import { CalendarDayRegularIcon } from "../../shared/icons/calendar-day-regular-icon";
import { LinkRegularIcon } from "../../shared/icons/link-regular-icon";
import { Link } from "../../shared/ui/link";
import { leftColumnWidth } from "../[shortname].page";

const SectionHeading = styled(Typography)(({ theme }) => ({
  color: theme.palette.gray[70],
  fontSize: 12,
  fontWeight: 600,
  textTransform: "uppercase",
}));

export const ProfilePageContent: FunctionComponent<{
  profile?: User | Org;
}> = ({ profile }) => {
  const websiteUrl =
    profile && "website" in profile && sanitizeHref(profile.website);

  const createdAtTimestamp = profile
    ? format(
        profile.kind === "org" ? profile.createdAt : profile.joinedAt,
        "MMM yyyy",
      )
    : undefined;

  return (
    <Container>
      <Box display="flex" columnGap={4}>
        <Box sx={{ width: leftColumnWidth }}>
          <SectionHeading sx={{ marginBottom: 1.5 }}>Info</SectionHeading>
          {/* {location ? (
            <Box display="flex" alignItems="center" columnGap={0.5}>
              <FontAwesomeIcon icon={faLocationDot} sx={{ fontSize: 12 }} />
              <Typography variant="microText">{location}</Typography>
            </Box>
          ) : null} */}
          {websiteUrl ? (
            <Link
              noLinkStyle
              href={websiteUrl}
              sx={{
                mt: 1,
                "&:hover": {
                  svg: {
                    color: ({ palette }) => palette.blue[70],
                  },
                },
              }}
            >
              <Box display="flex" alignItems="center" columnGap={0.5}>
                <LinkRegularIcon
                  sx={{
                    fontSize: 14,
                    transition: ({ transitions }) =>
                      transitions.create("color"),
                  }}
                />
                <Typography
                  variant="microText"
                  sx={{
                    color: ({ palette }) => palette.blue[70],
                    fontWeight: 700,
                  }}
                >
                  {websiteUrl.replace(/^http(s?):\/\//, "").replace(/\/$/, "")}
                </Typography>
              </Box>
            </Link>
          ) : null}
          <Box display="flex" alignItems="center" columnGap={0.5}>
            <CalendarDayRegularIcon sx={{ fontSize: 12 }} />
            {profile && createdAtTimestamp ? (
              <Typography variant="microText">
                {profile.kind === "org" ? "Created" : "Joined"}{" "}
                <strong>{createdAtTimestamp}</strong>
              </Typography>
            ) : (
              <Skeleton />
            )}
          </Box>
        </Box>
        <Box />
      </Box>
    </Container>
  );
};
