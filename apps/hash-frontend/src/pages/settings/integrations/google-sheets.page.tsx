import { Box, Container, Stack, Typography } from "@mui/material";
import { useState } from "react";

import type { NextPageWithLayout } from "../../../shared/layout";
import { Button } from "../../../shared/ui/button";
import { getSettingsLayout } from "../shared/settings-layout";
import { CreateOrEditSheetsIntegration } from "./google-sheets/create-or-edit-sheets-integration";
import { GoogleAuthProvider } from "./google-sheets/google-auth-context";
import type { UseSheetsIntegrationsData } from "./google-sheets/use-sheet-integrations";
import { useSheetsIntegrations } from "./google-sheets/use-sheet-integrations";

const GoogleSheetsPage: NextPageWithLayout = () => {
  const [addingNewIntegration, setAddingNewIntegration] = useState(false);
  const [integrationToEdit, setIntegrationToEdit] = useState<
    UseSheetsIntegrationsData["integrations"][0] | null
  >(null);

  const {
    integrations,
    loading: integrationsLoading,
    refetch,
  } = useSheetsIntegrations();

  const stopEditing = () => {
    setAddingNewIntegration(false);
    setIntegrationToEdit(null);
  };

  return (
    <GoogleAuthProvider>
      <Container>
        <Typography variant="h1" mt={0} mb={4} fontWeight="bold">
          Google Sheets
        </Typography>
        <Typography mb={4}>
          Connect to Google Sheets to sync entity data to your spreadsheet(s).
          You will choose which files we are able to access – we cannot access
          files you don't choose.
        </Typography>
        {addingNewIntegration || integrationToEdit ? (
          <CreateOrEditSheetsIntegration
            close={stopEditing}
            currentIntegration={integrationToEdit}
            onComplete={() => {
              refetch();
              stopEditing();
            }}
          />
        ) : (
          <Box>
            <Button onClick={() => setAddingNewIntegration(true)}>
              Add new sync
            </Button>
          </Box>
        )}
        {!integrationsLoading && !!integrations.length && (
          <Box mt={4}>
            <Typography variant="h4" mb={1}>
              Existing syncs
            </Typography>
            <Stack gap={2}>
              {integrations.map((integration) => {
                return (
                  <Box key={integration.metadata.recordId.entityId}>
                    <Typography>
                      Account:{" "}
                      {
                        integration.account.properties[
                          "https://hash.ai/@hash/types/property-type/email/"
                        ]
                      }
                    </Typography>
                    <Typography>
                      Sheet id:{" "}
                      {
                        integration.properties[
                          "https://hash.ai/@hash/types/property-type/file-id/"
                        ]
                      }
                    </Typography>
                    <Button onClick={() => setIntegrationToEdit(integration)}>
                      Edit
                    </Button>
                  </Box>
                );
              })}
            </Stack>
          </Box>
        )}
      </Container>
    </GoogleAuthProvider>
  );
};

GoogleSheetsPage.getLayout = (page) => getSettingsLayout(page);
export default GoogleSheetsPage;
