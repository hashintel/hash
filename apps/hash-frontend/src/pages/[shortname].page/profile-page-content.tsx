import { faLocationDot } from "@fortawesome/free-solid-svg-icons";
import {
  FontAwesomeIcon,
  IconButton,
  PenRegularIcon,
} from "@hashintel/design-system";
import { sanitizeHref } from "@local/hash-isomorphic-utils/sanitize";
import {
  Box,
  Container,
  Fade,
  Skeleton,
  styled,
  Typography,
} from "@mui/material";
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
  isEditable: boolean;
  setDisplayEditUserProfileInfoModal: (display: boolean) => void;
}> = ({ profile, isEditable, setDisplayEditUserProfileInfoModal }) => {
  const websiteUrl = profile?.website
    ? sanitizeHref(profile.website)
    : undefined;

  const createdAtTimestamp = profile
    ? format(
        profile.kind === "org" ? profile.createdAt : profile.joinedAt,
        "MMM yyyy",
      )
    : undefined;

  const { location } = profile ?? {};

  return (
    <Container sx={{ paddingTop: 4 }}>
      <Box display="flex" columnGap={4}>
        <Box sx={{ width: leftColumnWidth }}>
          <Box display="flex" marginBottom={1.5}>
            <SectionHeading>Info</SectionHeading>
            <Fade in={isEditable && profile?.kind === "user"}>
              <IconButton
                onClick={() => setDisplayEditUserProfileInfoModal(true)}
                sx={{
                  marginLeft: 0.5,
                  padding: 0,
                  minHeight: "unset",
                  svg: {
                    color: ({ palette }) => palette.blue[70],
                    fontSize: 12,
                  },
                  "&:hover": {
                    background: "transparent",
                    svg: {
                      color: ({ palette }) => palette.blue[50],
                    },
                  },
                }}
              >
                <PenRegularIcon />
              </IconButton>
            </Fade>
          </Box>
          {location ? (
            <Box display="flex" alignItems="center" columnGap={0.5}>
              <FontAwesomeIcon icon={faLocationDot} sx={{ fontSize: 12 }} />
              <Typography variant="microText">{location}</Typography>
            </Box>
          ) : null}
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
      </Box>
    </Container>
  );
};
