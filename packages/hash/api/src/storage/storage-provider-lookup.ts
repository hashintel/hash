import { apiOrigin } from "@hashintel/hash-shared/environment";
import { Express } from "express";

import { getAwsS3Config } from "../lib/aws-config";
import { LOCAL_FILE_UPLOAD_PATH } from "../lib/config";
import { AwsS3StorageProvider } from "./aws-s3-storage-provider";
import { ExternalStorageProvider } from "./external-storage-provider";
import { LocalFileSystemStorageProvider } from "./local-file-storage";
import {
  StorageProvider,
  StorageProviderLookup,
  StorageType,
  UploadableStorageProvider,
} from "./storage-provider";

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

function initialiseStorageProvider(app: Express, provider: StorageType) {
  const initialiser = storageProviderInitialiserLookup[provider];

  const newProvider = initialiser(app);
  storageProviderLookup[provider] = newProvider;
  return newProvider;
}

export function getStorageProvider(
  app: Express,
  provider: StorageType,
): StorageProvider {
  if (storageProviderLookup[provider]) {
    return storageProviderLookup[provider]!;
  } else {
    return initialiseStorageProvider(app, provider);
  }
}

export function getUploadStorageProvider(): UploadableStorageProvider {
  const uploadProvider = storageProviderLookup[uploadStorageProvider];
  if (!uploadProvider) {
    throw new Error(
      `Upload storage provider ${uploadStorageProvider} is required by the app but doesn't exist`,
    );
  }
  return uploadProvider as UploadableStorageProvider;
}

export function setupStorageProviders(
  app: Express,
  fileUploadProvider: StorageType,
): UploadableStorageProvider {
  initialiseStorageProvider(app, fileUploadProvider);
  uploadStorageProvider = fileUploadProvider;
  return getUploadStorageProvider();
}
