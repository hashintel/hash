import type { MultiFilter } from "@blockprotocol/graph";
import { EntityType, VersionedUrl } from "@blockprotocol/type-system";
import { typedEntries, typedKeys } from "@local/advanced-types/typed-entries";
import { isDraftEntity } from "@local/hash-isomorphic-utils/entity-store";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import {
  createDefaultAuthorizationRelationships,
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  blockProtocolEntityTypes,
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
  EntityVertex,
  isEntityVertex,
  OwnedById,
  Subgraph,
} from "@local/hash-subgraph";
import {
  getEntityTypeAndParentsById,
  getEntityTypeById,
  getPropertyTypeForEntity,
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

type SheetOutputFormat = {
  audience: "human" | "machine";
};

const createColumnsForEntity = (
  entityType: EntityType,
  subgraph: Subgraph,
  format: SheetOutputFormat,
) => {
  const { audience } = format;
  const humanReadable = audience === "human";

  const columns: Record<
    string,
    {
      column: string;
      label: string;
    }
  > = {
    entityId: {
      column: "A",
      label: humanReadable ? "Entity Id" : "entityId",
    },
    label: {
      column: "B",
      label: humanReadable ? "Label" : "label",
    },
    editionCreatedAt: {
      column: "C",
      label: humanReadable ? "Edition Created At" : "editionCreatedAt",
    },
    entityCreatedAt: {
      column: "D",
      label: humanReadable ? "Entity Created At" : "entityCreatedAt",
    },
    draft: {
      column: "E",
      label: humanReadable ? "Draft" : "draft",
    },
  };

  const baseColumnCount = Object.keys(columns).length;

  let nextColumnIndex = baseColumnCount;

  const entityTypeAndParents = getEntityTypeAndParentsById(
    subgraph,
    entityType.$id,
  );

  const properties = new Set<BaseUrl>();
  const links = new Set<VersionedUrl>();

  for (const { schema } of entityTypeAndParents) {
    for (const baseUrl of typedKeys(schema.properties)) {
      properties.add(baseUrl as BaseUrl);
    }
    for (const linkTypeId of typedKeys(schema.links ?? {})) {
      links.add(linkTypeId);
    }
  }

  const isLinkType = entityTypeAndParents.find(
    (ancestor) =>
      ancestor.schema.$id === blockProtocolEntityTypes.link.entityTypeId,
  );

  if (isLinkType) {
    columns.leftEntityId = {
      column: String.fromCharCode(65 + nextColumnIndex),
      label: humanReadable ? "Source Entity Id" : "leftEntityId",
    };
    nextColumnIndex++;
    columns.rightEntityId = {
      column: String.fromCharCode(65 + nextColumnIndex),
      label: humanReadable ? "Target Entity Id" : "rightEntityId",
    };
    nextColumnIndex++;
  }

  const baseAndLinkDataColumnCount = nextColumnIndex;

  for (const linkTypeId of [...links]) {
    const linkEntityType = getEntityTypeById(subgraph, linkTypeId);
    if (!linkEntityType) {
      throw new Error(`Link type ${linkTypeId} not found in subgraph`);
    }

    columns[linkTypeId] = {
      column: String.fromCharCode(65 + nextColumnIndex),
      label: humanReadable
        ? linkEntityType.schema.title
        : `links.${linkTypeId}`,
    };
    nextColumnIndex++;
  }

  const linkColumnCount = nextColumnIndex - baseAndLinkDataColumnCount;

  for (const baseUrl of [...properties]) {
    const { propertyType } = getPropertyTypeForEntity(
      subgraph,
      entityType.$id,
      baseUrl,
    );
    columns[baseUrl] = {
      column: String.fromCharCode(65 + nextColumnIndex),
      label: humanReadable ? propertyType.title : `properties.${baseUrl}`,
    };
    nextColumnIndex++;
  }

  const propertyColumnCount =
    nextColumnIndex - baseAndLinkDataColumnCount - linkColumnCount;

  return {
    baseColumnCount,
    isLinkType,
    linkColumnCount,
    propertyColumnCount,
    columns,
  };
};

const createHyperlinkCell = ({
  label,
  sheetId,
  startCellInclusive,
  endCellInclusive,
}: {
  label: string;
  sheetId: number;
  startCellInclusive: string;
  endCellInclusive: string;
}) => ({
  userEnteredValue: {
    formulaValue: `=HYPERLINK("#gid=${sheetId}&range=${startCellInclusive}:${endCellInclusive}", ${label})`,
  },
});

const createCellFromValue = (value: unknown): sheets_v4.Schema$CellData => {
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

type EntitySheetRequests = {
  [typeId: string]: {
    additionalRequests: sheets_v4.Schema$Request[];
    sheetId: number;
    rows: sheets_v4.Schema$RowData[];
    typeTitle: string;
    typeVersion: number;
  };
};

const createSheetRequestsFromEntitySubgraph = (
  entitySubgraph: Subgraph<EntityRootType>,
  format: SheetOutputFormat,
): sheets_v4.Schema$Request[] => {
  const entitySheetRequests: EntitySheetRequests = {};

  const sortedEntities = Object.values(entitySubgraph.vertices)
    .flatMap((editionMap) => Object.values(editionMap))
    .filter((vertex): vertex is EntityVertex => isEntityVertex(vertex))
    .map((vertex) => vertex.inner)
    .sort((aEntity, bEntity) => {
      /**
       * Sort entities with linkData to the end, so we know the sheets position of the entities they reference
       * by the time we process them, to allow for linking to the rows with the source and target entity
       */
      if (aEntity.linkData && !bEntity.linkData) {
        return 1;
      }
      if (!aEntity.linkData && bEntity.linkData) {
        return -1;
      }

      /** Within link entities, sort them by the source (left) entityId, so we can link to a range of rows from the source */
      if (aEntity.linkData && bEntity.linkData) {
        return aEntity.linkData.leftEntityId.localeCompare(
          bEntity.linkData.leftEntityId,
        );
      }

      /**
       * Within entities without linkData, sort them by their entityId, and then by the edition createdAt time (in case of multiple editions)
       */
      return (
        aEntity.metadata.recordId.entityId.localeCompare(
          bEntity.metadata.recordId.entityId,
        ) ||
        new Date(
          aEntity.metadata.temporalVersioning.decisionTime.start.limit,
        ).valueOf() -
          new Date(
            bEntity.metadata.temporalVersioning.decisionTime.start.limit,
          ).valueOf()
      );
    });

  const entityPositionMap: {
    [key: EntityId]: {
      sheetId: number;
      rowIndex: number;
    };
  } = {};

  for (const entity of sortedEntities) {
    const entityType = getEntityTypeById(
      entitySubgraph,
      entity.metadata.entityTypeId,
    );
    if (!entityType) {
      throw new Error(
        `Entity type ${entity.metadata.entityTypeId} not found for entity ${entity.metadata.recordId.entityId}`,
      );
    }

    const typeTitle = entityType.schema.title;
    const typeId = entityType.schema.$id;
    const typeVersion = entityType.metadata.recordId.version;

    const {
      columns,
      baseColumnCount,
      isLinkType,
      linkColumnCount,
      propertyColumnCount,
    } = createColumnsForEntity(entityType.schema, entitySubgraph, format);

    if (!entitySheetRequests[typeId]) {
      const sheetId = Object.keys(entitySheetRequests).length;

      const headerRow = Object.values(columns).map(({ label }) => ({
        userEnteredValue: {
          stringValue: label,
        },
        userEnteredFormat: {
          textFormat: {
            bold: true,
          },
        },
      }));

      const additionalRequests: sheets_v4.Schema$Request[] = [];

      const headerRows: sheets_v4.Schema$RowData[] = [{ values: headerRow }];

      if (format.audience === "human") {
        /** For human audiences we'll add group headers across groups of columns */
        const groupHeaderCells: sheets_v4.Schema$CellData[] = [];

        /** First, the metadata columns common to all entities */
        groupHeaderCells.push({
          userEnteredValue: {
            stringValue: typeTitle,
          },
          userEnteredFormat: {
            textFormat: {
              bold: true,
              underline: true,
            },
          },
        });
        groupHeaderCells.push(...Array(baseColumnCount - 1).fill({}));

        additionalRequests.push({
          mergeCells: {
            range: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: 0,
              startColumnIndex: 0,
              endColumnIndex: baseColumnCount, // endColumnIndex is exclusive
            },
            mergeType: "MERGE_ALL",
          },
        });

        if (isLinkType) {
          /** If it's a link entity, we also have two cells for source and target entityIds */
          groupHeaderCells.push({
            userEnteredValue: {
              stringValue: "Link Data",
            },
            userEnteredFormat: {
              textFormat: {
                bold: true,
                underline: true,
              },
            },
          });
          groupHeaderCells.push(...Array(1).fill({}));

          additionalRequests.push({
            mergeCells: {
              range: {
                sheetId,
                startRowIndex: 0,
                endRowIndex: 0,
                startColumnIndex: groupHeaderCells.length,
                endColumnIndex: groupHeaderCells.length + 2, // endColumnIndex is exclusive
              },
              mergeType: "MERGE_ALL",
            },
          });
        }

        /** Now the properties */
        groupHeaderCells.push({
          userEnteredValue: {
            stringValue: "Properties",
          },
          userEnteredFormat: {
            textFormat: {
              bold: true,
              underline: true,
            },
          },
        });
        groupHeaderCells.push(...Array(propertyColumnCount - 1).fill({}));

        additionalRequests.push({
          mergeCells: {
            range: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: 0,
              startColumnIndex: groupHeaderCells.length,
              endColumnIndex: groupHeaderCells.length + propertyColumnCount, // endColumnIndex is exclusive
            },
            mergeType: "MERGE_ALL",
          },
        });

        /** Finally, cells for each potential link from the entity, which will link to a range in the link type's sheet */
        groupHeaderCells.push({
          userEnteredValue: {
            stringValue: "Links",
          },
          userEnteredFormat: {
            textFormat: {
              bold: true,
              underline: true,
            },
          },
        });
        groupHeaderCells.push(...Array(linkColumnCount - 1).fill({}));

        additionalRequests.push({
          mergeCells: {
            range: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: 0,
              startColumnIndex: groupHeaderCells.length,
              endColumnIndex: groupHeaderCells.length + linkColumnCount, // endColumnIndex is exclusive
            },
            mergeType: "MERGE_ALL",
          },
        });

        headerRows.unshift({ values: groupHeaderCells });
      }

      entitySheetRequests[typeId] = {
        additionalRequests,
        rows: headerRows,
        sheetId,
        typeTitle,
        typeVersion,
      };
    }

    entityPositionMap[entity.metadata.recordId.entityId] = {
      sheetId: entitySheetRequests[typeId]!.sheetId,
      rowIndex: entitySheetRequests[typeId]!.rows.length,
    };

    const entityCells: sheets_v4.Schema$CellData[] = [];

    for (const key of Object.keys(columns)) {
      if (key === "entityId") {
        entityCells.push(
          createCellFromValue(entity.metadata.recordId.entityId),
        );
      } else if (key === "label") {
        entityCells.push(
          createCellFromValue(generateEntityLabel(entitySubgraph, entity)),
        );
      } else if (key === "editionCreatedAt") {
        entityCells.push(
          createCellFromValue(
            entity.metadata.temporalVersioning.decisionTime.start.limit,
          ),
        );
      } else if (key === "entityCreatedAt") {
        entityCells.push(
          createCellFromValue(entity.metadata.provenance.createdAtDecisionTime),
        );
      } else if (key === "draft") {
        entityCells.push(createCellFromValue(isDraftEntity(entity)));
      } else if (key.startsWith("properties.")) {
        const propertyKey = key.split(".")[1]!;
        const value = entity.properties[propertyKey as BaseUrl];
        entityCells.push(createCellFromValue(value));
      } else if (key === "leftEntityId") {
        entityCells.push(
          createCellFromValue(entity.linkData?.leftEntityId ?? ""),
        );
      } else if (key === "rightEntityId") {
        entityCells.push(
          createCellFromValue(entity.linkData?.rightEntityId ?? ""),
        );
      } else if (key.startsWith("links.")) {
        // do nothing with links, we will insert a link to the relevant sheet when we come to it
      } else {
        throw new Error(`Unexpected column key ${key}`);
      }
    }

    entitySheetRequests[typeId]!.rows.push({ values: entityCells });
  }

  const requests: sheets_v4.Schema$Request[] = [];

  for (const [
    typeId,
    { additionalRequests, sheetId, rows, typeTitle },
  ] of Object.entries(entitySheetRequests)) {
    const typesWithIdenticalTitles = Object.entries(entitySheetRequests).filter(
      ([_typeId, entitySheetRequest]) =>
        entitySheetRequest.typeTitle === typeTitle,
    );

    // @todo add discriminator to sheet titles to differentiate between types with identical titles, for human readers

    requests.push(
      ...[
        {
          addSheet: {
            properties: {
              gridProperties: {
                frozenRowCount: format.audience === "human" ? 2 : 0,
                frozenColumnCount: format.audience === "human" ? 2 : 0,
              },
              sheetId,
              title: format.audience === "human" ? typeTitle : typeId,
            },
          },
        },
        {
          updateCells: {
            fields: "*",
            range: {
              sheetId,
              startRowIndex: 0,
            },
            rows,
          },
        },
        {
          addProtectedRange: {
            protectedRange: {
              range: {
                sheetId,
              },
              warningOnly: true,
            },
          },
        },
        ...additionalRequests,
      ],
    );
  }

  return requests;
};

const updateSpreadsheet = async (
  spreadsheetId: string,
  entitySubgraph: Subgraph<EntityRootType>,
) => {
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId,
  });

  const sheetRequests = createSheetRequestsFromEntitySubgraph(entitySubgraph, {
    audience: "machine",
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        ...(spreadsheet.data.sheets ?? []).map((sheet) => ({
          deleteSheet: {
            sheetId: sheet.properties?.sheetId,
          },
        })),
        ...sheetRequests,
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
