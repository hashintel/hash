import { Box } from "@mui/material";
import type { FunctionComponent } from "react";

import type { Org, User } from "../../lib/user-and-org";
import { ProfileBio } from "./profile-bio";

export const ProfileTab: FunctionComponent<{
  profile: User | Org;
  refetchProfile: () => Promise<void>;
  isEditable: boolean;
}> = ({ profile, refetchProfile, isEditable }) => (
  <Box>
    {profile.hasBio ?? isEditable ? (
      <ProfileBio
        profile={profile}
        refetchProfile={refetchProfile}
        isEditable={isEditable}
      />
    ) : null}
  </Box>
);
