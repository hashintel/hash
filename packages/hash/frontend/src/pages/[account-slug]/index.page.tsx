import { VoidFunctionComponent } from "react";

import { Box, Typography } from "@mui/material";
import { MainContentWrapper } from "../../components/layout/MainContentWrapper";
import { useUser } from "../../components/hooks/useUser";
import { useOrgs } from "../../components/hooks/useOrgs";
import { Link } from "../../shared/ui";
import { useRouteAccountInfo } from "../../shared/routing";

export const AccountHome: VoidFunctionComponent = () => {
  const { user } = useUser();
  const { data: orgs } = useOrgs();
  const { accountId } = useRouteAccountInfo();

  if (!user) {
    return (
      <MainContentWrapper>
        <h2>
          You must be{" "}
          <Link href="/login" noLinkStyle>
            <Box
              component="strong"
              sx={{
                paddingBottom: "3px",
                borderBottom: `3px solid transparent`,

                "&:hover": {
                  borderBottom: ({ palette }) =>
                    `3px solid ${palette.blue[70]}`,
                },
              }}
            >
              logged in
            </Box>
          </Link>{" "}
          to access this workspace.
        </h2>
      </MainContentWrapper>
    );
  }

  const ownWorkspace = accountId === user.accountId;

  const thisOrg = ownWorkspace
    ? undefined
    : orgs.find((org) => org.entityId === accountId);

  if (!ownWorkspace && !thisOrg) {
    return (
      <MainContentWrapper>
        <h2>This workspace does not exist or you do not have access to it.</h2>
      </MainContentWrapper>
    );
  }

  const workspaceName = ownWorkspace ? "your" : `${thisOrg!.name}'s`;

  return (
    <MainContentWrapper>
      <Box component="header" mt={1.5}>
        <Typography mb={2} variant="h1">
          Hi, {user.properties.preferredName}!
        </Typography>
        <Typography mb={2} variant="h3">
          Welcome to {workspaceName} workspace.
        </Typography>
      </Box>
      <Typography>
        Please select a page from the list, or create a new page.
      </Typography>
    </MainContentWrapper>
  );
};

export default AccountHome;
