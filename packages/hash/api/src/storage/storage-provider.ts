import { apiOrigin } from "@hashintel/hash-shared/environment";
import { AccountId } from "@hashintel/hash-shared/types";
import { DataSource } from "apollo-datasource";
import { Express } from "express";

import { CacheAdapter } from "../cache";
import { getAwsS3Config } from "../lib/aws-config";
import { LOCAL_FILE_UPLOAD_PATH } from "../lib/config";
import { logger } from "../logger";
import { AwsS3StorageProvider } from "./aws-s3-storage-provider";
import { ExternalStorageProvider } from "./external-storage-provider";
import { LocalFileSystemStorageProvider } from "./local-file-storage";

// S3-like APIs have a 7 day upper bound.
const DOWNLOAD_URL_EXPIRATION_SECONDS = 60 * 60 * 24 * 7;
// An offset for the cached URL to prevent serving invalid URL
const DOWNLOAD_URL_CACHE_OFFSET = 60 * 60 * 1;

export enum StorageType {
  AwsS3 = "AWS_S3",
  ExternalLink = "EXTERNAL_LINK",
  LocalFileSystem = "LOCAL_FILE_SYSTEM",
}

/** Interface describing a generic storage provider
 * used for allowing the download and upload files via presigned request.
 * The storage provider doesn't upload the file itself, instead it returns a URL
 * and form-data fields for the client to upload their file to.
 */
export interface StorageProvider {
  storageType: StorageType;
  /** Presigns a file download request for a client to later download a file
   * @return {string} The download URL to access the file
   */
  presignDownload(params: PresignedDownloadRequest): Promise<string>;
}

export interface GetFileEntityStorageKeyParams {
  accountId: AccountId;
  uniqueIdenitifier: string;
}

export interface UploadableStorageProvider extends StorageProvider, DataSource {
  /** Presigns a file upload request for a client to later upload a file
   * @return {Promise<PresignedPostUpload>} Object containing the data and url needed to POST the file
   */
  presignUpload(params: PresignedStorageRequest): Promise<PresignedPostUpload>;
  /** For a given file upload request, generates the path/key to store the file. This method
   * needs to be defined by each storage provider, as different storage providers might want to store files in different paths
   */
  getFileEntityStorageKey(params: GetFileEntityStorageKeyParams): string;
}

/** Parameters needed to allow the storage of a file */
export interface PresignedStorageRequest {
  /** Key (or path) of the file in the storage */
  key: string;
  /** Custom parameter fields to add to the storage request (currently used by S3) */
  fields: {
    [key: string]: string;
  };
  /** Expiry delay for the upload authorisation. The client needs to upload a file before that time */
  expiresInSeconds: number;
}

/** Parameters needed to allow the download of a stored file */
export interface PresignedDownloadRequest {
  /** Key or path of the file in the storage */
  key: string;
  /** Expiry delay for the download authorisation */
  expiresInSeconds: number;
}

/** Data returned for a client
 * to be able to send a POST request to upload a file */
export interface PresignedPostUpload {
  /** URL to send the upload request to */
  url: string;
  /** form-data fields that must be appended to the POST data
   * when uploading the file */
  fields: {
    [key: string]: string;
  };
}

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
  [StorageType.ExternalLink]: (_app: Express) => new ExternalStorageProvider(),
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
export const setupFileProxyHanldere = (
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
        await cache.setex(
          key,
          presignUrl,
          DOWNLOAD_URL_EXPIRATION_SECONDS - DOWNLOAD_URL_CACHE_OFFSET,
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
