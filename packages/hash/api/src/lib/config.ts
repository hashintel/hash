import corsMiddleware from "cors";
import { StorageType } from "../graphql/apiTypes.gen";
import { getRequiredEnv } from "../util";
import { ExternalStorageProvider, StorageProviders } from "../storage";
import { AwsS3StorageProvider } from "../storage/aws-s3-storage-provider";

function getEnvStorageType() {
  const envUploadProvider = process.env.FILE_UPLOAD_PROVIDER as StorageType;
  if (
    envUploadProvider &&
    !Object.values<string>(StorageType).includes(envUploadProvider)
  ) {
    // In case a value is defined but is wrong
    throw new Error(
      `Env variable FILE_UPLOAD_PROVIDER must be one of the allowed StorageType values`,
    );
  }
  return envUploadProvider;
}

export const AWS_S3_BUCKET = getRequiredEnv("AWS_S3_UPLOADS_BUCKET");
export const AWS_REGION = getRequiredEnv("AWS_REGION");
export const AWS_S3_REGION = process.env.AWS_S3_REGION || AWS_REGION;

/** Uses optional `FILE_UPLOAD_PROVIDER` env variable. Defaults to S3 */
export const FILE_UPLOAD_PROVIDER = getEnvStorageType() || StorageType.AwsS3;

export const FRONTEND_DOMAIN = process.env.FRONTEND_DOMAIN || "localhost:3000";

export const FRONTEND_URL = `http${
  process.env.HTTPS_ENABLED ? "s" : ""
}://${FRONTEND_DOMAIN}`;

export const SYSTEM_ACCOUNT_SHORTNAME = "hash";
export const SYSTEM_ACCOUNT_NAME = "HASH";
export const SYSTEM_TYPES = [
  "Block",
  "EntityType",
  "Org",
  "Page",
  "Text",
  "User",
  "OrgMembership",
  "File",
  "OrgInvitationLink",
  "OrgEmailInvitation",
] as const;
export type SYSTEM_TYPE = typeof SYSTEM_TYPES[number];

/** All storage providers usable by the API should be added here */
export const storageProviders: StorageProviders = {
  [StorageType.AwsS3]: new AwsS3StorageProvider({
    bucket: AWS_S3_BUCKET,
    region: AWS_S3_REGION,
  }),
  [StorageType.ExternalLink]: new ExternalStorageProvider(),
};

export const CORS_CONFIG: corsMiddleware.CorsOptions = {
  credentials: true,
  origin: [/-hashintel\.vercel\.app$/, FRONTEND_URL],
};
