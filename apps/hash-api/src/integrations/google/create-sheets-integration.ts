import { createDefaultAuthorizationRelationships } from "@local/hash-isomorphic-utils/graph-queries";
import {
  blockProtocolLinkEntityTypes,
  systemEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { GoogleSheetsIntegrationProperties } from "@local/hash-isomorphic-utils/system-types/googlesheetsintegration";
import { EntityId, OwnedById } from "@local/hash-subgraph";
import { RequestHandler } from "express";
import { google } from "googleapis";

import { createEntity } from "../../graph/knowledge/primitive/entity";
import { enabledIntegrations } from "../enabled-integrations";
import { googleOAuth2Client } from "./client";
import { getGoogleAccountById } from "./shared/get-google-account";
import { getSecretsForAccount } from "./shared/get-secrets-for-account";

const sheets = google.sheets({
  auth: googleOAuth2Client,
  version: "v4",
});

const createSpreadsheet = async (filename: string) => {
  const sheet = await sheets.spreadsheets.create({
    requestBody: {
      properties: {
        title: filename,
      },
    },
  });

  const spreadsheetId = sheet.data.spreadsheetId;

  if (!spreadsheetId) {
    throw new Error("No spreadsheetId returned from Google Sheets API");
  }

  return spreadsheetId;
};

const updateSpreadsheet = (spreadsheetFileId: string, contents: any) => {
  const sheet = await sheets.spreadsheets.batchUpdate({
    spreadsheetId: spreadsheetFileId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: {
              title: "Sheet1",
            },
          },
        },
        {
          updateCells: {
            fields: "*",
            range: {
              sheetId: 0,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: 1,
            },
            rows: [
              // @todo convert a subgraph to rows
              {
                values: [
                  {
                    userEnteredValue: {
                      formulaValue: "=SUM(1, 2, 3)",
                    },
                  },
                ],
              },
            ],
          },
        },
      ],
    },
  });
};

type SyncToSheetRequestBody = {
  googleAccountId: string;
  queryEntityId: EntityId;
  schedule: "hourly" | "daily" | "weekly" | "monthly";
} & (
  | {
      fileId: string;
    }
  | { newFileName: string }
);

type SyncToSheetResponseBody = { ok: "Ok" } | { error: string };

export const createSheetsIntegration: RequestHandler<
  Record<string, never>,
  SyncToSheetResponseBody,
  SyncToSheetRequestBody
> =
  // @todo upgrade to Express 5, which handles errors from async request handlers automatically
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  async (req, res) => {
    if (!req.user) {
      res.status(401).send({ error: "User not authenticated." });
      return;
    }

    if (!req.context.vaultClient) {
      res.status(501).send({ error: "Vault integration is not configured." });
      return;
    }

    if (!enabledIntegrations.googleSheets) {
      res.status(501).send({ error: "Google integration is not enabled." });
      return;
    }

    const authentication = { actorId: req.user.accountId };

    const { googleAccountId, queryEntityId, schedule } = req.body;

    /**
     * Get the Google Account and ensure it has an available token
     */
    const googleAccount = await getGoogleAccountById(
      req.context,
      authentication,
      {
        userAccountId: req.user.accountId,
        googleAccountId,
      },
    );

    if (!googleAccount) {
      res.status(400).send({
        error: `Google account with id ${googleAccountId} not found.`,
      });
      return;
    }

    const secretAndLinkPairs = await getSecretsForAccount(
      req.context,
      authentication,
      {
        userAccountId: req.user.accountId,
        googleAccountEntityId: googleAccount.properties[
          "https://hash.ai/@hash/types/property-type/account-id/"
        ] as EntityId,
      },
    );

    if (secretAndLinkPairs.length === 0) {
      res.status(400).send({
        error: `No secrets found for Google account with id ${googleAccountId}.`,
      });
      return;
    }

    /**
     * Find the spreadsheetId to use with the integration by either:
     * 1. Confirming it exists and is accessible if an existing id has been provided, or
     * 2. Creating a new spreadsheet if a filename has been provided
     */
    if (!("fileId" in req.body) && !("newFileName" in req.body)) {
      res.status(400).send({
        error: "Either fileId or newFileName must be provided.",
      });
      return;
    }

    if ("fileId" in req.body) {
      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId: req.body.fileId,
      });
      if (!spreadsheet) {
        res.status(400).send({
          error: `No spreadsheet found with id ${req.body.fileId}.`,
        });
        return;
      }
    }

    const spreadsheetId =
      "fileId" in req.body
        ? req.body.fileId
        : await createSpreadsheet(req.body.newFileName);

    const googleSheetIntegrationProperties: GoogleSheetsIntegrationProperties =
      {
        "https://hash.ai/@hash/types/property-type/file-id/": spreadsheetId,
        "https://hash.ai/@hash/types/property-type/schedule/": schedule,
      };

    const googleSheetIntegrationEntity = await createEntity(
      req.context,
      authentication,
      {
        entityType: systemEntityTypes.googleSheetsIntegration.entityTypeId,
        ownedById: req.user.accountId as OwnedById,
        properties: googleSheetIntegrationProperties,
        relationships: createDefaultAuthorizationRelationships({
          actorId: req.user.accountId,
        }),
        outgoingLinks: [
          {
            ownedById: req.user.accountId as OwnedById,
            rightEntityId: queryEntityId,
            linkEntityTypeId:
              blockProtocolLinkEntityTypes.hasQuery.linkEntityTypeId,
            relationships: createDefaultAuthorizationRelationships({
              actorId: req.user.accountId,
            }),
          },
        ],
      },
    );

    return googleSheetIntegrationEntity;
  };
