import { frontendUrl } from "@hashintel/hash-shared/environment";
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
export const FILE_UPLOAD_PROVIDER =
  getEnvStorageType() || StorageType.LocalFileSystem;
export const LOCAL_FILE_UPLOAD_PATH =
  process.env.LOCAL_FILE_UPLOAD_PATH || "var/uploads/";

export const CORS_CONFIG: corsMiddleware.CorsOptions = {
  credentials: true,
  origin: [/-hashintel\.vercel\.app$/, /\.stage\.hash\.ai$/, frontendUrl],
};
