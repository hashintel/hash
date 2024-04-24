import {
  createGoogleOAuth2Client,
  getGoogleAccountById,
  getTokensForGoogleAccount,
} from "@local/hash-backend-utils/google";
import type { VaultClient } from "@local/hash-backend-utils/vault";
import type { GraphApi } from "@local/hash-graph-client";
import { getSimplifiedActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import { google } from "googleapis";

import type { FlowActionActivity } from "./types";
import { createSheetRequestsFromEntitySubgraph } from "./write-google-sheet-action/convert-subgraph-to-sheet-requests";

export const writeGoogleSheetAction: FlowActionActivity<{
  graphApiClient: GraphApi;
  vaultClient: VaultClient;
}> = async ({ graphApiClient, inputs, userAuthentication, vaultClient }) => {
  const { googleAccountId, spreadsheetId } = getSimplifiedActionInputs({
    inputs,
    actionType: "writeGoogleSheet",
  });

  /**
   * Get the Google Account and ensure it has an available token
   */
  const googleAccount = await getGoogleAccountById({
    googleAccountId,
    graphApiClient,
    userAccountId: userAuthentication.actorId,
  });

  const googleAccountEntityId = googleAccount.metadata.recordId.entityId;
  const userAccountId = userAuthentication.actorId;

  if (!googleAccount) {
    throw new Error(`Google account with id ${googleAccountId} not found.`);
  }

  const tokens = await getTokensForGoogleAccount({
    googleAccountEntityId,
    graphApiClient,
    userAccountId: userAuthentication.actorId,
    vaultClient,
  });

  if (!tokens) {
    // @todo flag user secret entity is invalid and create notification for user
    throw new Error(
      `Could not get tokens for Google account with id ${googleAccountEntityId} for user ${userAccountId}.`,
    );
  }

  const googleOAuth2Client = createGoogleOAuth2Client();
  const sheetsClient = google.sheets({
    auth: googleOAuth2Client,
    version: "v4",
  });

  googleOAuth2Client.setCredentials(tokens);
  const spreadsheet = await sheetsClient.spreadsheets.get({
    spreadsheetId,
  });

  const sheetRequests = createSheetRequestsFromEntitySubgraph(entitySubgraph, {
    audience,
  });

  const existingSheets = spreadsheet.data.sheets ?? [];

  /**
   * We can't leave the spreadsheet without a sheet, so we need to insert one first and delete it at the end,
   * to allow clearing out the existing sheets. sheetId is an Int32
   */
  const placeholderFirstSheetId = 2147483647;

  await sheetsClient.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: {
              sheetId: placeholderFirstSheetId,
              title: "Placeholder",
            },
          },
        },
        ...existingSheets.map((sheet) => ({
          deleteSheet: {
            sheetId: sheet.properties?.sheetId,
          },
        })),
        ...sheetRequests,
        {
          deleteSheet: {
            sheetId: placeholderFirstSheetId,
          },
        },
      ],
    },
  });
};
