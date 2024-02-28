import { apiOrigin } from "@local/hash-isomorphic-utils/environment";
import { Box, Container, Typography } from "@mui/material";
import Script from "next/script";
import { useState } from "react";

import { NextPageWithLayout } from "../../../shared/layout";
import { Button } from "../../../shared/ui/button";
import { getSettingsLayout } from "../shared/settings-layout";
import { GoogleFilePicker } from "./google-sheets/google-file-picker";

const googleOAuthClientId = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID;

const GoogleSheetsPage: NextPageWithLayout = () => {
  const [oauthClient, setOAuthClient] =
    useState<google.accounts.oauth2.CodeClient | null>(null);
  const [accessToken, setAccessToken] = useState("");

  const loadOAuthClient = () => {
    if (!googleOAuthClientId) {
      throw new Error("GOOGLE_OAUTH_CLIENT_ID is not set");
    }

    const client = google.accounts.oauth2.initCodeClient({
      client_id: googleOAuthClientId,
      scope:
        /**
         * Scopes required:
         * drive.file in order to create new files or to read/update/delete existing files that the user picks
         * userinfo.email in order to know which Google account the token is associated with, in case the user has multiple
         */
        "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email",
      ux_mode: "popup",
      callback: async (response) => {
        if (response.error === "access_denied") {
          return;
        } else if (response.error) {
          throw new Error(`Google OAuth error: ${response.error}`);
        }

        const apiResponse = await fetch(`${apiOrigin}/oauth/google/callback`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ code: response.code }),
        }).then((resp) => resp.json());

        console.log({ apiResponse });

        setAccessToken(apiResponse.accessToken);
      },
    });

    setOAuthClient(client);
  };

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        onLoad={loadOAuthClient}
      />
      {accessToken && (
        <GoogleFilePicker
          accessToken={accessToken}
          onFilePicked={console.log}
        />
      )}
      <Container>
        <Typography variant="h1" mt={10} mb={4} fontWeight="bold">
          Google Sheets
        </Typography>
        <Typography mb={4}>
          Connect to Google Sheets to sync entity data to your spreadsheet(s).
          You will choose which files we are able to access – we cannot access
          files you don't choose.
        </Typography>
        <Box>
          <Button
            onClick={() => {
              if (!oauthClient) {
                throw new Error("Google client not initialized");
              }
              oauthClient.requestCode();
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
