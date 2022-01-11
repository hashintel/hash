import corsMiddleware from "cors";
import { StorageType } from "../graphql/apiTypes.gen";

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

/** Uses optional `FILE_UPLOAD_PROVIDER` env variable. Defaults to S3 */
export const FILE_UPLOAD_PROVIDER = getEnvStorageType() || StorageType.AwsS3;

export const FRONTEND_DOMAIN = process.env.FRONTEND_DOMAIN || "localhost:3000";

export const FRONTEND_URL = `http${
  process.env.HTTPS_ENABLED ? "s" : ""
}://${FRONTEND_DOMAIN}`;

export const CORS_CONFIG: corsMiddleware.CorsOptions = {
  credentials: true,
  origin: [/-hashintel\.vercel\.app$/, FRONTEND_URL],
};
