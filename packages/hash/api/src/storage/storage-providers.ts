import { ExternalStorageProvider, StorageProviders } from ".";
import { AwsS3StorageProvider } from "./aws-s3-storage-provider";
import { AWS_S3_BUCKET, AWS_S3_REGION } from "../lib/aws-config";
import { StorageType } from "../graphql/apiTypes.gen";

/** All storage providers usable by the API should be added here */
export const storageProviders: StorageProviders = {
  [StorageType.AwsS3]: new AwsS3StorageProvider({
    bucket: AWS_S3_BUCKET,
    region: AWS_S3_REGION,
  }),
  [StorageType.ExternalLink]: new ExternalStorageProvider(),
};
