import {
  createGoogleOAuth2Client,
  getGoogleSheetsIntegrationEntities,
  getTokensForGoogleAccount,
} from "@local/hash-backend-utils/google";
import type { VaultClient } from "@local/hash-backend-utils/vault";
import type { GraphApi } from "@local/hash-graph-client";
import type {
  AccountId,
  EntityId,
  EntityRootType,
  Subgraph,
} from "@local/hash-subgraph";
import { google } from "googleapis";

import { createSheetRequestsFromEntitySubgraph } from "./google-activities/convert-subgraph-to-sheet-requests";

export const writeSubgraphToGoogleSheet = async ({
  audience,
  entitySubgraph,
  googleAccountEntityId,
  graphApi,
  spreadsheetId,
  userAccountId,
  vaultClient,
}: {
  audience: "human" | "machine";
  /**
   * A subgraph containing the entities to write and all related types
   */
  entitySubgraph: Subgraph<EntityRootType>;
  graphApi: GraphApi;
  googleAccountEntityId: EntityId;
  spreadsheetId: string;
  userAccountId: AccountId;
  vaultClient: VaultClient;
}) => {
  const tokens = await getTokensForGoogleAccount({
    googleAccountEntityId,
    graphApi,
    userAccountId,
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

export const createGoogleActivities = ({
  graphApiClient,
  vaultClient,
}: {
  graphApiClient: GraphApi;
  vaultClient: VaultClient;
}) => ({
  getGoogleSheetsIntegrationEntities(params: {
    authentication: { actorId: AccountId };
    integrationEntityId: EntityId;
  }) {
    return getGoogleSheetsIntegrationEntities({
      ...params,
      graphApi: graphApiClient,
    });
  },
  getTokensForGoogleAccount(params: {
    googleAccountEntityId: EntityId;
    userAccountId: AccountId;
    vaultClient: VaultClient;
  }) {
    return getTokensForGoogleAccount({
      ...params,
      graphApi: graphApiClient,
    });
  },
  writeSubgraphToGoogleSheet(
    params: Omit<
      Parameters<typeof writeSubgraphToGoogleSheet>[0],
      "graphApi" | "vaultClient"
    >,
  ) {
    return writeSubgraphToGoogleSheet({
      ...params,
      graphApi: graphApiClient,
      vaultClient,
    });
  },
});
