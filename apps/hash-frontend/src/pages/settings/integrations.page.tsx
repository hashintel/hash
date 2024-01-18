import { apiOrigin } from "@local/hash-isomorphic-utils/environment";
import { Box, Paper, Typography } from "@mui/material";
import { FunctionComponent, useContext } from "react";

import { isProduction } from "../../lib/config";
import { extractOwnedById } from "../../lib/user-and-org";
import { NextPageWithLayout } from "../../shared/layout";
import { Link } from "../../shared/ui";
import { Button } from "../../shared/ui/button";
import { WorkspaceContext } from "../shared/workspace-context";
import { getSettingsLayout } from "./shared/settings-layout";
import { SettingsPageContainer } from "./shared/settings-page-container";

const AddNewIntegrations: FunctionComponent = () => {
  const { activeWorkspace } = useContext(WorkspaceContext);

  if (!activeWorkspace) {
    return <>Loading workspace...</>;
  }

  return (
    <>
      <Typography variant="h5">Add new integration</Typography>
      <Box>
        <Paper
          sx={{
            padding: ({ spacing }) => spacing(2.25, 3.5),
            width: "min-content",
            minWidth: 250,
          }}
        >
          <Box display="flex" justifyContent="flex-end">
            <Button
              openInNewTab={false}
              variant="tertiary"
              size="small"
              href={`${apiOrigin}/oauth/linear?ownedById=${extractOwnedById(
                activeWorkspace,
              )}`}
              sx={{
                padding: ({ spacing }) => spacing(1, 1.5),
                minHeight: 1,
              }}
            >
              Connect
            </Button>
          </Box>
          <Typography>
            <strong>Linear</strong>
          </Typography>
          <Typography sx={{ fontSize: 14 }}>
            2-way sync Linear activity and data with HASH
          </Typography>
        </Paper>
      </Box>
    </>
  );
};

const IntegrationsPage: NextPageWithLayout = () => {
  return (
    <SettingsPageContainer
      heading="Integrations"
      subHeading="Connected to your user account"
      disableContentWrapper
    >
      {/* @todo: add ability to setup integrations in production */}
      {isProduction ? (
        <>
          <Typography gutterBottom>
            No integrations are currently available to your account.
          </Typography>
          <Typography>
            Please <Link href="https://hash.ai/contact">contact us</Link> if
            you'd like to suggest a new integration, or request access to an
            existing one.
          </Typography>
        </>
      ) : (
        <AddNewIntegrations />
      )}
    </SettingsPageContainer>
  );
};

IntegrationsPage.getLayout = (page) => getSettingsLayout(page);

export default IntegrationsPage;
