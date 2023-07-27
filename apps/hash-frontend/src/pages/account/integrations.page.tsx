import { apiOrigin } from "@local/hash-graphql-shared/environment";
import { Box, Container, Typography } from "@mui/material";
import { useContext } from "react";

import { getLayoutWithSidebar, NextPageWithLayout } from "../../shared/layout";
import { Button } from "../../shared/ui/button";
import { WorkspaceContext } from "../shared/workspace-context";

const IntegrationsPage: NextPageWithLayout = () => {
  const { activeWorkspace } = useContext(WorkspaceContext);

  if (!activeWorkspace) {
    return <>Loading workspace...</>;
  }

  return (
    <Container>
      <Box sx={{ paddingLeft: 4 }}>
        <Typography variant="h1" mt={10} mb={4} fontWeight="bold">
          Integrations
        </Typography>
        <Button
          href={`${apiOrigin}/oauth/linear?ownedById=${activeWorkspace.accountId}`}
        >
          Connect Linear account
        </Button>
      </Box>
    </Container>
  );
};

IntegrationsPage.getLayout = (page) =>
  getLayoutWithSidebar(page, { fullWidth: true });

export default IntegrationsPage;
