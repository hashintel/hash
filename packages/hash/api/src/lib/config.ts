import { frontendUrl } from "@local/hash-isomorphic-utils/environment";
import corsMiddleware from "cors";

import { StorageType } from "../graphql/api-types.gen";

function getEnvStorageType(): StorageType {
  const envUploadProvider = process.env.FILE_UPLOAD_PROVIDER as string;
  if (!envUploadProvider) {
    return StorageType.LocalFileSystem;
  }
  if (Object.values<string>(StorageType).includes(envUploadProvider)) {
    return envUploadProvider as StorageType;
  }
  // In case a value is defined but is wrong
  throw new Error(
    `Env variable FILE_UPLOAD_PROVIDER must be one of the allowed StorageType values`,
  );
}

export const FILE_UPLOAD_PROVIDER = getEnvStorageType();
export const LOCAL_FILE_UPLOAD_PATH =
  process.env.LOCAL_FILE_UPLOAD_PATH || "var/uploads/";

export const CORS_CONFIG: corsMiddleware.CorsOptions = {
  credentials: true,
  origin: [/-hashintel\.vercel\.app$/, /\.stage\.hash\.ai$/, frontendUrl],
};
