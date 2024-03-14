import { frontendUrl } from "@local/hash-isomorphic-utils/environment";
import type corsMiddleware from "cors";

import type { StorageType } from "../storage/storage-provider";
import { storageTypes } from "../storage/storage-provider";

export function getEnvStorageType(): StorageType {
  const envUploadProvider = process.env.FILE_UPLOAD_PROVIDER as string;
  if (!envUploadProvider) {
    return "LOCAL_FILE_SYSTEM";
  }
  if (storageTypes.includes(envUploadProvider as StorageType)) {
    return envUploadProvider as StorageType;
  }
  // In case a value is defined but is wrong
  throw new Error(
    `Env variable FILE_UPLOAD_PROVIDER must be one of the allowed StorageType values`,
  );
}

export const LOCAL_FILE_UPLOAD_PATH =
  process.env.LOCAL_FILE_UPLOAD_PATH || "var/uploads/";

export const CORS_CONFIG: corsMiddleware.CorsOptions = {
  credentials: true,
  origin: [
    /-hashintel\.vercel\.app$/,
    /\.stage\.hash\.ai$/,
    "https://hash.ai",
    frontendUrl,
  ],
};
