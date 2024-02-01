import { Avatar } from "@hashintel/design-system";
import { Box, Container, Skeleton, Typography } from "@mui/material";
import { FunctionComponent, useState } from "react";

import { Org, User } from "../../lib/user-and-org";
import { CogRegularIcon } from "../../shared/icons/cog-regular-icon";
import { Button } from "../../shared/ui";
import { getImageUrlFromEntityProperties } from "../shared/get-image-url-from-properties";
import { EditPinnedEntityTypesModal } from "./edit-pinned-entity-types-modal";
import { ProfilePageTabs } from "./profile-page-tabs";
import { leftColumnWidth, ProfilePageTab } from "./util";

const avatarTopOffset = 25;

export const ProfilePageHeader: FunctionComponent<{
  profile?: User | Org;
  isEditable: boolean;
  setDisplayEditUserProfileInfoModal: (display: boolean) => void;
  tabs: ProfilePageTab[];
  currentTab: ProfilePageTab;
  refetchProfile: () => Promise<void>;
}> = ({
  profile,
  isEditable,
  setDisplayEditUserProfileInfoModal,
  tabs,
  currentTab,
  refetchProfile,
}) => {
  const [
    displayEditPinnedEntityTypesModal,
    setDisplayEditPinnedEntityTypesModal,
  ] = useState(false);

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
                onEditEmojiIconButtonClick={
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
          <Box
            paddingTop={`${avatarTopOffset}px`}
            display="flex"
            flexDirection="column"
            justifyContent="space-between"
            flexGrow={1}
          >
            <Box>
              {profile ? (
                <Typography
                  variant="h1"
                  sx={{
                    fontSize: 32,
                    fontWeight: 700,
                    color: ({ palette }) => palette.gray[90],
                  }}
                >
                  {profile.kind === "user"
                    ? profile.preferredName
                    : profile.name}
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
            <Box display="flex" justifyContent="space-between">
              <ProfilePageTabs
                profile={profile}
                tabs={tabs}
                currentTab={currentTab}
              />
              {isEditable ? (
                <>
                  <Button
                    onClick={() => setDisplayEditPinnedEntityTypesModal(true)}
                    variant="secondary_quiet"
                    size="xs"
                    endIcon={
                      <CogRegularIcon
                        sx={{ color: ({ palette }) => palette.blue[70] }}
                      />
                    }
                    sx={{ marginBottom: 0.5 }}
                  >
                    Modify
                  </Button>
                  {profile ? (
                    <EditPinnedEntityTypesModal
                      open={displayEditPinnedEntityTypesModal}
                      profile={profile}
                      onClose={() =>
                        setDisplayEditPinnedEntityTypesModal(false)
                      }
                      refetchProfile={refetchProfile}
                    />
                  ) : null}
                </>
              ) : null}
            </Box>
          </Box>
        </Box>
      </Container>
    </Box>
  );
};
