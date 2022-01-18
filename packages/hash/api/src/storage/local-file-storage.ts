import path from "path";
import multer, { Multer, StorageEngine } from "multer";
import fs from "fs";
import { URL } from "url";
import express, { Express } from "express";
import appRoot from "app-root-path";
import { StorageType } from "../graphql/apiTypes.gen";

import {
  GetFileEntityStorageKeyParams,
  PresignedDownloadRequest,
  PresignedPostUpload,
  PresignedStorageRequest,
  StorageProvider,
} from "./storage-provider";
import { getFileExtension } from "./storage-utils";

const UPLOAD_BASE_URL = "/local-file-storage-upload";
const DOWNLOAD_BASE_URL = "/uploads";

export interface LocalFileSystemStorageProviderConstructorArgs {
  /** relative path or folder name where to store uploaded files */
  fileUploadPath: string;
  /** Base URL of the API for generating upload/download URLs */
  apiOrigin: string;
}
/** Implementation of the storage provider for local file storage.
 * NOTE: NOT MEANT TO BE USED IN PRODUCTION
 * This storage provider is given as an easy to setup alternative to S3 file uploads for simple setups.
 */
export class LocalFileSystemStorageProvider implements StorageProvider {
  public storageType: StorageType = StorageType.LocalFileSystem;

  private storage: StorageEngine;
  private upload: Multer;
  private fileUploadPath: string;
  private apiOrigin: string;

  constructor({
    fileUploadPath,
    apiOrigin,
  }: LocalFileSystemStorageProviderConstructorArgs) {
    this.fileUploadPath = path.join(appRoot.path, fileUploadPath);
    this.apiOrigin = apiOrigin;
    if (!fs.existsSync(this.fileUploadPath)) {
      fs.mkdirSync(this.fileUploadPath, { recursive: true });
    }
    this.storage = multer.diskStorage({
      destination: (_req, _file, cb) => {
        cb(null, this.fileUploadPath);
      },
      filename: (req, file, cb) => this.getFilenameForUpload(req, file, cb),
    });
    this.upload = multer({ storage: this.storage });
  }

  async presignUpload(
    params: PresignedStorageRequest,
  ): Promise<PresignedPostUpload> {
    const presignedPost = {
      url: new URL(UPLOAD_BASE_URL, this.apiOrigin).href,
      fields: {
        key: params.key,
      },
    };
    return presignedPost;
  }

  async presignDownload(params: PresignedDownloadRequest): Promise<string> {
    return new URL(path.join(DOWNLOAD_BASE_URL, params.key), this.apiOrigin)
      .href;
  }

  getFileEntityStorageKey({
    accountId,
    fileName,
    entityVersionId,
  }: GetFileEntityStorageKeyParams) {
    let fileKey = `${accountId}-${entityVersionId}`;
    // Find and add the file extension to the path if it exists
    const extension = getFileExtension(fileName);
    if (extension) {
      fileKey += extension[0];
    }
    return fileKey;
  }

  /** Sets up express routes required for uploading and downloading files */
  setupExpressRoutes(app: Express) {
    app.post(
      UPLOAD_BASE_URL,
      this.upload.single("file"),
      (_req, res, _next) => {
        res.status(200).send();
      },
    );

    app.use(DOWNLOAD_BASE_URL, express.static(this.fileUploadPath));
  }

  /** Uses the `key` generated in the previous upload request to know where to store the file */
  getFilenameForUpload(req: express.Request, _file: any, cb: any) {
    const key = req.body.key;
    if (!key) {
      cb(new Error(`Parameter 'key' is missing from the upload request'`));
    } else {
      cb(null, req.body.key);
    }
  }
}
