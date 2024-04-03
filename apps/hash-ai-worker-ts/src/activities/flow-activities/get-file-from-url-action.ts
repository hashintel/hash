import fs from "node:fs";
import { unlink } from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import type { ReadableStream } from "node:stream/web";

import {
  createEntity,
  updateEntity,
} from "@apps/hash-api/src/graph/knowledge/primitive/entity";
import { formatUrl } from "@apps/hash-api/src/graph/knowledge/system-types/file";
import { setupStorageProviders } from "@apps/hash-api/src/storage";
import { getAwsS3Config } from "@local/hash-backend-utils/aws-config";
import { getEntityTypeIdForMimeType } from "@local/hash-backend-utils/file-storage";
import { AwsS3StorageProvider } from "@local/hash-backend-utils/file-storage/aws-s3-storage-provider";
import type { GraphApi } from "@local/hash-graph-client";
import {
  getSimplifiedActionInputs,
  type OutputNameForAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import { createDefaultAuthorizationRelationships } from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type {
  File,
  FileProperties,
} from "@local/hash-isomorphic-utils/system-types/shared";
import type { Entity } from "@local/hash-subgraph";
import { mapGraphApiEntityMetadataToMetadata } from "@local/hash-subgraph/src/stdlib/subgraph/roots";
import { StatusCode } from "@local/status";
import id128 from "id128";
import mime from "mime-types";

import { fetchFileFromUrl } from "../shared/fetch-file-from-url";
import type { FlowActionActivity } from "./types";

const baseFilePath = "/tmp";

// @todo move this to a shared location
const genId = () => id128.Uuid4.generate().toCanonical().toLowerCase();

const downloadFileToFileSystem = async (fileUrl: string) => {
  const tempFileName = genId();
  const filePath = path.join(baseFilePath, tempFileName);

  const response = await fetch(fileUrl);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to fetch ${fileUrl}: ${response.statusText}`);
  }

  try {
    const fileStream = fs.createWriteStream(filePath);
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
  presignedPutUrl,
}: {
  filePath: string;
  presignedPutUrl: string;
}) => {
  return new Promise((resolve, reject) => {
    const fileStream = fs.createReadStream(filePath);
    const req = https.request(presignedPutUrl, { method: "PUT" }, (res) => {
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
    });

    req.on("error", (error) =>
      reject(new Error(`Error uploading to S3: ${error.message}`)),
    );

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

  let localFilePath;
  try {
    localFilePath = await downloadFileToFileSystem(originalUrl);
  } catch (err) {
    const message = `Error downloading file from URL: ${(err as Error).message}`;

    // @todo logger
    console.error(message);
    return {
      code: StatusCode.Internal, // @todo: better error code
      message,
    };
  }

  const filename = originalUrl.split("/").pop()!;

  const mimeType = mime.lookup(filename) || "application/octet-stream";
  const entityTypeId =
    getEntityTypeIdForMimeType(mimeType) ?? systemEntityTypes.file.entityTypeId;

  const stats = fs.statSync(localFilePath);
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

  const uploadProvider = new AwsS3StorageProvider(getAwsS3Config());

  const editionIdentifier = genId();

  const key = uploadProvider.getFileEntityStorageKey({
    entityId: incompleteFileEntityMetadata.recordId.entityId,
    editionIdentifier,
    filename,
  });

  const { fileStorageProperties, presignedPut } =
    await uploadProvider.presignUpload({
      key,
      headers: {
        "content-length": fileSizeInBytes,
        "content-type": mimeType,
      },
      expiresInSeconds: 60 * 60 * 1,
    });

  const properties: FileProperties = {
    ...initialProperties,
    "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/":
      formatUrl(key),
    ...fileStorageProperties,
  };

  const entity = (await updateEntity(ctx, authentication, {
    entity: fileEntity,
    entityTypeId,
    properties,
  })) as Entity<FileProperties>;

  try {
    const { fileStorageProperties, presignedPut } =
      await uploadProvider.presignUpload({
        key,
        headers: {
          "content-length": size,
          "content-type": mimeType,
        },
        expiresInSeconds: UPLOAD_URL_EXPIRATION_SECONDS,
      });

    await writeFileToS3URL({
      filePath: localFilePath,
      presignedPutUrl: fileEntity.presignedPut.url,
    });
  } catch (err) {
    const message = `Error uploading file to S3: ${(err as Error).message}`;

    // @todo logger
    console.error(message);
    return {
      code: StatusCode.Internal, // @todo: better error code
      message,
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
              value: fileEntity,
            },
          },
        ],
      },
    ],
  };
};

export const createFileFromExternalUrl: ImpureGraphFunction<
  MutationCreateFileFromUrlArgs,
  Promise<File>,
  false,
  true
> = async (ctx, authentication, params) => {
  const { description, displayName, url } = params;

  const filename = url.split("/").pop()!;

  const { entityTypeId, existingEntity, mimeType, ownedById } =
    await generateCommonParameters(ctx, authentication, params, filename);

  try {
    return existingEntity
      ? ((await updateEntity(ctx, authentication, {
          entity: existingEntity,
          entityTypeId,
          properties,
        })) as unknown as File)
      : ((await createEntity(ctx, authentication, {
          ownedById,
          properties,
          entityTypeId,
          relationships:
            createDefaultAuthorizationRelationships(authentication),
        })) as unknown as File);
  } catch (error) {
    throw new Error(
      `There was an error creating the file entity from a link: ${error}`,
    );
  }
};
