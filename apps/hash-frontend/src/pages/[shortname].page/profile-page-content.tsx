import { Box, Container } from "@mui/material";
import { FunctionComponent } from "react";

import { Org, User } from "../../lib/user-and-org";
import { PinnedEntityTypeTabContents } from "./pinned-entity-type-tab-contents";
import { ProfilePageInfo } from "./profile-page-info";
import { ProfileTab } from "./profile-tab";
import { leftColumnWidth, ProfilePageTab } from "./util";

export const ProfilePageContent: FunctionComponent<{
  profile?: User | Org;
  isEditable: boolean;
  setDisplayEditUserProfileInfoModal: (display: boolean) => void;
  refetchProfile: () => Promise<void>;
  currentTab: ProfilePageTab;
}> = ({
  profile,
  isEditable,
  setDisplayEditUserProfileInfoModal,
  currentTab,
  refetchProfile,
}) => {
  return (
    <Container sx={{ paddingTop: 4 }}>
      <Box display="flex" columnGap={4}>
        <Box sx={{ width: leftColumnWidth }}>
          <ProfilePageInfo
            profile={profile}
            isEditable={isEditable}
            setDisplayEditUserProfileInfoModal={
              setDisplayEditUserProfileInfoModal
            }
            currentTab={currentTab}
          />
        </Box>
        <Box flexGrow={1}>
          {profile ? (
            currentTab.kind === "profile" ? (
              <ProfileTab
                profile={profile}
                isEditable={isEditable}
                refetchProfile={refetchProfile}
              />
            ) : (
              <PinnedEntityTypeTabContents
                profile={profile}
                isEditable={isEditable}
                currentTab={currentTab}
              />
            )
          ) : null}
        </Box>
      </Box>
    </Container>
  );
};
