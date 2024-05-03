import {
  createGoogleOAuth2Client,
  getGoogleAccountById,
  getTokensForGoogleAccount,
} from "@local/hash-backend-utils/google";
import { getWebMachineActorId } from "@local/hash-backend-utils/machine-actors";
import type { VaultClient } from "@local/hash-backend-utils/vault";
import { getSimplifiedActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import {
  createDefaultAuthorizationRelationships,
  generateEntityIdFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  googleEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { mapGraphApiEntityMetadataToMetadata } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type { GoogleSheetsFileProperties } from "@local/hash-isomorphic-utils/system-types/google/googlesheetsfile";
import { isNotNullish } from "@local/hash-isomorphic-utils/types";
import type { Entity } from "@local/hash-subgraph";
import { StatusCode } from "@local/status";
import { Context } from "@temporalio/activity";
import type { sheets_v4 } from "googleapis";
import { google } from "googleapis";

import { getEntityByFilter } from "../shared/get-entity-by-filter";
import { getFlowContext } from "../shared/get-flow-context";
import { graphApiClient } from "../shared/graph-api-client";
import { getEntityUpdate } from "./shared/graph-requests";
import type { FlowActionActivity } from "./types";
import { convertCsvToSheetRequests } from "./write-google-sheet-action/convert-csv-to-sheet-requests";
import { convertSubgraphToSheetRequests } from "./write-google-sheet-action/convert-subgraph-to-sheet-requests";
import { getFilterFromBlockProtocolQueryEntity } from "./write-google-sheet-action/get-filter-from-bp-query-entity";
import { getSubgraphFromFilter } from "./write-google-sheet-action/get-subgraph-from-filter";

const createSpreadsheet = async ({
  filename,
  sheetsClient,
}: {
  filename: string;
  sheetsClient: sheets_v4.Sheets;
}) => {
  const response = await sheetsClient.spreadsheets.create({
    requestBody: {
      properties: {
        title: filename,
      },
    },
  });

  const spreadsheetId = response.data.spreadsheetId;

  if (!spreadsheetId) {
    throw new Error("No spreadsheetId returned from Google Sheets API");
  }

  const spreadsheetUrl = response.data.spreadsheetUrl;

  if (!spreadsheetUrl) {
    throw new Error("No spreadsheetUrl returned from Google Sheets API");
  }

  return { ...response.data, spreadsheetId, spreadsheetUrl };
};

type ActivityHeartbeatDetails = {
  spreadsheetId?: string;
};

export const writeGoogleSheetAction: FlowActionActivity<{
  vaultClient: VaultClient;
}> = async ({ inputs, vaultClient }) => {
  const { userAuthentication, webId } = await getFlowContext();

  const { audience, dataToWrite, googleAccountId, googleSheet } =
    getSimplifiedActionInputs({
      inputs,
      actionType: "writeGoogleSheet",
    });

  /**
   * 1. Confirm that the Google account exists and has valid credentials associated with it
   */
  const googleAccount = await getGoogleAccountById({
    googleAccountId,
    graphApiClient,
    userAccountId: userAuthentication.actorId,
  });

  if (!googleAccount) {
    return {
      code: StatusCode.NotFound,
      message: `Google account not found.`,
      contents: [],
    };
  }

  const googleAccountEntityId = googleAccount.metadata.recordId.entityId;
  const userAccountId = userAuthentication.actorId;

  const tokens = await getTokensForGoogleAccount({
    googleAccountEntityId,
    graphApiClient,
    userAccountId,
    vaultClient,
  });

  if (!tokens) {
    return {
      code: StatusCode.Unauthenticated,
      message: `No valid tokens for Google account – please re-authenticate.`,
      contents: [],
    };
  }

  const googleOAuth2Client = createGoogleOAuth2Client();
  const sheetsClient = google.sheets({
    auth: googleOAuth2Client,
    version: "v4",
  });

  googleOAuth2Client.setCredentials(tokens);

  /**
   * 2. Generate the individual Google Sheet requests necessary to write the data
   */
  let sheetRequests: sheets_v4.Schema$Request[] | undefined;

  if ("format" in dataToWrite) {
    if (dataToWrite.format !== "CSV") {
      return {
        code: StatusCode.InvalidArgument,
        message: `Invalid text format '${dataToWrite.format}' provided, must be 'CSV'.`,
        contents: [],
      };
    }

    try {
      sheetRequests = convertCsvToSheetRequests({
        csvString: dataToWrite.content,
        format: { audience },
      });
    } catch {
      return {
        code: StatusCode.InvalidArgument,
        message: `Invalid CSV content provided.`,
        contents: [],
      };
    }
  } else {
    const queryFilter =
      typeof dataToWrite === "string"
        ? await getFilterFromBlockProtocolQueryEntity({
            authentication: { actorId: userAccountId },
            graphApiClient,
            queryEntityId: dataToWrite,
          })
        : {
            any: dataToWrite.persistedEntities
              .map(
                (persistedEntity) =>
                  persistedEntity.entity?.metadata.recordId.entityId,
              )
              .filter(isNotNullish)
              .map((entityId) =>
                generateEntityIdFilter({ entityId, includeArchived: false }),
              ),
          };

    const subgraph = await getSubgraphFromFilter({
      authentication: { actorId: userAccountId },
      filter: queryFilter,
      graphApiClient,
      traversalDepth: 1,
    });

    sheetRequests = convertSubgraphToSheetRequests({
      subgraph,
      format: { audience },
    });
  }

  /**
   * 3. Retrieve or create the spreadsheet to be written to.
   *
   * This is the first step that might mutate data, by creating a new sheet.
   * Any additional non-mutating checks or actions should occur before it, in case they fail.
   */

  /**
   * If a previous iteration of the activity failed after the spreadsheetId was resolved, we will have saved
   * it as a heartbeat. This avoids us creating a duplicate spreadsheet when the activity is retried.
   */
  const { spreadsheetId: spreadsheetIdFromFailedAttempt } =
    (Context.current().info.heartbeatDetails as
      | ActivityHeartbeatDetails
      | undefined) ?? {};

  const newSheetName =
    "newSheetName" in googleSheet ? googleSheet.newSheetName : undefined;

  const existingSpreadsheetId =
    spreadsheetIdFromFailedAttempt ??
    ("spreadsheetId" in googleSheet ? googleSheet.spreadsheetId : undefined);

  if (!existingSpreadsheetId && !newSheetName) {
    return {
      code: StatusCode.InvalidArgument,
      message: "Either spreadsheetId or newSheetName must be provided.",
      contents: [],
    };
  }

  let spreadsheet: sheets_v4.Schema$Spreadsheet & {
    spreadsheetId: string;
    spreadsheetUrl: string;
  };
  if (existingSpreadsheetId) {
    try {
      const retrievalResponse = await sheetsClient.spreadsheets.get({
        spreadsheetId: existingSpreadsheetId,
      });

      const spreadsheetUrl = retrievalResponse.data.spreadsheetUrl;
      if (!spreadsheetUrl) {
        return {
          code: StatusCode.Internal,
          message: `No URL returned for Google Sheet with id ${existingSpreadsheetId}.`,
          contents: [],
        };
      }

      spreadsheet = {
        ...retrievalResponse.data,
        spreadsheetUrl,
        spreadsheetId: existingSpreadsheetId,
      };
    } catch {
      return {
        code: StatusCode.NotFound,
        message: `Google Sheet with id ${existingSpreadsheetId} not found.`,
        contents: [],
      };
    }
  } else {
    spreadsheet = await createSpreadsheet({
      filename: newSheetName!,
      sheetsClient,
    });

    Context.current().heartbeat({ spreadsheetId: spreadsheet.spreadsheetId });
  }

  /**
   * 4. Write the data to the Google Sheet
   */

  /**
   * We can't leave the spreadsheet without a sheet, so we need to insert one first and delete it at the end,
   * to allow clearing out the existing sheets. sheetId is an Int32
   */
  const placeholderFirstSheetId = 2147483647;

  const existingSheets = spreadsheet.sheets ?? [];

  await sheetsClient.spreadsheets.batchUpdate({
    spreadsheetId: spreadsheet.spreadsheetId,
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

  /**
   * 5. Create or update and return the associated Google Sheets entity
   */
  const fileProperties: GoogleSheetsFileProperties = {
    "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/":
      spreadsheet.properties?.title ?? "Untitled",
    "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/":
      spreadsheet.spreadsheetUrl,
    "https://blockprotocol.org/@blockprotocol/types/property-type/file-name/":
      spreadsheet.properties?.title ?? "Untitled",
    "https://hash.ai/@hash/types/property-type/file-id/":
      spreadsheet.spreadsheetId,
    "https://blockprotocol.org/@blockprotocol/types/property-type/mime-type/":
      "application/vnd.google-apps.spreadsheet",
    "https://hash.ai/@hash/types/property-type/data-audience/": audience,
  };

  const webBotActorId = await getWebMachineActorId(
    { graphApi: graphApiClient },
    { actorId: userAccountId },
    { ownedById: webId },
  );

  const existingEntity = await getEntityByFilter({
    actorId: webBotActorId,
    includeDrafts: false,
    filter: {
      all: [
        {
          equal: [{ path: ["ownedById"] }, { parameter: webId }],
        },
        {
          equal: [
            {
              path: [
                "properties",
                systemPropertyTypes.fileId.propertyTypeBaseUrl,
              ],
            },
            { parameter: spreadsheet.spreadsheetId },
          ],
        },
      ],
    },
    graphApiClient,
  });

  let entityToReturn: Entity;
  if (existingEntity) {
    const { existingEntityIsDraft, isExactMatch, patchOperations } =
      getEntityUpdate({
        existingEntity,
        newProperties: fileProperties,
      });

    if (isExactMatch) {
      entityToReturn = existingEntity;
    } else {
      const metadata = await graphApiClient
        .patchEntity(webBotActorId, {
          draft: existingEntityIsDraft,
          entityId: existingEntity.metadata.recordId.entityId,
          properties: patchOperations,
        })
        .then((resp) => resp.data);

      entityToReturn = {
        ...existingEntity,
        metadata: mapGraphApiEntityMetadataToMetadata(metadata),
        properties: {
          ...existingEntity.properties,
          ...fileProperties,
        },
      };
    }
  } else {
    const authRelationships = createDefaultAuthorizationRelationships({
      actorId: userAccountId,
    });

    const entityValues = {
      entityTypeIds: [googleEntityTypes.googleSheetsFile.entityTypeId],
      properties: fileProperties,
    };

    const fileEntityMetadata = await graphApiClient
      .createEntity(webBotActorId, {
        draft: false,
        entityTypeIds: entityValues.entityTypeIds,
        ownedById: webId,
        properties: entityValues.properties,
        relationships: authRelationships,
      })
      .then((resp) => resp.data);

    await graphApiClient.createEntity(webBotActorId, {
      draft: false,
      entityTypeIds: [
        systemLinkEntityTypes.associatedWithAccount.linkEntityTypeId,
      ],
      ownedById: webId,
      linkData: {
        leftEntityId: fileEntityMetadata.recordId.entityId,
        rightEntityId: googleAccount.metadata.recordId.entityId,
      },
      properties: {},
      relationships: authRelationships,
    });

    entityToReturn = {
      ...entityValues,
      metadata: mapGraphApiEntityMetadataToMetadata(fileEntityMetadata),
    };
  }

  return {
    code: StatusCode.Ok,
    contents: [
      {
        outputs: [
          {
            outputName: "googleSheetEntity",
            payload: { kind: "Entity", value: entityToReturn },
          },
        ],
      },
    ],
  };
};
