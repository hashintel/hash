import type { Entity, EntityId } from "@blockprotocol/type-system";
import { isEntityId, splitEntityId } from "@blockprotocol/type-system";
import { getAwsS3Config } from "@local/hash-backend-utils/aws-config";
import type {
  FileStorageProvider,
  StorageType,
} from "@local/hash-backend-utils/file-storage";
import {
  isStorageType,
  storageProviderLookup,
} from "@local/hash-backend-utils/file-storage";
import { AwsS3StorageProvider } from "@local/hash-backend-utils/file-storage/aws-s3-storage-provider";
import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";
import { queryEntities } from "@local/hash-graph-sdk/entity";
import { apiOrigin } from "@local/hash-isomorphic-utils/environment";
import { fullDecisionTimeAxis } from "@local/hash-isomorphic-utils/graph-queries";
import {
  blockProtocolPropertyTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { File as FileEntity } from "@local/hash-isomorphic-utils/system-types/shared";
import type { Express } from "express";
import type Keyv from "keyv";

import { getActorIdFromRequest } from "../auth/get-actor-id";
import type { ImpureGraphContext } from "../graph/context-types";
import { LOCAL_FILE_UPLOAD_PATH } from "../lib/config";
import { logger } from "../logger";
import { LocalFileSystemStorageProvider } from "./local-file-storage";

// S3-like APIs have a upper bound.
// 7 days.
const DOWNLOAD_URL_EXPIRATION_SECONDS = 60 * 60 * 24 * 7;
// An offset for the cached URL to prevent serving invalid URL
// 1 hour.
const DOWNLOAD_URL_CACHE_OFFSET_SECONDS = 60 * 60;

type StorageProviderInitialiser = (app: Express) => FileStorageProvider;

const storageProviderInitialiserLookup: Record<
  StorageType,
  StorageProviderInitialiser
> = {
  AWS_S3: () => new AwsS3StorageProvider(getAwsS3Config()),
  LOCAL_FILE_SYSTEM: (app: Express) =>
    new LocalFileSystemStorageProvider({
      app,
      fileUploadPath: LOCAL_FILE_UPLOAD_PATH,
      apiOrigin,
    }),
};

let uploadStorageProvider: StorageType = "LOCAL_FILE_SYSTEM";

export const initialiseStorageProvider = (
  app: Express,
  provider: StorageType,
) => {
  const initialiser = storageProviderInitialiserLookup[provider];

  const newProvider = initialiser(app);

  storageProviderLookup[provider] = newProvider;
  return newProvider;
};

export const getUploadStorageProvider = (): FileStorageProvider => {
  const uploadProvider = storageProviderLookup[uploadStorageProvider];
  if (!uploadProvider) {
    throw new Error(
      `Upload storage provider ${uploadStorageProvider} is required by the app but doesn't exist`,
    );
  }
  return uploadProvider;
};

export const setupStorageProviders = (
  app: Express,
  fileUploadProvider: StorageType,
): FileStorageProvider => {
  initialiseStorageProvider(app, fileUploadProvider);
  uploadStorageProvider = fileUploadProvider;
  return getUploadStorageProvider();
};

const isFileEntity = (entity: Entity): entity is Entity<FileEntity> =>
  systemPropertyTypes.fileStorageKey.propertyTypeBaseUrl in entity.properties &&
  blockProtocolPropertyTypes.fileUrl.propertyTypeBaseUrl in entity.properties;

const getFileEntity = async (
  context: ImpureGraphContext,
  authentication: AuthenticationContext,
  params: { entityId: EntityId; key: string; includeDrafts?: boolean },
) => {
  const { entityId, key, includeDrafts = false } = params;
  const [webId, entityUuid] = splitEntityId(entityId);

  const { entities: fileEntityRevisions } = await queryEntities(
    context,
    authentication,
    {
      filter: {
        all: [
          {
            equal: [{ path: ["uuid"] }, { parameter: entityUuid }],
          },
          {
            equal: [{ path: ["webId"] }, { parameter: webId }],
          },
          {
            equal: [
              {
                path: [
                  "properties",
                  systemPropertyTypes.fileStorageKey.propertyTypeBaseUrl,
                ],
              },
              { parameter: key },
            ],
          },
        ],
      },
      temporalAxes: fullDecisionTimeAxis,
      includeDrafts,
      includePermissions: false,
    },
  );

  const latestFileEntityRevision = fileEntityRevisions.reduce<
    Entity | undefined
  >((previousLatestRevision, currentRevision) => {
    if (!previousLatestRevision) {
      return currentRevision;
    }

    const currentCreatedAt = new Date(
      currentRevision.metadata.temporalVersioning.decisionTime.start.limit,
    );

    const previousLatestRevisionCreatedAt = new Date(
      previousLatestRevision.metadata.temporalVersioning.decisionTime.start
        .limit,
    );

    return previousLatestRevisionCreatedAt < currentCreatedAt
      ? currentRevision
      : previousLatestRevision;
  }, fileEntityRevisions[0]);

  return latestFileEntityRevision;
};

/**
 * Set up express route to proxy downloading files so we can cache presigned URLs.
 *
 * @param app - the express app
 * @param storageProvider - the provider we're using for file storage
 * @param cache - a cache to store presigned URLs so we don't needlessly create URLs for every download
 */
export const setupFileDownloadProxyHandler = (app: Express, cache: Keyv) => {
  app.get("/file/*splat", async (req, res) => {
    const key = (req.params as { splat: string[] }).splat.join("/");
    const urlOnly = req.query.urlOnly;

    // We purposefully return 404 for all error cases.
    if (!key) {
      res.sendStatus(404);
      return;
    }

    const keyParts = key.split("/");
    const [entityId, editionTimestamp, filename] = keyParts.slice(-3);

    if (!entityId || !editionTimestamp || !filename) {
      res.status(400).json({
        error: `File path ${key} is invalid – should be of the form [EntityId]/[EditionTimestamp]/[Filename], with an optional leading [Prefix]/`,
      });
      return;
    }
    if (!isEntityId(entityId)) {
      res.status(400).json({
        error: `File path contains invalid entityId ${entityId} in ${key}`,
      });
      return;
    }

    const actorId = getActorIdFromRequest(req);

    const fileEntity = await getFileEntity(
      req.context,
      { actorId },
      {
        entityId,
        key,
      },
    );

    if (!fileEntity) {
      res.status(404).json({
        error: `Could not find file entity ${entityId} with edition timestamp ${editionTimestamp}, either it does not exist or you do not have permission to access it.`,
      });
      return;
    }

    if (!isFileEntity(fileEntity)) {
      res.status(400).json({
        error: `Found entity ${fileEntity.metadata.recordId.entityId} is not a file entity – has type(s) ${fileEntity.metadata.entityTypeIds.join(", ")}`,
      });
      return;
    }

    const { fileStorageKey } = simplifyProperties(fileEntity.properties);
    if (!fileStorageKey) {
      res.status(400).json({
        error: `File entity ${fileEntity.metadata.recordId.entityId} is missing the necessary properties for file retrieval`,
      });
      return;
    }

    let presignUrl = await cache.get<string>(key);

    if (!presignUrl) {
      const { fileStorageProvider: storageProviderName } = simplifyProperties(
        fileEntity.properties,
      );
      if (!storageProviderName) {
        res.status(500).json({
          error:
            "No storage provider listed on file entity – cannot retrieve file.",
        });
        return;
      }

      if (!isStorageType(storageProviderName)) {
        res.status(500).json({
          error: `Entity lists invalid storage provider '${storageProviderName}'.`,
        });
        return;
      }

      let storageProvider = storageProviderLookup[storageProviderName];

      if (!storageProvider) {
        try {
          storageProvider = initialiseStorageProvider(app, storageProviderName);
        } catch {
          res.status(500).json({
            error: `Could not initialize ${storageProviderName} storage provider.`,
          });
          return;
        }
      }

      presignUrl = await storageProvider.presignDownload({
        entity: fileEntity,
        key: fileStorageKey,
        expiresInSeconds: DOWNLOAD_URL_EXPIRATION_SECONDS,
      });

      if (!presignUrl) {
        res.sendStatus(404);
        return;
      }

      try {
        await cache.set(
          key,
          presignUrl,
          (DOWNLOAD_URL_EXPIRATION_SECONDS -
            DOWNLOAD_URL_CACHE_OFFSET_SECONDS) *
            1000,
        );
      } catch (error) {
        logger.warn(
          `Could not set expiring cache entry for file download [key=${key}, presignUrl=${presignUrl}]. Error: ${error}`,
        );
      }
    }

    /**
     * For certain browser-based flows, automatically redirecting to the presigned URL can cause CORS issues,
     * because fetch requests following redirects automatically have an Origin of 'null'.
     * This provides a way for the frontend code to handle fetching from the presigned URL directly.
     */
    if (urlOnly) {
      res.json({ url: presignUrl });
      return;
    }

    res.redirect(presignUrl);
  });
};
