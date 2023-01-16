import { apiOrigin } from "@hashintel/hash-shared/environment";
import { Express } from "express";

import { CacheAdapter } from "../cache";
import { getAwsS3Config } from "../lib/aws-config";
import { LOCAL_FILE_UPLOAD_PATH } from "../lib/config";
import { logger } from "../logger";
import { AwsS3StorageProvider } from "./aws-s3-storage-provider";
import { ExternalStorageProvider } from "./external-storage-provider";
import { LocalFileSystemStorageProvider } from "./local-file-storage";
import {
  StorageProvider,
  StorageType,
  UploadableStorageProvider,
} from "./storage-provider";

export * from "./aws-s3-storage-provider";
export * from "./external-storage-provider";
export * from "./storage-provider";

// S3-like APIs have a upper bound.
// 7 days.
const DOWNLOAD_URL_EXPIRATION_SECONDS = 60 * 60 * 24 * 7;
// An offset for the cached URL to prevent serving invalid URL
// 1 hour.
const DOWNLOAD_URL_CACHE_OFFSET_SECONDS = 60 * 60 * 1;

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
  [StorageType.AwsS3]: (_app: Express) =>
    new AwsS3StorageProvider(getAwsS3Config()),
  [StorageType.ExternalUrl]: (_app: Express) => new ExternalStorageProvider(),
  [StorageType.LocalFileSystem]: (app: Express) =>
    new LocalFileSystemStorageProvider({
      app,
      fileUploadPath: LOCAL_FILE_UPLOAD_PATH,
      apiOrigin,
    }),
};
/** All storage providers usable by the API should be added here.
 * Even if not currently used for upload, they need to be available for downloads.
 */
const storageProviderLookup: StorageProviderLookup = {};
let uploadStorageProvider: StorageType = StorageType.LocalFileSystem;

const initialiseStorageProvider = (app: Express, provider: StorageType) => {
  const initialiser = storageProviderInitialiserLookup[provider];

  const newProvider = initialiser(app);
  storageProviderLookup[provider] = newProvider;
  return newProvider;
};

export const getStorageProvider = (
  app: Express,
  provider: StorageType,
): StorageProvider => {
  if (storageProviderLookup[provider]) {
    return storageProviderLookup[provider]!;
  } else {
    return initialiseStorageProvider(app, provider);
  }
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

/**
 * Set up express route to proxy uploaded files so we can cache presigned URLs.
 *
 * @todo We should consider authorization for this route (it doesn't even authenticate for now.)
 *   https://app.asana.com/0/1200211978612931/1202510174412958/f
 *
 * @param app - the express app
 * @param storageProvider - the provider we're using for file storage
 * @param cache - a cache to store presigned URLs so we don't needlessly create URLs for every download
 */
export const setupFileProxyHanlder = (
  app: Express,
  storageProvider: StorageProvider,
  cache: CacheAdapter,
) => {
  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- should likely be using express-async-handler
  app.get("/file/:key(*)", async (req, res) => {
    const key = req.params.key;

    // We purposefully return 404 for all error cases.
    if (!key || key.length > 256) {
      res.sendStatus(404);
      return;
    }

    let presignUrl = await cache.get(key);

    if (!presignUrl) {
      presignUrl = await storageProvider.presignDownload({
        key,
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
