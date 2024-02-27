import { apiOrigin } from "@local/hash-isomorphic-utils/environment";
import { Box, Container, Typography } from "@mui/material";
import Script from "next/script";
import { useEffect, useState } from "react";

import { NextPageWithLayout } from "../../../shared/layout";
import { Button } from "../../../shared/ui/button";
import { getSettingsLayout } from "../shared/settings-layout";

const GoogleSheetsPage: NextPageWithLayout = () => {
  const [googleClient, setGoogleClient] =
    useState<google.accounts.oauth2.CodeClient | null>(null);

  useEffect(() => {
    const client = google.accounts.oauth2.initCodeClient({
      client_id:
        "1045336525411-t3lces4tvsbig9g6c4k2k488n9h6ibnm.apps.googleusercontent.com",
      scope: "https://www.googleapis.com/auth/drive.file",
      ux_mode: "popup",
      callback: async (response) => {
        console.log("Received response from Google", response);

        const apiResponse = await fetch(`${apiOrigin}/oauth/google/callback`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ code: response.code }),
        }).then((resp) => resp.json());

        console.log({ apiResponse });
      },
    });

    setGoogleClient(client);
  }, []);

  return (
    <>
      <Script src="https://accounts.google.com/gsi/client" />
      <Container>
        <Typography variant="h1" mt={10} mb={4} fontWeight="bold">
          Google Sheets
        </Typography>
        <Typography mb={4}>
          Connect to Google Sheets to sync entity data to your spreadsheet(s)
        </Typography>
        <Box>
          <Button
            onClick={() => {
              googleClient?.requestCode();
            }}
          >
            Get started
          </Button>
        </Box>
      </Container>
    </>
  );
};

GoogleSheetsPage.getLayout = (page) => getSettingsLayout(page);
export default GoogleSheetsPage;
