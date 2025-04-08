import {
  createReadStream,
  createWriteStream,
  mkdirSync,
  statSync,
} from "node:fs";
import { unlink } from "node:fs/promises";
import * as http from "node:http";
import * as https from "node:https";
import path from "node:path";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import type { ReadableStream } from "node:stream/web";
import { fileURLToPath } from "node:url";

import type {
  ActorId,
  OwnedById,
  PropertyObjectMetadata,
  ProvidedEntityEditionProvenance,
} from "@blockprotocol/type-system";
import { getAwsS3Config } from "@local/hash-backend-utils/aws-config";
import {
  formatFileUrl,
  getEntityTypeIdForMimeType,
} from "@local/hash-backend-utils/file-storage";
import { AwsS3StorageProvider } from "@local/hash-backend-utils/file-storage/aws-s3-storage-provider";
import type { GraphApi } from "@local/hash-graph-client/dist/api.d";
import {
  Entity,
  mergePropertyObjectAndMetadata,
  propertyObjectToPatches,
} from "@local/hash-graph-sdk/entity";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { createDefaultAuthorizationRelationships } from "@local/hash-isomorphic-utils/graph-queries";
import { normalizeWhitespace } from "@local/hash-isomorphic-utils/normalize";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type {
  File,
  FileProperties,
} from "@local/hash-isomorphic-utils/system-types/shared";
import mime from "mime-types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baseFilePath = path.join(__dirname, "/var/tmp_files");

const downloadFileToFileSystem = async (fileUrl: string) => {
  mkdirSync(baseFilePath, { recursive: true });

  const tempFileName = generateUuid();
  const filePath = path.join(baseFilePath, tempFileName);

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
      reject(new Error(`Request error writing file to S3: ${error.message}`));
    });

    fileStream.on("error", (error) =>
      reject(new Error(`Error reading file from file path: ${error.message}`)),
    );
    fileStream.pipe(req);
    fileStream.on("end", () => req.end());
  }).finally(() => {
    void unlink(filePath);
  });
};

export const createFileEntityFromUrl = async (params: {
  actorId: ActorId;
  graphApiClient: GraphApi;
  url: string;
  propertyMetadata?: PropertyObjectMetadata;
  provenance?: ProvidedEntityEditionProvenance;
  description?: string;
  displayName?: string;
  webId: OwnedById;
}): Promise<
  | {
      status: "ok";
      entity: Entity<File>;
    }
  | {
      status: "error-uploading-file";
      message: string;
    }
  | {
      status: "error-downloading-file";
      message: string;
    }
> => {
  const {
    actorId,
    graphApiClient,
    url: originalUrl,
    description,
    displayName,
    propertyMetadata,
    provenance: provenanceFromParams,
    webId,
  } = params;

  const urlObject = new URL(originalUrl);
  const urlWithoutParams = new URL(urlObject.origin + urlObject.pathname);
  const filename = normalizeWhitespace(
    urlWithoutParams.pathname.split("/").pop()!,
  );

  let localFilePath;
  try {
    localFilePath = await downloadFileToFileSystem(originalUrl);
  } catch (err) {
    const message = `Error downloading file from URL: ${
      (err as Error).message
    }`;

    // eslint-disable-next-line no-console
    console.error(message);

    return {
      status: "error-downloading-file",
      message,
    };
  }

  const mimeType = mime.lookup(filename) || "application/octet-stream";
  const entityTypeIds = getEntityTypeIdForMimeType(mimeType)
    ? [getEntityTypeIdForMimeType(mimeType)]
    : [systemEntityTypes.file.entityTypeId];

  const stats = statSync(localFilePath);
  const fileSizeInBytes = stats.size;

  const initialProperties: FileProperties = {
    "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
      description ?? undefined,
    "https://blockprotocol.org/@blockprotocol/types/property-type/file-name/":
      filename,
    "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/":
      displayName ?? filename,
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

  const provenance: ProvidedEntityEditionProvenance = provenanceFromParams ?? {
    actorType: "machine",
    origin: {
      type: "flow",
    },
  };

  const incompleteFileEntity = await Entity.create<File>(
    graphApiClient,
    { actorId },
    {
      draft: false,
      ownedById: webId,
      properties: mergePropertyObjectAndMetadata<File>(
        initialProperties,
        propertyMetadata,
      ),
      entityTypeIds: entityTypeIds as [
        typeof systemEntityTypes.file.entityTypeId,
      ],
      relationships: createDefaultAuthorizationRelationships({ actorId }),
      provenance,
    },
  );

  const s3Config = getAwsS3Config();

  const uploadProvider = new AwsS3StorageProvider(s3Config);

  const editionIdentifier = generateUuid();

  const key = uploadProvider.getFileEntityStorageKey({
    entityId: incompleteFileEntity.metadata.recordId.entityId,
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

  const updatedProperties: File["propertiesWithMetadata"] = {
    ...fileStorageProperties,
    value: {
      ...fileStorageProperties.value,
      "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/":
        {
          value: formatFileUrl(key),
          metadata: {
            dataTypeId: "https://hash.ai/@h/types/data-type/uri/v/1",
          },
        },
    },
  };

  const updatedEntity = await incompleteFileEntity.patch(
    graphApiClient,
    { actorId },
    {
      propertyPatches: propertyObjectToPatches(updatedProperties),
      provenance,
    },
  );

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
      status: "error-uploading-file",
      message,
    };
  }

  return {
    status: "ok",
    entity: updatedEntity,
  };
};
