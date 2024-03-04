import type { MultiFilter } from "@blockprotocol/graph";
import { EntityType } from "@blockprotocol/type-system";
import { typedEntries, typedKeys } from "@local/advanced-types/typed-entries";
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
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";
import { QueryProperties } from "@local/hash-isomorphic-utils/system-types/blockprotocol/query";
import { GoogleSheetsIntegrationProperties } from "@local/hash-isomorphic-utils/system-types/googlesheetsintegration";
import {
  BaseUrl,
  Entity,
  EntityId,
  EntityRootType,
  isEntityVertex,
  OwnedById,
  Subgraph,
} from "@local/hash-subgraph";
import {
  getEntityTypeById,
  getPropertyTypeForEntity,
  getRoots,
} from "@local/hash-subgraph/stdlib";
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

const createColumnsForEntity = (entityType: EntityType, subgraph: Subgraph) => {
  const columns: Record<
    string,
    {
      column: string;
      label: string;
    }
  > = {
    entityId: {
      column: "A",
      label: "EntityId",
    },
    label: {
      column: "B",
      label: "Label",
    },
    editionCreatedAt: {
      column: "C",
      label: "EditionCreatedAt",
    },
    entityCreatedAt: {
      column: "D",
      label: "EntityCreatedAt",
    },
    draft: {
      column: "E",
      label: "Draft",
    },
  };

  const entityTypeProperties = entityType.properties;
  let nextColumnIndex = Object.keys(columns).length;
  for (const [baseUrl] of typedEntries(entityTypeProperties)) {
    const { propertyType } = getPropertyTypeForEntity(
      subgraph,
      entityType.$id,
      baseUrl as BaseUrl,
    );
    columns[baseUrl] = {
      column: String.fromCharCode(65 + nextColumnIndex),
      label: propertyType.title,
    };
    nextColumnIndex++;
  }

  return columns;
};

const createCellFromValue = (value: unknown) => {
  switch (typeof value) {
    case "number": {
      return {
        userEnteredValue: {
          numberValue: value,
        },
      };
    }
    case "boolean": {
      return {
        userEnteredValue: {
          boolValue: value,
        },
      };
    }
    default: {
      return {
        userEnteredValue: {
          stringValue: stringifyPropertyValue(value),
        },
      };
    }
  }
};

type EntitySheets = {
  [sheetName: string]: {
    headers: sheets_v4.Schema$RowData;
    values: sheets_v4.Schema$RowData[];
  };
};

// @todo lock spreadsheet editing
const convertEntitySubgraphToSheets = (
  entitySubgraph: Subgraph<EntityRootType>,
): { [sheetName: string]: sheets_v4.Schema$RowData[] } => {
  const entitySheets: EntitySheets = {};

  for (const vertex of Object.values(entitySubgraph.vertices)) {
    const revisions = Object.values(vertex);
    for (const revision of revisions) {
      if (!isEntityVertex(revision)) {
        continue;
      }

      const entity = revision.inner;
      const entityType = getEntityTypeById(
        entitySubgraph,
        entity.metadata.entityTypeId,
      );
      if (!entityType) {
        throw new Error(
          `Entity type ${entity.metadata.entityTypeId} not found for entity ${entity.metadata.recordId.entityId}`,
        );
      }

      const sheetName = entityType.schema.title;

      const colummns = createColumnsForEntity(entityType, entitySubgraph);

      if (!entitySheets[sheetName]) {
        entitySheets[sheetName] = {
          headers: [],
          values: [],
        };
      }

      const entityRow: sheets_v4.Schema$RowData = [];
      for (const [column, { column: columnLetter }] of typedEntries(
        entitySheets[sheetName].headers,
      )) {
        const value = entity.properties[column];
        entityRow.push(createCellFromValue(value));
      }
    }
  }

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
  entitySubgraph: Subgraph<EntityRootType>,
) => {
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId,
  });

  const sheetsToWrite = convertEntitySubgraphToSheets(entitySubgraph);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        ...(spreadsheet.data.sheets ?? []).map((sheet) => ({
          deleteSheet: {
            sheetId: sheet.properties?.sheetId,
          },
        })),
        ...Object.entries(sheetsToWrite).flatMap(([sheetName, rows], index) => [
          {
            addSheet: {
              properties: {
                sheetId: index,
                title: sheetName,
              },
            },
          },
          {
            updateCells: {
              fields: "*",
              range: {
                sheetId: index,
                startRowIndex: 0,
              },
              rows,
            },
          },
        ]),
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

    const rows = convertEntitySubgraphToRows(entitySubgraph);

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
