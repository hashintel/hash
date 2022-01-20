import { Express } from "express";
import { apiOrigin } from "@hashintel/hash-shared/environment";
import {
  StorageProvider,
  StorageProviderLookup,
  UploadableStorageProvider,
} from "./storage-provider";
import { AwsS3StorageProvider } from "./aws-s3-storage-provider";
import { StorageType } from "../graphql/apiTypes.gen";
import { LocalFileSystemStorageProvider } from "./local-file-storage";
import { LOCAL_FILE_UPLOAD_PATH } from "../lib/config";
import { getAwsS3Config } from "../lib/aws-config";
import { ExternalStorageProvider } from "./external-storage-provider";

type StorageProviderInitialiser = () =>
  | StorageProvider
  | UploadableStorageProvider;

const storageProviderInitialiserLookup: Record<
  StorageType,
  StorageProviderInitialiser
> = {
  [StorageType.AwsS3]: () => new AwsS3StorageProvider(getAwsS3Config()),
  [StorageType.ExternalLink]: () => new ExternalStorageProvider(),
  [StorageType.LocalFileSystem]: () =>
    new LocalFileSystemStorageProvider({
      fileUploadPath: LOCAL_FILE_UPLOAD_PATH,
      apiOrigin,
    }),
};
/** All storage providers usable by the API should be added here.
 * Even if not currently used for upload, they need to be available for downloads.
 */
const storageProviderLookup: StorageProviderLookup = {};
let uploadStorageProvider: StorageType = StorageType.LocalFileSystem;

function initialiseStorageProvider(provider: StorageType) {
  const initialiser = storageProviderInitialiserLookup[provider];
  if (!initialiser) {
    throw new Error(
      `No storage provider available for storage type: ${provider}`,
    );
  }
  const newProvider = initialiser();
  storageProviderLookup[provider] = newProvider;
  return newProvider;
}

export function setupStorageProviders(
  app: Express,
  fileUploadProvider: StorageType,
) {
  const localFileStorage = initialiseStorageProvider(
    StorageType.LocalFileSystem,
  ) as LocalFileSystemStorageProvider;
  // Sets up routes needed to handle download/upload
  localFileStorage.setupExpressRoutes(app);
  initialiseStorageProvider(fileUploadProvider);
  uploadStorageProvider = fileUploadProvider;
}
export function getStorageProvider(provider: StorageType): StorageProvider {
  if (storageProviderLookup[provider]) {
    return storageProviderLookup[provider]!;
  } else {
    return initialiseStorageProvider(provider);
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
