import { Avatar } from "@hashintel/design-system";
import { Box, Container, Skeleton, Typography } from "@mui/material";
import { FunctionComponent } from "react";

import { Org, User } from "../../lib/user-and-org";
import { leftColumnWidth } from "../[shortname].page";
import { getImageUrlFromEntityProperties } from "../[shortname]/entities/[entity-uuid].page/entity-editor/shared/get-image-url-from-properties";

const avatarTopOffset = 25;

export const ProfilePageHeader: FunctionComponent<{
  profile?: User | Org;
  isEditable: boolean;
  setDisplayEditUserProfileInfoModal: (display: boolean) => void;
}> = ({ profile, isEditable, setDisplayEditUserProfileInfoModal }) => {
  const avatarSrc = profile?.hasAvatar
    ? getImageUrlFromEntityProperties(profile.hasAvatar.imageEntity.properties)
    : undefined;

  return (
    <Box
      sx={{
        borderBottom: 1,
        borderColor: ({ palette }) => palette.gray[20],
        pt: 3.75,
        backgroundColor: ({ palette }) => palette.common.white,
        marginBottom: `${avatarTopOffset}px`,
      }}
    >
      <Container>
        <Box
          sx={{
            display: "flex",
            columnGap: 4,
            marginTop: ({ spacing }) =>
              `calc(${spacing(6)} - ${avatarTopOffset * 2}px)`,
          }}
        >
          {profile ? (
            <Box position="relative">
              <Avatar
                src={avatarSrc}
                title={
                  profile.kind === "user" ? profile.preferredName : profile.name
                }
                size={leftColumnWidth}
                sx={{
                  position: "relative",
                  top: avatarTopOffset,
                }}
                onEditIconButtonClick={
                  /**
                   * @todo: allow for editing org avatars
                   */
                  isEditable && profile.kind === "user"
                    ? () => setDisplayEditUserProfileInfoModal(true)
                    : undefined
                }
              />
            </Box>
          ) : (
            <Skeleton
              variant="circular"
              width={leftColumnWidth}
              height={leftColumnWidth}
              sx={{
                background: ({ palette }) => palette.gray[20],
                position: "relative",
                top: avatarTopOffset,
              }}
            />
          )}
          <Box paddingTop={`${avatarTopOffset}px`}>
            {profile ? (
              <Typography
                variant="h1"
                sx={{
                  fontSize: 32,
                  fontWeight: 700,
                  color: ({ palette }) => palette.gray[90],
                }}
              >
                {profile.kind === "user" ? profile.preferredName : profile.name}
              </Typography>
            ) : (
              <Skeleton
                height={50}
                width={200}
                sx={{ background: ({ palette }) => palette.gray[20] }}
              />
            )}
            {profile ? (
              <Typography
                sx={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: ({ palette }) => palette.gray[70],
                }}
              >
                @{profile.shortname}
              </Typography>
            ) : (
              <Skeleton
                height={30}
                width={150}
                sx={{ background: ({ palette }) => palette.gray[20] }}
              />
            )}
          </Box>
        </Box>
      </Container>
    </Box>
  );
};
