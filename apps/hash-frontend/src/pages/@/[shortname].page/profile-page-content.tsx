import { Box, Container } from "@mui/material";

import { DataTypesLoadError } from "../../shared/data-types-load-error";
import { PinnedEntityTypeTabContents } from "./pinned-entity-type-tab-contents";
import { ProfilePageInfo } from "./profile-page-info";
import { ProfileTab } from "./profile-tab";
import { TypesTab } from "./types-tab";
import { leftColumnWidth } from "./util";

import type { Org, User } from "../../../lib/user-and-org";
import type { ProfilePageTab } from "./util";
import type {
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@blockprotocol/type-system";
import type { FunctionComponent } from "react";

export const ProfilePageContent: FunctionComponent<{
  profile?: User | Org;
  isEditable: boolean;
  setDisplayEditUserProfileInfoModal: (display: boolean) => void;
  refetchProfile: () => Promise<void>;
  currentTab: ProfilePageTab;
  webTypes: (
    | PropertyTypeWithMetadata
    | EntityTypeWithMetadata
    | DataTypeWithMetadata
  )[];
  webTypesLoading: boolean;
  webTypesError: Error | null;
}> = ({
  profile,
  isEditable,
  setDisplayEditUserProfileInfoModal,
  currentTab,
  refetchProfile,
  webTypes,
  webTypesLoading,
  webTypesError,
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
            ) : currentTab.kind === "pinned-entity-type" ? (
              <PinnedEntityTypeTabContents
                profile={profile}
                isEditable={isEditable}
                currentTab={currentTab}
              />
            ) : webTypesError ? (
              <DataTypesLoadError />
            ) : (
              <TypesTab loading={webTypesLoading} types={webTypes} />
            )
          ) : null}
        </Box>
      </Box>
    </Container>
  );
};
