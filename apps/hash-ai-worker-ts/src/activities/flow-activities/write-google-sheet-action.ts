import type {
  OriginProvenance,
  ProvidedEntityEditionProvenance,
} from "@blockprotocol/type-system";
import type { AiFlowActionActivity } from "@local/hash-backend-utils/flows";
import {
  createGoogleOAuth2Client,
  getGoogleAccountById,
  getTokensForGoogleAccount,
} from "@local/hash-backend-utils/google";
import { getWebMachineId } from "@local/hash-backend-utils/machine-actors";
import type { VaultClient } from "@local/hash-backend-utils/vault";
import { HashEntity } from "@local/hash-graph-sdk/entity";
import { getSimplifiedAiFlowActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import { generateEntityIdFilter } from "@local/hash-isomorphic-utils/graph-queries";
import {
  googleEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type {
  AssociatedWithAccount,
  GoogleSheetsFile,
} from "@local/hash-isomorphic-utils/system-types/google/googlesheetsfile";
import { StatusCode } from "@local/status";
import { Context } from "@temporalio/activity";
import type { sheets_v4 } from "googleapis";
import { google } from "googleapis";

import { getEntityByFilter } from "../shared/get-entity-by-filter.js";
import { getFlowContext } from "../shared/get-flow-context.js";
import { graphApiClient } from "../shared/graph-api-client.js";
import { getEntityUpdate } from "./shared/graph-requests.js";
import { convertCsvToSheetRequests } from "./write-google-sheet-action/convert-csv-to-sheet-requests.js";
import { convertSubgraphToSheetRequests } from "./write-google-sheet-action/convert-subgraph-to-sheet-requests.js";
import { getFilterFromBlockProtocolQueryEntity } from "./write-google-sheet-action/get-filter-from-bp-query-entity.js";
import { getSubgraphFromFilter } from "./write-google-sheet-action/get-subgraph-from-filter.js";

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

export const writeGoogleSheetAction: AiFlowActionActivity<
  "writeGoogleSheet",
  {
    vaultClient: VaultClient;
  }
> = async ({ inputs, vaultClient }) => {
  const { flowEntityId, stepId, userAuthentication, webId } =
    await getFlowContext();

  const { audience, dataToWrite, googleAccountId, googleSheet } =
    getSimplifiedAiFlowActionInputs({
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
    const isPersistedEntities = "persistedEntities" in dataToWrite;
    const queryFilter = isPersistedEntities
      ? {
          any: dataToWrite.persistedEntities.map((persistedEntityMetadata) =>
            generateEntityIdFilter({
              entityId: persistedEntityMetadata.entityId,
              includeArchived: false,
            }),
          ),
        }
      : await getFilterFromBlockProtocolQueryEntity({
          authentication: { actorId: userAccountId },
          graphApiClient,
          queryEntityId: dataToWrite,
        });

    const subgraph = await getSubgraphFromFilter({
      authentication: { actorId: userAccountId },
      filter: queryFilter,
      graphApiClient,
      /**
       * If we've been given a Block Protocol query, also provide linked entities to depth 1, since the query can't specify it.
       * If not, just use the exact entities we've been given from the previous step.
       *
       * @todo once we start using a Structural Query instead, it can specify the traversal depth itself (1 becomes variable)
       */
      traversalPaths: isPersistedEntities
        ? []
        : [
            {
              edges: [
                {
                  kind: "has-left-entity",
                  direction: "incoming",
                },
                {
                  kind: "has-right-entity",
                  direction: "outgoing",
                },
              ],
            },
            {
              edges: [
                {
                  kind: "has-right-entity",
                  direction: "incoming",
                },
                {
                  kind: "has-left-entity",
                  direction: "outgoing",
                },
              ],
            },
          ],
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
   * the spreadsheetId as a heartbeat. This avoids us creating a duplicate spreadsheet when the activity is retried.
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
        ...existingSheets
          .filter(
            (sheet) => sheet.properties?.sheetId !== placeholderFirstSheetId,
          )
          .map((sheet) => ({
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
  const fileProperties: GoogleSheetsFile["propertiesWithMetadata"] = {
    value: {
      "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/":
        {
          value: spreadsheet.properties?.title ?? "Untitled",
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          },
        },
      "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/":
        {
          value: spreadsheet.spreadsheetUrl,
          metadata: {
            dataTypeId: "https://hash.ai/@h/types/data-type/uri/v/1",
          },
        },
      "https://blockprotocol.org/@blockprotocol/types/property-type/file-name/":
        {
          value: spreadsheet.properties?.title ?? "Untitled",
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          },
        },
      "https://hash.ai/@h/types/property-type/file-id/": {
        value: spreadsheet.spreadsheetId,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
        },
      },
      "https://blockprotocol.org/@blockprotocol/types/property-type/mime-type/":
        {
          value: "application/vnd.google-apps.spreadsheet",
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          },
        },
      "https://hash.ai/@h/types/property-type/data-audience/": {
        value: audience,
        metadata: {
          dataTypeId: "https://hash.ai/@h/types/data-type/actor-type/v/1",
        },
      },
    },
  };

  const webBotActorId = await getWebMachineId(
    { graphApi: graphApiClient },
    { actorId: userAccountId },
    { webId },
  ).then((maybeMachineId) => {
    if (!maybeMachineId) {
      throw new Error(`Failed to get web bot account ID for web ID: ${webId}`);
    }
    return maybeMachineId;
  });

  const provenance: ProvidedEntityEditionProvenance = {
    actorType: "machine",
    origin: {
      type: "flow",
      id: flowEntityId,
      stepIds: [stepId],
    } satisfies OriginProvenance,
  };

  const existingEntity = await getEntityByFilter({
    actorId: webBotActorId,
    includeDrafts: false,
    filter: {
      all: [
        {
          equal: [{ path: ["webId"] }, { parameter: webId }],
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

  let entityToReturn: HashEntity;
  if (existingEntity) {
    const { existingEntityIsDraft, isExactMatch, patchOperations } =
      getEntityUpdate({
        existingEntity,
        newPropertiesWithMetadata: fileProperties,
      });

    if (isExactMatch) {
      entityToReturn = existingEntity;
    } else {
      entityToReturn = await existingEntity.patch(
        graphApiClient,
        { actorId: webBotActorId },
        {
          draft: existingEntityIsDraft,
          propertyPatches: patchOperations,
          provenance,
        },
      );
    }
  } else {
    entityToReturn = await HashEntity.create<GoogleSheetsFile>(
      graphApiClient,
      { actorId: webBotActorId },
      {
        entityTypeIds: [googleEntityTypes.googleSheetsFile.entityTypeId],
        properties: fileProperties,
        draft: false,
        webId,
        provenance,
      },
    );

    await HashEntity.create<AssociatedWithAccount>(
      graphApiClient,
      { actorId: webBotActorId },
      {
        draft: false,
        entityTypeIds: [
          systemLinkEntityTypes.associatedWithAccount.linkEntityTypeId,
        ],
        webId,
        linkData: {
          leftEntityId: entityToReturn.metadata.recordId.entityId,
          rightEntityId: googleAccount.metadata.recordId.entityId,
        },
        properties: { value: {} },
        provenance,
      },
    );
  }

  return {
    code: StatusCode.Ok,
    contents: [
      {
        outputs: [
          {
            outputName: "googleSheetEntity",
            payload: {
              kind: "PersistedEntityMetadata",
              value: {
                entityId: entityToReturn.entityId,
                operation: "create",
              },
            },
          },
        ],
      },
    ],
  };
};
