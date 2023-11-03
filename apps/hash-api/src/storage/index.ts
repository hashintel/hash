import { extractBaseUrl } from "@blockprotocol/type-system";
import { apiOrigin } from "@local/hash-graphql-shared/environment";
import {
  fullDecisionTimeAxis,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { FileProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import {
  Entity,
  EntityId,
  EntityRootType,
  fileUrlPropertyTypeUrl,
  isEntityId,
  splitEntityId,
} from "@local/hash-subgraph";
import {
  getRoots,
  mapGraphApiSubgraphToSubgraph,
} from "@local/hash-subgraph/stdlib";
import { Express } from "express";

import { getActorIdFromRequest } from "../auth/get-actor-id";
import { CacheAdapter } from "../cache";
import { SYSTEM_TYPES } from "../graph/system-types";
import { ImpureGraphContext } from "../graph/util";
import { AuthenticationContext } from "../graphql/authentication-context";
import { getAwsS3Config } from "../lib/aws-config";
import { LOCAL_FILE_UPLOAD_PATH } from "../lib/config";
import { logger } from "../logger";
import { AwsS3StorageProvider } from "./aws-s3-storage-provider";
import { LocalFileSystemStorageProvider } from "./local-file-storage";
import {
  StorageProvider,
  StorageType,
  storageTypes,
  UploadableStorageProvider,
} from "./storage-provider";

export * from "./aws-s3-storage-provider";
export * from "./storage-provider";

// S3-like APIs have a upper bound.
// 7 days.
const DOWNLOAD_URL_EXPIRATION_SECONDS = 60 * 60 * 24 * 7;
// An offset for the cached URL to prevent serving invalid URL
// 1 hour.
const DOWNLOAD_URL_CACHE_OFFSET_SECONDS = 60 * 60;

/** Helper type to create a typed "dictionary" of storage types to their storage provider instance */
export type StorageProviderLookup = Partial<
  Record<StorageType, StorageProvider | UploadableStorageProvider>
>;

type StorageProviderInitialiser = (
  app: Express,
) => StorageProvider | UploadableStorageProvider;

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

/**
 * All storage providers usable by the API should be added here.
 * Even if not currently used for upload, they need to be available for downloads.
 */
const storageProviderLookup: StorageProviderLookup = {};
let uploadStorageProvider: StorageType = "LOCAL_FILE_SYSTEM";

const initialiseStorageProvider = (app: Express, provider: StorageType) => {
  const initialiser = storageProviderInitialiserLookup[provider];

  const newProvider = initialiser(app);
  storageProviderLookup[provider] = newProvider;
  return newProvider;
};

export const getUploadStorageProvider = (): UploadableStorageProvider => {
  const uploadProvider = storageProviderLookup[uploadStorageProvider];
  if (!uploadProvider) {
    throw new Error(
      `Upload storage provider ${uploadStorageProvider} is required by the app but doesn't exist`,
    );
  }
  return uploadProvider as UploadableStorageProvider;
};

export const setupStorageProviders = (
  app: Express,
  fileUploadProvider: StorageType,
): UploadableStorageProvider => {
  initialiseStorageProvider(app, fileUploadProvider);
  uploadStorageProvider = fileUploadProvider;
  return getUploadStorageProvider();
};

const isFileEntity = (entity: Entity): entity is Entity<FileProperties> =>
  SYSTEM_TYPES.propertyType.fileStorageKey.metadata.recordId.baseUrl in
    entity.properties &&
  extractBaseUrl(fileUrlPropertyTypeUrl) in entity.properties;

const isStorageType = (storageType: string): storageType is StorageType =>
  storageTypes.includes(storageType as StorageType);

const getFileEntity = async (
  { graphApi }: ImpureGraphContext,
  { actorId }: AuthenticationContext,
  params: { entityId: EntityId; key: string },
) => {
  const { entityId, key } = params;
  const [ownedById, entityUuid] = splitEntityId(entityId);

  const [fileEntity, ...unexpectedEntities] = await graphApi
    .getEntitiesByQuery(actorId, {
      filter: {
        all: [
          {
            equal: [{ path: ["uuid"] }, { parameter: entityUuid }],
          },
          {
            equal: [{ path: ["ownedById"] }, { parameter: ownedById }],
          },
          {
            equal: [
              {
                path: [
                  "properties",
                  SYSTEM_TYPES.propertyType.fileStorageKey.metadata.recordId
                    .baseUrl,
                ],
              },
              { parameter: key },
            ],
          },
        ],
      },
      graphResolveDepths: zeroedGraphResolveDepths,
      temporalAxes: fullDecisionTimeAxis,
    })
    .then(({ data }) => {
      const subgraph = mapGraphApiSubgraphToSubgraph<EntityRootType>(data);

      return getRoots(subgraph);
    });

  if (unexpectedEntities.length > 0) {
    throw new Error(
      `Critical: More than one file entity with entityId ${entityId} and key ${key}.`,
    );
  }

  return fileEntity;
};

/**
 * Set up express route to proxy downloading files so we can cache presigned URLs.
 *
 * @param app - the express app
 * @param storageProvider - the provider we're using for file storage
 * @param cache - a cache to store presigned URLs so we don't needlessly create URLs for every download
 */
export const setupFileDownloadProxyHandler = (
  app: Express,
  cache: CacheAdapter,
) => {
  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- should likely be using express-async-handler
  app.get("/file/:key(*)", async (req, res) => {
    const key = req.params.key;

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
    }
    if (!entityId || !isEntityId(entityId)) {
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
        error: `Found entity ${fileEntity.metadata.recordId.entityId} is not a file entity – has type ${fileEntity.metadata.entityTypeId}`,
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

    let presignUrl = await cache.get(key);

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
        await cache.setExpiring(
          key,
          presignUrl,
          DOWNLOAD_URL_EXPIRATION_SECONDS - DOWNLOAD_URL_CACHE_OFFSET_SECONDS,
        );
      } catch (error) {
        logger.warn(
          `Could not set expiring cache entry for file download [key=${key}, presignUrl=${presignUrl}]. Error: ${error}`,
        );
      }
    }

    res.redirect(presignUrl);
  });
};
