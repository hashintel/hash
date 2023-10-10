import { Box } from "@mui/material";
import { FunctionComponent } from "react";

import { Org, User } from "../../lib/user-and-org";
import { ProfileSectionHeading } from "../[shortname]/shared/profile-section-heading";
import { ProfileBio } from "./profile-bio";

export const ProfileTab: FunctionComponent<{
  profile: User | Org;
  refetchProfile: () => Promise<void>;
  isEditable: boolean;
}> = ({ profile, refetchProfile, isEditable }) => (
  <Box>
    <ProfileSectionHeading marginBottom={1.5}>Overview</ProfileSectionHeading>
    <ProfileBio
      profile={profile}
      refetchProfile={refetchProfile}
      isEditable={isEditable}
    />
  </Box>
);
