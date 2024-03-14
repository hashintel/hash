import { apiOrigin } from "@local/hash-isomorphic-utils/environment";
import { Box, Paper, Stack, Typography } from "@mui/material";
import type { FunctionComponent } from "react";
import { useContext } from "react";

import { isProduction } from "../../lib/config";
import { extractOwnedById } from "../../lib/user-and-org";
import type { NextPageWithLayout } from "../../shared/layout";
import { Link } from "../../shared/ui";
import { Button } from "../../shared/ui/button";
import { WorkspaceContext } from "../shared/workspace-context";
import { getSettingsLayout } from "./shared/settings-layout";
import { SettingsPageContainer } from "./shared/settings-page-container";

type IntegrationCardProps = {
  href: string;
  name: string;
  description: string;
};

const IntegrationCard = ({ href, name, description }: IntegrationCardProps) => {
  return (
    <Paper
      sx={{
        padding: ({ spacing }) => spacing(2.25, 3.5),
        width: "min-content",
        minWidth: 250,
      }}
    >
      <Box display="flex" justifyContent="flex-end" mb={1}>
        <Button
          openInNewTab={false}
          variant="tertiary"
          size="small"
          href={href}
          sx={{
            padding: ({ spacing }) => spacing(1, 1.5),
            minHeight: 1,
          }}
        >
          Connect
        </Button>
      </Box>
      <Typography>
        <strong>{name}</strong>
      </Typography>
      <Typography sx={{ fontSize: 14 }}>{description}</Typography>
    </Paper>
  );
};

const AddNewIntegrations: FunctionComponent = () => {
  const { activeWorkspace } = useContext(WorkspaceContext);

  if (!activeWorkspace) {
    return <>Loading workspace...</>;
  }

  return (
    <>
      <Typography variant="h5" mb={2}>
        Add new integration
      </Typography>
      <Stack direction="row" gap={2}>
        <IntegrationCard
          href={`${apiOrigin}/oauth/linear?ownedById=${extractOwnedById(
            activeWorkspace,
          )}`}
          name="Linear"
          description="2-way sync Linear activity and data with HASH"
        />
        <IntegrationCard
          href="/settings/integrations/google-sheets"
          name="Google Sheets"
          description="Sync entity data to Google Sheets"
        />
      </Stack>
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
