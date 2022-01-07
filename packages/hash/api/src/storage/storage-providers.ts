import { ExternalStorageProvider, StorageProviders } from ".";
import { AwsS3StorageProvider } from "./aws-s3-storage-provider";
import { StorageType } from "../graphql/apiTypes.gen";
import { getAwsS3Config } from "../lib/aws-config";

/** All storage providers usable by the API should be added here */
export const storageProviders: StorageProviders = {
  [StorageType.AwsS3]: new AwsS3StorageProvider(getAwsS3Config()),
  [StorageType.ExternalLink]: new ExternalStorageProvider(),
};
