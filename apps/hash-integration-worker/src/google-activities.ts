import {
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
import type { sheets_v4 } from "googleapis";

import { createSheetRequestsFromEntitySubgraph } from "./google-activities/convert-subgraph-to-sheet-requests";

export const writeSubgraphToGoogleSheet = async ({
  spreadsheetId,
  entitySubgraph,
  sheetsClient,
}: {
  spreadsheetId: string;
  entitySubgraph: Subgraph<EntityRootType>;
  sheetsClient: sheets_v4.Sheets;
}) => {
  const spreadsheet = await sheetsClient.spreadsheets.get({
    spreadsheetId,
  });

  const sheetRequests = createSheetRequestsFromEntitySubgraph(entitySubgraph, {
    audience: "human",
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
}: {
  graphApiClient: GraphApi;
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
    ...params: Parameters<typeof writeSubgraphToGoogleSheet>
  ) {
    return writeSubgraphToGoogleSheet(...params);
  },
});
