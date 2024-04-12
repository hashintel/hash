import {
  createReadStream,
  createWriteStream,
  mkdirSync,
  statSync,
} from "node:fs";
import { unlink } from "node:fs/promises";
import * as http from "node:http";
import * as https from "node:https";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import type { ReadableStream } from "node:stream/web";
import { fileURLToPath } from "node:url";

import { getAwsS3Config } from "@local/hash-backend-utils/aws-config";
import {
  formatFileUrl,
  getEntityTypeIdForMimeType,
} from "@local/hash-backend-utils/file-storage";
import { AwsS3StorageProvider } from "@local/hash-backend-utils/file-storage/aws-s3-storage-provider";
import type { GraphApi } from "@local/hash-graph-client";
import {
  getSimplifiedActionInputs,
  type OutputNameForAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { createDefaultAuthorizationRelationships } from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { mapGraphApiEntityMetadataToMetadata } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type { FileProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import type { Entity } from "@local/hash-subgraph";
import { StatusCode } from "@local/status";
import mime from "mime-types";

import type { FlowActionActivity } from "./types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const baseFilePath = join(__dirname, "/var/tmp_files");

const downloadFileToFileSystem = async (fileUrl: string) => {
  mkdirSync(baseFilePath, { recursive: true });

  const tempFileName = generateUuid();
  const filePath = join(baseFilePath, tempFileName);

  const response = await fetch(fileUrl);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to fetch ${fileUrl}: ${response.statusText}`);
  }

  try {
    const fileStream = createWriteStream(filePath);
    await finished(
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(
        fileStream,
      ),
    );
    return filePath;
  } catch (error) {
    await unlink(filePath);
    throw new Error(
      `Failed to write file to file system: ${(error as Error).message}`,
    );
  }
};

const writeFileToS3URL = async ({
  filePath,
  mimeType,
  presignedPutUrl,
  sizeInBytes,
}: {
  filePath: string;
  mimeType: string;
  presignedPutUrl: string;
  sizeInBytes: number;
}) => {
  return new Promise((resolve, reject) => {
    const fileStream = createReadStream(filePath);
    const req = (presignedPutUrl.startsWith("https://") ? https : http).request(
      presignedPutUrl,
      {
        headers: { "Content-Length": sizeInBytes, "Content-Type": mimeType },
        method: "PUT",
      },
      (res) => {
        res.on("data", () => {});
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve("Ok");
          } else {
            reject(
              new Error(
                `${res.statusCode} Error uploading to S3: ${res.statusMessage}`,
              ),
            );
          }
        });
      },
    );

    req.on("error", (error) => {
      reject(new Error(`Request error: ${error.message}`));
    });

    fileStream.on("error", (error) =>
      reject(new Error(`Error reading file: ${error.message}`)),
    );
    fileStream.pipe(req);
    fileStream.on("end", () => req.end());
  }).finally(() => {
    void unlink(filePath);
  });
};

export const getFileFromUrlAction: FlowActionActivity<{
  graphApiClient: GraphApi;
}> = async ({ graphApiClient, inputs, userAuthentication }) => {
  const {
    description,
    displayName,
    url: originalUrl,
  } = getSimplifiedActionInputs({
    inputs,
    actionType: "getFileFromUrl",
  });

  const urlObject = new URL(originalUrl);
  const urlWithoutParams = new URL(urlObject.origin + urlObject.pathname);
  const filename = urlWithoutParams.pathname.split("/").pop()!;

  let localFilePath;
  try {
    localFilePath = await downloadFileToFileSystem(originalUrl);
  } catch (err) {
    const message = `Error downloading file from URL: ${(err as Error).message}`;

    // @todo logger – update once #4290 merges
    // eslint-disable-next-line no-console
    console.log(message);
    return {
      code: StatusCode.Internal, // @todo: better error code
      message,
      contents: [],
    };
  }

  const mimeType = mime.lookup(filename) || "application/octet-stream";
  const entityTypeId =
    getEntityTypeIdForMimeType(mimeType) ?? systemEntityTypes.file.entityTypeId;

  const stats = statSync(localFilePath);
  const fileSizeInBytes = stats.size;

  /** @todo: allow overriding this via an input, as with other actions (hardcoded in Flow definition?) */
  const ownedById = userAuthentication.actorId;

  const initialProperties: FileProperties = {
    "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
      description ?? undefined,
    "https://blockprotocol.org/@blockprotocol/types/property-type/file-name/":
      filename,
    "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/":
      displayName ?? undefined,
    "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/":
      originalUrl,
    "https://blockprotocol.org/@blockprotocol/types/property-type/mime-type/":
      mimeType,
    "https://blockprotocol.org/@blockprotocol/types/property-type/original-file-name/":
      filename,
    "https://blockprotocol.org/@blockprotocol/types/property-type/original-source/":
      "URL",
    "https://blockprotocol.org/@blockprotocol/types/property-type/original-url/":
      originalUrl,
    "https://blockprotocol.org/@blockprotocol/types/property-type/file-size/":
      fileSizeInBytes,
  };

  const incompleteFileEntityMetadata = await graphApiClient
    .createEntity(
      // @todo which bot should this be?
      userAuthentication.actorId,
      {
        draft: false,
        ownedById,
        properties: initialProperties,
        entityTypeIds: [entityTypeId],
        relationships:
          createDefaultAuthorizationRelationships(userAuthentication),
      },
    )
    .then((result) => mapGraphApiEntityMetadataToMetadata(result.data));

  const s3Config = getAwsS3Config();

  const uploadProvider = new AwsS3StorageProvider(s3Config);

  const editionIdentifier = generateUuid();

  const key = uploadProvider.getFileEntityStorageKey({
    entityId: incompleteFileEntityMetadata.recordId.entityId,
    editionIdentifier,
    filename,
  });

  const { fileStorageProperties, presignedPut } =
    await uploadProvider.presignUpload({
      expiresInSeconds: 60 * 60 * 24, // 24 hours
      headers: {
        "content-length": fileSizeInBytes,
        "content-type": mimeType,
      },
      key,
    });

  const properties: FileProperties = {
    ...initialProperties,
    "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/":
      formatFileUrl(key),
    ...fileStorageProperties,
  };

  const updatedEntityMetadata = await graphApiClient
    .patchEntity(
      // @todo which bot should this be?
      userAuthentication.actorId,
      {
        entityId: incompleteFileEntityMetadata.recordId.entityId,
        properties: [
          {
            op: "replace",
            path: "",
            value: properties,
          },
        ],
      },
    )
    .then((result) => mapGraphApiEntityMetadataToMetadata(result.data));

  try {
    await writeFileToS3URL({
      filePath: localFilePath,
      mimeType,
      presignedPutUrl: presignedPut.url,
      sizeInBytes: fileSizeInBytes,
    });
  } catch (err) {
    const message = `Error uploading file: ${(err as Error).message}`;

    return {
      code: StatusCode.Internal, // @todo: better error code
      message,
      contents: [],
    };
  }

  return {
    code: StatusCode.Ok,
    contents: [
      {
        outputs: [
          {
            outputName:
              "fileEntity" satisfies OutputNameForAction<"getFileFromUrl">,
            payload: {
              kind: "Entity",
              value: {
                metadata: updatedEntityMetadata,
                properties,
              } satisfies Entity,
            },
          },
        ],
      },
    ],
  };
};
