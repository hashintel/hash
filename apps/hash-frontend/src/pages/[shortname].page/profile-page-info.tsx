import { faLocationDot } from "@fortawesome/free-solid-svg-icons";
import {
  FontAwesomeIcon,
  IconButton,
  PenRegularIcon,
} from "@hashintel/design-system";
import { sanitizeHref } from "@local/hash-isomorphic-utils/sanitize";
import { Entity } from "@local/hash-subgraph";
import { Box, Fade, Skeleton, styled, Typography } from "@mui/material";
import { format, formatDistanceToNowStrict } from "date-fns";
import { FunctionComponent, ReactNode, useMemo } from "react";

import { Org, User } from "../../lib/user-and-org";
import { CalendarDayRegularIcon } from "../../shared/icons/calendar-day-regular-icon";
import { CustomLinkIcon } from "../../shared/icons/custom-link-icon";
import { Link } from "../../shared/ui/link";
import { ProfilePageTab } from "./util";

const SectionHeading = styled(Typography)(({ theme }) => ({
  color: theme.palette.gray[70],
  fontSize: 12,
  fontWeight: 600,
  textTransform: "uppercase",
}));

const InfoItem: FunctionComponent<{
  icon: ReactNode;
  title?: ReactNode;
  href?: string;
}> = ({ icon, title, href }) => {
  const content = (
    <Box display="flex" alignItems="center" columnGap={0.75}>
      <Box sx={{ width: 15, display: "flex", alignItems: "center" }}>
        {icon}
      </Box>
      {title ? (
        <Typography
          variant="microText"
          sx={{
            color: ({ palette }) => (href ? palette.blue[70] : undefined),
            fontWeight: href ? 700 : undefined,
          }}
        >
          {title}
        </Typography>
      ) : (
        <Skeleton variant="text" sx={{ flexGrow: 0.75, height: 20 }} />
      )}
    </Box>
  );

  return href ? (
    <Link
      noLinkStyle
      href={href}
      sx={{
        svg: {
          transition: ({ transitions }) => transitions.create("color"),
        },
        "&:hover": {
          svg: {
            color: ({ palette }) => palette.blue[70],
          },
        },
      }}
    >
      {content}
    </Link>
  ) : (
    content
  );
};

const ProfileTabInfo: FunctionComponent<{ profile?: User | Org }> = ({
  profile,
}) => {
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
    <Box display="flex" flexDirection="column" rowGap={0.5}>
      {location ? (
        <InfoItem
          icon={<FontAwesomeIcon icon={faLocationDot} sx={{ fontSize: 14 }} />}
          title={location}
        />
      ) : null}
      {websiteUrl ? (
        <InfoItem
          icon={<CustomLinkIcon sx={{ fontSize: 24, marginLeft: -0.5 }} />}
          title={websiteUrl.replace(/^http(s?):\/\//, "").replace(/\/$/, "")}
          href={websiteUrl}
        />
      ) : null}
      <InfoItem
        icon={<CalendarDayRegularIcon sx={{ fontSize: 14 }} />}
        title={
          profile && createdAtTimestamp ? (
            <>
              {profile.kind === "org" ? "Created" : "Joined"}{" "}
              <strong>{createdAtTimestamp}</strong>
            </>
          ) : undefined
        }
      />
    </Box>
  );
};

const PinnedEntityTypeTabInfo: FunctionComponent<
  Extract<ProfilePageTab, { kind: "pinned-entity-type" | "profile-pages" }>
> = ({ entities }) => {
  const latestEntityUpdatedAt = useMemo(() => {
    const latestEntity = entities?.reduce<Entity | undefined>(
      (prev, current) => {
        if (!prev) {
          return current;
        }

        const prevUpdatedAt = new Date(
          prev.metadata.temporalVersioning.decisionTime.start.limit,
        ).getTime();

        const currentUpdatedAt = new Date(
          current.metadata.temporalVersioning.decisionTime.start.limit,
        ).getTime();

        return prevUpdatedAt > currentUpdatedAt ? prev : current;
      },
      undefined,
    );

    return latestEntity
      ? new Date(
          latestEntity.metadata.temporalVersioning.decisionTime.start.limit,
        )
      : undefined;
  }, [entities]);

  return (
    <Box display="flex" flexDirection="column" rowGap={2.75}>
      {!entities || entities.length > 0 ? (
        <Box>
          {latestEntityUpdatedAt ? (
            <Typography
              sx={{
                color: ({ palette }) => palette.blue[70],
                fontWeight: 700,
                lineHeight: 1,
                marginBottom: -0.5,
              }}
            >
              {formatDistanceToNowStrict(latestEntityUpdatedAt)}
            </Typography>
          ) : (
            <Skeleton variant="text" width="40%" />
          )}
          <Typography variant="smallTextParagraphs">
            since last update
          </Typography>
        </Box>
      ) : null}
    </Box>
  );
};

export const ProfilePageInfo: FunctionComponent<{
  profile?: User | Org;
  isEditable: boolean;
  setDisplayEditUserProfileInfoModal: (value: boolean) => void;
  currentTab: ProfilePageTab;
}> = ({
  profile,
  isEditable,
  setDisplayEditUserProfileInfoModal,
  currentTab,
}) => {
  return (
    <Box>
      <Box display="flex" marginBottom={1.5}>
        <SectionHeading>Info</SectionHeading>
        <Fade
          in={
            currentTab.kind === "profile" &&
            isEditable &&
            profile?.kind === "user"
          }
        >
          <IconButton
            onClick={() => setDisplayEditUserProfileInfoModal(true)}
            sx={{
              marginLeft: 0.75,
              padding: 0,
              minHeight: "unset",
              position: "relative",
              top: -1,
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
      {currentTab.kind === "profile" ? (
        <ProfileTabInfo profile={profile} />
      ) : (
        <PinnedEntityTypeTabInfo {...currentTab} />
      )}
    </Box>
  );
};
