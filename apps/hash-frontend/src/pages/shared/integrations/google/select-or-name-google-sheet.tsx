import { useState } from "react";
import { AlertModal, TextField } from "@hashintel/design-system";
import type { GoogleSheet } from "@local/hash-isomorphic-utils/flows/types";
import { Box, outlinedInputClasses, Stack, Typography } from "@mui/material";

import { Button } from "../../../../shared/ui/button";

import { useGoogleAuth } from "./google-auth-context";
import { GoogleFilePicker } from "./google-file-picker";

interface SelectOrNameGoogleSheetProps {
  googleAccountId?: string;
  googleSheet?: GoogleSheet;
  setGoogleSheet: (googleSheet: GoogleSheet) => void;
}

export const SelectOrNameGoogleSheet = ({
  googleAccountId,
  googleSheet,
  setGoogleSheet,
}: SelectOrNameGoogleSheetProps) => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [showReauthModal, setShowReauthModal] = useState(false);

  const authContext = useGoogleAuth();

  if (authContext.loading) {
    return null;
  }

  const { addGoogleAccount, getAccessToken } = authContext;

  const newSheetName =
    googleSheet && "newSheetName" in googleSheet
      ? googleSheet.newSheetName
      : "";
  const existingSpreadsheetId =
    googleSheet && "spreadsheetId" in googleSheet
      ? googleSheet.spreadsheetId
      : null;

  return (
    <>
      {showReauthModal && (
        <AlertModal
          type={"info"}
          callback={() => {
            addGoogleAccount();
          }}
          calloutMessage={
            "Access to this Google account has expired or been revoked"
          }
          close={() => {
            setShowReauthModal(false);
          }}
        >
          <Typography>
            Please log in with Google again to continue setting up the flow.
          </Typography>
        </AlertModal>
      )}
      {accessToken && (
        <GoogleFilePicker
          accessToken={accessToken}
          onUserChoice={(file) => {
            setAccessToken(null);

            if (file) {
              setGoogleSheet({
                spreadsheetId: file.id,
              });
            }
          }}
        />
      )}
      <Stack alignItems={"center"} direction={"row"} gap={1.5}>
        <Box>
          <Button
            disabled={!googleAccountId}
            size={"xs"}
            onClick={async () => {
              if (!googleAccountId) {
                return;
              }

              try {
                const response = await getAccessToken({
                  googleAccountId,
                });

                setAccessToken(response.accessToken);
              } catch {
                setShowReauthModal(true);
              }
            }}
          >
            Choose {existingSpreadsheetId ? "a different" : "a"} file
          </Button>
        </Box>
        <Typography variant={"smallTextParagraphs"}>or</Typography>
        <Box>
          <TextField
            value={newSheetName}
            placeholder={"Name a new file"}
            sx={{
              [`.${outlinedInputClasses.root} input`]: {
                fontSize: 15,
                px: 2,
                py: 1,
              },
            }}
            onChange={(event) => {
              setGoogleSheet({
                newSheetName: event.target.value,
              });
            }}
          />
        </Box>
      </Stack>
    </>
  );
};
