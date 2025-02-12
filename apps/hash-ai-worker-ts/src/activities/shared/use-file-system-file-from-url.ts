import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import type { ReadableStream } from "node:stream/web";
import { fileURLToPath } from "node:url";

import { getAwsS3Config } from "@local/hash-backend-utils/aws-config";
import { AwsS3StorageProvider } from "@local/hash-backend-utils/file-storage/aws-s3-storage-provider";
import type { Entity } from "@local/hash-graph-sdk/entity";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import type { File } from "@local/hash-isomorphic-utils/system-types/shared";

import { fetchFileFromUrl } from "./fetch-file-from-url.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baseFilePath = path.join(__dirname, "/var/tmp_files");

export const useFileSystemPathFromEntity = async <CallbackResponse = unknown>(
  fileEntity: Pick<Entity<File>, "entityId" | "properties">,
  callback: ({
    fileSystemPath,
  }: {
    fileSystemPath: string;
  }) => Promise<CallbackResponse>,
): Promise<CallbackResponse> => {
  const fileUrl =
    fileEntity.properties[
      "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/"
    ];

  if (!fileUrl) {
    throw new Error(
      `File entity with entityId ${fileEntity.entityId} does not have a fileUrl property`,
    );
  }

  if (typeof fileUrl !== "string") {
    throw new Error(
      `File entity with entityId ${fileEntity.entityId} has a fileUrl property of type '${typeof fileUrl}', expected 'string'`,
    );
  }

  const storageKey =
    fileEntity.properties[
      "https://hash.ai/@h/types/property-type/file-storage-key/"
    ];

  if (!storageKey) {
    throw new Error(
      `File entity with entityId ${fileEntity.entityId} does not have a fileStorageKey property`,
    );
  }

  if (typeof storageKey !== "string") {
    throw new Error(
      `File entity with entityId ${fileEntity.entityId} has a fileStorageKey property of type '${typeof storageKey}', expected 'string'`,
    );
  }

  await mkdir(baseFilePath, { recursive: true });

  const filePath = `${baseFilePath}/${generateUuid()}.pdf`;

  const s3Config = getAwsS3Config();

  const downloadProvider = new AwsS3StorageProvider(s3Config);

  const urlForDownload = await downloadProvider.presignDownload({
    entity: fileEntity,
    expiresInSeconds: 60 * 60,
    key: storageKey,
  });

  const fetchFileResponse = await fetchFileFromUrl(urlForDownload);

  if (!fetchFileResponse.ok || !fetchFileResponse.body) {
    throw new Error(
      `File entity with entityId ${fileEntity.entityId} has a fileUrl ${fileUrl} that could not be fetched: ${fetchFileResponse.statusText}`,
    );
  }

  try {
    const fileStream = createWriteStream(filePath);
    await finished(
      Readable.fromWeb(
        fetchFileResponse.body as ReadableStream<Uint8Array>,
      ).pipe(fileStream),
    );
  } catch (error) {
    await unlink(filePath);

    throw new Error(
      `Failed to write file to file system: ${(error as Error).message}`,
    );
  }

  const response = await callback({ fileSystemPath: filePath });

  await unlink(filePath);

  return response;
};
