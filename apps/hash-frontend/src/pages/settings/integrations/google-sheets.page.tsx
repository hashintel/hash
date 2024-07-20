import { useState } from "react";
import { Box, Container, Typography } from "@mui/material";

import type { NextPageWithLayout } from "../../../shared/layout";
import { Button } from "../../../shared/ui/button";
import { GoogleAuthProvider } from "../../shared/integrations/google/google-auth-context";
import { getSettingsLayout } from "../../shared/settings-layout";

import { CreateOrEditSheetsSync } from "./google-sheets/create-or-edit-sheets-sync";
import { useSheetsFlows } from "./google-sheets/use-sheet-integrations";

const GoogleSheetsPage: NextPageWithLayout = () => {
  const [addingNewIntegration, setAddingNewIntegration] = useState(false);
  const [_integrationToEdit, setIntegrationToEdit] = useState<null>(null);

  const { refetch } = useSheetsFlows();

  const stopEditing = () => {
    setAddingNewIntegration(false);
    setIntegrationToEdit(null);
  };

  return (
    <GoogleAuthProvider>
      <Container>
        <Typography variant={"h1"} mt={0} mb={4} fontWeight={"bold"}>
          WIP: Google Sheets
        </Typography>
        <Typography mb={4}>
          This UI requires updating to take account of Flows – visit `/flows` to
          create a Google Sheet sync instead
        </Typography>
        {addingNewIntegration ? (
          <CreateOrEditSheetsSync
            close={stopEditing}
            currentFlow={null}
            onComplete={() => {
              refetch();
              stopEditing();
            }}
          />
        ) : (
          <Box>
            <Button onClick={() => { setAddingNewIntegration(true); }}>
              Add new sync
            </Button>
          </Box>
        )}
      </Container>
    </GoogleAuthProvider>
  );
};

GoogleSheetsPage.getLayout = (page) => getSettingsLayout(page);
export default GoogleSheetsPage;
