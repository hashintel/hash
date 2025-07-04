import type { PendingOrgInvitation } from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import { Typography } from "@mui/material";
import { Box } from "@mui/system";

import { ChevronRightRegularIcon } from "../../shared/icons/chevron-right-regular-icon";
import { Button } from "../../shared/ui/button";

export const AcceptOrgInvitation = ({
  invitation,
  onAccept,
}: { invitation: PendingOrgInvitation; onAccept: () => void }) => {
  const { org, invitedBy } = invitation;

  return (
    <Box>
      <Typography sx={{ fontSize: 32, fontWeight: 700, mb: 4 }}>
        {invitedBy.displayName} has invited you to join {org.displayName}
      </Typography>
      <Typography sx={{ fontSize: 24, mb: 6 }}>
        This invite was sent to <br />
        <Box component="span" sx={{ fontWeight: 700 }}>
          {"email" in invitation ? invitation.email : invitation.shortname}
        </Box>
      </Typography>
      <Button onClick={onAccept} size="small" sx={{ px: 4, py: 2 }}>
        Accept invite and create account{" "}
        <ChevronRightRegularIcon sx={{ fontSize: 14, ml: 2 }} />
      </Button>
    </Box>
  );
};
