import { stringifyPropertyValue } from "@apps/hash-frontend/src/pages/shared/entities-table/stringify-property-value";
import { MultiFilter } from "@blockprotocol/graph";
import { typedKeys } from "@local/advanced-types/typed-entries";
import {
  createDefaultAuthorizationRelationships,
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  blockProtocolLinkEntityTypes,
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { QueryProperties } from "@local/hash-isomorphic-utils/system-types/blockprotocol/query";
import { GoogleSheetsIntegrationProperties } from "@local/hash-isomorphic-utils/system-types/googlesheetsintegration";
import {
  Entity,
  EntityId,
  EntityRootType,
  OwnedById,
  Subgraph,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { RequestHandler } from "express";
import { Auth, google, sheets_v4 } from "googleapis";

import {
  createEntity,
  getEntities,
  getLatestEntityById,
} from "../../graph/knowledge/primitive/entity";
import { bpMultiFilterToGraphFilter } from "../../graph/knowledge/primitive/entity/query";
import { enabledIntegrations } from "../enabled-integrations";
import { googleOAuth2Client } from "./oauth-client";
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

const entitySubgraphToRows = (
  entitySubgraph: Subgraph<EntityRootType>,
): sheets_v4.Schema$RowData[] => {
  const entities = getRoots(entitySubgraph);

  if (!entities[0]) {
    return [];
  }

  const propertyKeys = typedKeys(entities[0].properties);

  const headers = ["entityId", ...propertyKeys];

  const headerRow = {
    values: headers.map((header) => {
      return {
        userEnteredValue: {
          stringValue: header,
        },
      };
    }),
  };

  const valueRows = getRoots(entitySubgraph).map((entity) => {
    return {
      values: [
        {
          userEnteredValue: {
            stringValue: entity.metadata.recordId.entityId,
          },
        },
        ...propertyKeys.map((key) => {
          const value = entity.properties[key];

          if (typeof value === "number") {
            return {
              userEnteredValue: {
                numberValue: value,
              },
            };
          } else if (typeof value === "boolean") {
            return {
              userEnteredValue: {
                boolValue: value,
              },
            };
          }

          return {
            userEnteredValue: {
              stringValue: stringifyPropertyValue(value),
            },
          };
        }),
      ],
    };
  });

  return [headerRow, ...valueRows];
};

const updateSpreadsheet = async (
  spreadsheetId: string,
  rows: sheets_v4.Schema$RowData[],
) => {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        // {
        //   updateSheetProperties: {
        //     properties: {
        //       title: "Entities",
        //     },
        //   },
        // },
        {
          updateCells: {
            fields: "*",
            range: {
              sheetId: 0,
              startRowIndex: 0,
            },
            rows,
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
      spreadsheetId: string;
    }
  | { newFileName: string }
);

type SyncToSheetResponseBody =
  | { integrationEntity: Entity }
  | { error: string };

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
        googleAccountEntityId: googleAccount.metadata.recordId.entityId,
      },
    );

    if (!secretAndLinkPairs[0]) {
      res.status(400).send({
        error: `No secrets found for Google account with id ${googleAccountId}.`,
      });
      return;
    }

    const { userSecret } = secretAndLinkPairs[0];

    const vaultPath =
      userSecret.properties[
        "https://hash.ai/@hash/types/property-type/vault-path/"
      ];

    const tokens = await req.context.vaultClient.read<Auth.Credentials>({
      secretMountPath: "secret",
      path: vaultPath,
    });

    googleOAuth2Client.setCredentials(tokens.data);

    /**
     * Find the spreadsheetId to use with the integration by either:
     * 1. Confirming it exists and is accessible if an existing id has been provided, or
     * 2. Creating a new spreadsheet if a filename has been provided
     */
    if (!("spreadsheetId" in req.body) && !("newFileName" in req.body)) {
      res.status(400).send({
        error: "Either spreadsheetId or newFileName must be provided.",
      });
      return;
    }

    if ("spreadsheetId" in req.body) {
      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId: req.body.spreadsheetId,
      });

      if (!spreadsheet.data.spreadsheetId) {
        res.status(400).send({
          error: `No spreadsheet found with id ${req.body.spreadsheetId}.`,
        });
        return;
      }
    }

    const queryEntity = (await getLatestEntityById(
      req.context,
      authentication,
      {
        entityId: queryEntityId,
      },
    )) as Entity<QueryProperties>;

    const multiFilter =
      queryEntity.properties[
        "https://blockprotocol.org/@hash/types/property-type/query/"
      ];

    const filter = bpMultiFilterToGraphFilter(multiFilter as MultiFilter);

    const entitySubgraph = await getEntities(req.context, authentication, {
      query: {
        filter,
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
      },
    });

    const spreadsheetId =
      "spreadsheetId" in req.body
        ? req.body.spreadsheetId
        : await createSpreadsheet(req.body.newFileName);

    const rows = entitySubgraphToRows(entitySubgraph);

    console.log(JSON.stringify({ rows }, undefined, 2));

    await updateSpreadsheet(spreadsheetId, rows);

    const googleSheetIntegrationProperties: GoogleSheetsIntegrationProperties =
      {
        "https://hash.ai/@hash/types/property-type/file-id/": spreadsheetId,
      };

    const googleSheetIntegrationEntity = await createEntity(
      req.context,
      authentication,
      {
        entityTypeId: systemEntityTypes.googleSheetsIntegration.entityTypeId,
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
          {
            ownedById: req.user.accountId as OwnedById,
            rightEntityId: googleAccount.metadata.recordId.entityId,
            linkEntityTypeId:
              systemLinkEntityTypes.associatedWithAccount.linkEntityTypeId,
            relationships: createDefaultAuthorizationRelationships({
              actorId: req.user.accountId,
            }),
          },
        ],
      },
    );

    res.json({ integrationEntity: googleSheetIntegrationEntity });
  };
