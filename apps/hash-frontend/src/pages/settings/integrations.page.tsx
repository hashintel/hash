import { apiOrigin } from "@local/hash-isomorphic-utils/environment";
import { Box, Container, Paper, Typography } from "@mui/material";
import { FunctionComponent, useContext } from "react";

import { extractOwnedById } from "../../lib/user-and-org";
import { NextPageWithLayout } from "../../shared/layout";
import { Button } from "../../shared/ui/button";
import { WorkspaceContext } from "../shared/workspace-context";
import { getSettingsLayout } from "./shared/settings-layout";

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
    <Container>
      <Box sx={{ paddingLeft: 4 }}>
        <Typography variant="h1" mt={10} mb={4} fontWeight="bold">
          Integrations
        </Typography>
        <AddNewIntegrations />
      </Box>
    </Container>
  );
};

IntegrationsPage.getLayout = (page) => getSettingsLayout(page);

export default IntegrationsPage;
