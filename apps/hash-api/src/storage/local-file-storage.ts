import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";

import type {
  FileStorageProvider,
  GetFileEntityStorageKeyParams,
  GetFlowOutputStorageKeyParams,
  PresignedDownloadRequest,
  PresignedPutUpload,
  PresignedStorageRequest,
  StorageType,
} from "@local/hash-backend-utils/file-storage";
import type { File } from "@local/hash-isomorphic-utils/system-types/shared";
import appRoot from "app-root-path";
import type { Express } from "express";
import express from "express";

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
export class LocalFileSystemStorageProvider implements FileStorageProvider {
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
        value: {
          "https://hash.ai/@h/types/property-type/file-storage-key/": {
            value: key,
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
          "https://hash.ai/@h/types/property-type/file-storage-provider/": {
            value: this.storageType,
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
        } satisfies Pick<
          File["propertiesWithMetadata"]["value"],
          | "https://hash.ai/@h/types/property-type/file-storage-key/"
          | "https://hash.ai/@h/types/property-type/file-storage-provider/"
        >,
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

  /**
   * Generate a storage key for flow output payloads.
   * Format: flows/{workflowId}/{runId}/{stepId}/{outputName}.json
   */
  getFlowOutputStorageKey({
    workflowId,
    runId,
    stepId,
    outputName,
  }: GetFlowOutputStorageKeyParams) {
    return `flows/${workflowId}/${runId}/${stepId}/${outputName}.json` as const;
  }

  /**
   * Upload data directly to local storage without presigning.
   */
  async uploadDirect({
    key,
    body,
  }: {
    key: string;
    body: string | Buffer;
    contentType?: string;
  }): Promise<void> {
    const filePath = path.join(this.fileUploadPath, path.normalize(key));

    if (!filePath.startsWith(this.fileUploadPath)) {
      throw new Error("Invalid key: path traversal detected");
    }

    // Ensure the directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    await fs.promises.writeFile(filePath, body);
  }

  /**
   * Download data directly from local storage without presigning.
   */
  async downloadDirect({ key }: { key: string }): Promise<Buffer> {
    const filePath = path.join(this.fileUploadPath, path.normalize(key));

    if (!filePath.startsWith(this.fileUploadPath)) {
      throw new Error("Invalid key: path traversal detected");
    }

    return fs.promises.readFile(filePath);
  }

  /** Sets up express routes required for uploading and downloading files */
  setupExpressRoutes(app: Express) {
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
