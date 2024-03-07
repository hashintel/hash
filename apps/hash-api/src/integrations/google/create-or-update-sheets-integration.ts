import {
  createGoogleOAuth2Client,
  getTokensForGoogleAccount,
} from "@local/hash-backend-utils/google";
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
import {
  GoogleAccountProperties,
  GoogleSheetsIntegrationProperties,
} from "@local/hash-isomorphic-utils/system-types/googlesheetsintegration";
import {
  Entity,
  EntityId,
  OwnedById,
  splitEntityId,
} from "@local/hash-subgraph";
import { getOutgoingLinkAndTargetEntities } from "@local/hash-subgraph/src/stdlib";
import { getRoots } from "@local/hash-subgraph/src/stdlib/subgraph/roots";
import { RequestHandler } from "express";
import { google, sheets_v4 } from "googleapis";

import {
  archiveEntity,
  createEntity,
  getEntities,
  getLatestEntityById,
  updateEntity,
} from "../../graph/knowledge/primitive/entity";
import { createLinkEntity } from "../../graph/knowledge/primitive/link-entity";
import { enabledIntegrations } from "../enabled-integrations";
import { getGoogleAccountById } from "./shared/get-google-account";

const createSpreadsheet = async ({
  filename,
  sheetsClient,
}: {
  filename: string;
  sheetsClient: sheets_v4.Sheets;
}) => {
  const sheet = await sheetsClient.spreadsheets.create({
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

type SyncToSheetRequestBody = {
  audience: "human" | "machine";
  existingIntegrationEntityId?: EntityId;
  googleAccountId: string;
  queryEntityId: EntityId;
} & (
  | {
      spreadsheetId: string;
    }
  | { newFileName: string }
);

type SyncToSheetResponseBody =
  | { integrationEntity: Entity }
  | { error: string };

export const createOrUpdateSheetsIntegration: RequestHandler<
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

    const {
      googleAccountId,
      existingIntegrationEntityId,
      queryEntityId,
      audience,
    } = req.body;

    if (!["human", "machine"].includes(audience)) {
      res.status(400).send({
        error: "audience must be either 'human' or 'machine'.",
      });
      return;
    }

    try {
      await getLatestEntityById(req.context, authentication, {
        entityId: queryEntityId,
      });
    } catch {
      res.status(404).send({
        error: `No query entity found with id ${queryEntityId}.`,
      });
      return;
    }

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

    const tokens = await getTokensForGoogleAccount({
      authentication,
      graphApi: req.context.graphApi,
      userAccountId: req.user.accountId,
      googleAccountEntityId: googleAccount.metadata.recordId.entityId,
      vaultClient: req.context.vaultClient,
    });

    const errorMessage = `Could not get tokens for Google account with id ${googleAccountId} for user ${req.user.accountId}.`;

    // @todo flag user secret entity is invalid and create notification for user
    if (!tokens) {
      res.status(500).send({
        error: errorMessage,
      });
      return;
    }

    const googleOAuth2Client = createGoogleOAuth2Client();
    const sheetsClient = google.sheets({
      auth: googleOAuth2Client,
      version: "v4",
    });

    googleOAuth2Client.setCredentials(tokens);

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
      const spreadsheet = await sheetsClient.spreadsheets.get({
        spreadsheetId: req.body.spreadsheetId,
      });

      if (!spreadsheet.data.spreadsheetId) {
        res.status(400).send({
          error: `No spreadsheet found with id ${req.body.spreadsheetId}.`,
        });
        return;
      }
    }

    const spreadsheetId =
      "spreadsheetId" in req.body
        ? req.body.spreadsheetId
        : await createSpreadsheet({
            filename: req.body.newFileName,
            sheetsClient,
          });

    const googleSheetIntegrationProperties: GoogleSheetsIntegrationProperties =
      {
        "https://hash.ai/@hash/types/property-type/file-id/": spreadsheetId,
        "https://hash.ai/@hash/types/property-type/data-audience/":
          req.body.audience,
      };

    let googleSheetIntegrationEntity:
      | Entity<GoogleSheetsIntegrationProperties>
      | undefined;
    if (existingIntegrationEntityId) {
      const [ownedById, uuid] = splitEntityId(existingIntegrationEntityId);
      const existingIntegrationEntitySubgraph = await getEntities(
        req.context,
        authentication,
        {
          query: {
            filter: {
              equal: [
                {
                  path: ["uuid"],
                  parameter: uuid,
                },
                {
                  path: ["ownedById"],
                  parameter: ownedById,
                },
              ],
            },
            graphResolveDepths: {
              ...zeroedGraphResolveDepths,
              hasLeftEntity: { incoming: 1, outgoing: 0 },
              hasRightEntity: { outgoing: 1, incoming: 0 },
            },
            includeDrafts: false,
            temporalAxes: currentTimeInstantTemporalAxes,
          },
        },
      );
      googleSheetIntegrationEntity = getRoots(
        existingIntegrationEntitySubgraph,
      )[0] as Entity<GoogleSheetsIntegrationProperties> | undefined;

      if (!googleSheetIntegrationEntity) {
        res.status(404).send({
          error: `No integration entity found with id ${existingIntegrationEntityId}.`,
        });
        return;
      }

      const outgoingLinks = getOutgoingLinkAndTargetEntities(
        existingIntegrationEntitySubgraph,
        existingIntegrationEntityId,
      );

      const existingGoogleAccountLink = outgoingLinks.find(
        ({ linkEntity }) =>
          linkEntity[0]?.metadata.entityTypeId ===
          systemLinkEntityTypes.associatedWithAccount.linkEntityTypeId,
      );
      if (!existingGoogleAccountLink?.linkEntity[0]) {
        res.status(500).send({
          error: `No associated Google Account found for integration entity with id ${existingIntegrationEntityId}.`,
        });
        return;
      }

      const existingQueryLink = outgoingLinks.find(
        ({ linkEntity }) =>
          linkEntity[0]?.metadata.entityTypeId ===
          blockProtocolLinkEntityTypes.hasQuery.linkEntityTypeId,
      );
      if (!existingQueryLink?.linkEntity[0]) {
        res.status(500).send({
          error: `No associated Query entity found for integration entity with id ${existingIntegrationEntityId}.`,
        });
        return;
      }

      const entityPropertiesAreDifferent =
        googleSheetIntegrationProperties[
          "https://hash.ai/@hash/types/property-type/data-audience/"
        ] !==
          googleSheetIntegrationEntity.properties[
            "https://hash.ai/@hash/types/property-type/data-audience/"
          ] ||
        googleSheetIntegrationProperties[
          "https://hash.ai/@hash/types/property-type/file-id/"
        ] !==
          googleSheetIntegrationEntity.properties[
            "https://hash.ai/@hash/types/property-type/file-id/"
          ];

      if (entityPropertiesAreDifferent) {
        await updateEntity(req.context, authentication, {
          entity: googleSheetIntegrationEntity,
          properties: googleSheetIntegrationProperties,
        });
      }

      const existingLinkedGoogleAccountId = (
        existingQueryLink.rightEntity[0] as
          | Entity<GoogleAccountProperties>
          | undefined
      )?.properties["https://hash.ai/@hash/types/property-type/account-id/"];
      if (googleAccountId !== existingLinkedGoogleAccountId) {
        await archiveEntity(req.context, authentication, {
          entity: existingGoogleAccountLink.linkEntity[0],
        });
        await createLinkEntity(req.context, authentication, {
          linkEntityTypeId:
            systemLinkEntityTypes.associatedWithAccount.linkEntityTypeId,
          ownedById: req.user.accountId as OwnedById,
          leftEntityId: existingIntegrationEntityId,
          rightEntityId: googleAccount.metadata.recordId.entityId,
          relationships: createDefaultAuthorizationRelationships({
            actorId: req.user.accountId,
          }),
        });
      }

      if (
        queryEntityId !==
        existingQueryLink.rightEntity[0]?.metadata.recordId.entityId
      ) {
        await archiveEntity(req.context, authentication, {
          entity: existingQueryLink.linkEntity[0],
        });
        await createLinkEntity(req.context, authentication, {
          linkEntityTypeId:
            blockProtocolLinkEntityTypes.hasQuery.linkEntityTypeId,
          ownedById: req.user.accountId as OwnedById,
          leftEntityId: existingIntegrationEntityId,
          rightEntityId: queryEntityId,
          relationships: createDefaultAuthorizationRelationships({
            actorId: req.user.accountId,
          }),
        });
      }
    } else {
      googleSheetIntegrationEntity = (await createEntity(
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
      )) as Entity<GoogleSheetsIntegrationProperties>;
    }

    /**
     * Trigger a single write of the requested query results to the specified spreadsheet
     * @todo implement repeated syncs on a schedule
     */
    await req.context.temporalClient.workflow.execute(
      "syncQueryToGoogleSheet",
      {
        authentication,
        queryEntityId,
        spreadsheetId,
      },
    );

    res.json({ integrationEntity: googleSheetIntegrationEntity });
  };
