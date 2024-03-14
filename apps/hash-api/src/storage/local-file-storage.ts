import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";

import appRoot from "app-root-path";
import type { Express } from "express";
import express from "express";

import type {
  GetFileEntityStorageKeyParams,
  PresignedDownloadRequest,
  PresignedPutUpload,
  PresignedStorageRequest,
  StorageType,
  UploadableStorageProvider,
} from "./storage-provider";

export const UPLOAD_BASE_URL = "/local-file-storage-upload";
const DOWNLOAD_BASE_URL = "/uploads";

export interface LocalFileSystemStorageProviderConstructorArgs {
  app: Express;
  /** relative path or folder name where to store uploaded files */
  fileUploadPath: string;
  /** Base URL of the API for generating upload/download URLs */
  apiOrigin: string;
}

/** Implementation of the storage provider for local file storage.
 * NOTE: NOT MEANT TO BE USED IN PRODUCTION
 * This storage provider is given as an easy to setup alternative to S3 file uploads for simple setups.
 */
export class LocalFileSystemStorageProvider
  implements UploadableStorageProvider
{
  public storageType: StorageType = "LOCAL_FILE_SYSTEM";

  private fileUploadPath: string;
  private apiOrigin: string;

  constructor({
    app,
    fileUploadPath,
    apiOrigin,
  }: LocalFileSystemStorageProviderConstructorArgs) {
    this.fileUploadPath = path.join(appRoot.path, fileUploadPath);
    this.apiOrigin = apiOrigin;
    if (!fs.existsSync(this.fileUploadPath)) {
      fs.mkdirSync(this.fileUploadPath, { recursive: true });
    }

    this.setupExpressRoutes(app);
  }

  async presignUpload({ key }: PresignedStorageRequest) {
    const presignedPut: PresignedPutUpload = {
      url: `${new URL(UPLOAD_BASE_URL, this.apiOrigin).href}?key=${key}`,
    };
    return {
      presignedPut,
      fileStorageProperties: {
        key,
        provider: "LOCAL_FILE_SYSTEM" as const,
      },
    };
  }

  async presignDownload(params: PresignedDownloadRequest): Promise<string> {
    return new URL(path.join(DOWNLOAD_BASE_URL, params.key), this.apiOrigin)
      .href;
  }

  getFileEntityStorageKey({
    entityId,
    editionIdentifier,
    filename,
  }: GetFileEntityStorageKeyParams) {
    const folder = `${entityId}/${editionIdentifier}` as const;

    if (!fs.existsSync(path.join(this.fileUploadPath, folder))) {
      fs.mkdirSync(path.join(this.fileUploadPath, folder), { recursive: true });
    }

    return `${folder}/${filename}` as const;
  }

  /** Sets up express routes required for uploading and downloading files */
  setupExpressRoutes(app: Express) {
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    app.put(UPLOAD_BASE_URL, async (req, res, _next) => {
      await new Promise<void>((resolve, reject) => {
        const fileData: Uint8Array[] = [];
        req.on("data", (chunk) => {
          fileData.push(chunk);
        });
        req.on("end", () => {
          if (typeof req.query.key !== "string") {
            res.status(400).send("Missing key query parameter");
            return;
          }

          const fileWritePath = path.join(
            this.fileUploadPath,
            path.normalize(req.query.key),
          );

          if (!fileWritePath.startsWith(this.fileUploadPath)) {
            res.status(400).send("Invalid key query parameter");
            return;
          }

          const file = Buffer.concat(fileData);
          fs.writeFile(fileWritePath, file, (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
      });
      res.status(200).send();
    });

    app.use(DOWNLOAD_BASE_URL, express.static(this.fileUploadPath));
  }
}
