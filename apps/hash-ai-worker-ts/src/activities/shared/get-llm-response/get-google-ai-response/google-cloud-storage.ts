import { Storage } from "@google-cloud/storage";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { File } from "@local/hash-isomorphic-utils/system-types/shared";

import { logger } from "../../activity-logger.js";

let _googleCloudStorage: Storage | undefined;

const storageBucket = process.env.GOOGLE_CLOUD_STORAGE_BUCKET;

const getGoogleCloudStorage = () => {
  if (_googleCloudStorage) {
    return _googleCloudStorage;
  }

  const storage = new Storage();
  _googleCloudStorage = storage;

  return storage;
};

export const generateStoragePathFromHashFileStorageKey = ({
  hashFileStorageKey,
}: {
  hashFileStorageKey: string;
}): string => {
  if (!storageBucket) {
    throw new Error(
      "GOOGLE_CLOUD_STORAGE_BUCKET environment variable is not set",
    );
  }

  return `gs://${storageBucket}/${hashFileStorageKey}`;
};

const getHashFileStorageKeyFromGcpStorageUri = ({
  gcpStorageUri,
}: {
  gcpStorageUri: string;
}): string => {
  const hashFileStorageKey = gcpStorageUri.split("/").pop();

  if (!hashFileStorageKey) {
    throw new Error(
      `Hash file storage key not found in storage path ${gcpStorageUri}`,
    );
  }

  return hashFileStorageKey;
};

export const getFileEntityFromGcpStorageUri = ({
  fileEntities,
  gcpStorageUri,
}: {
  fileEntities: Pick<Entity<File>, "entityId" | "properties">[];
  gcpStorageUri: string;
}) => {
  const hashFileStorageKey = getHashFileStorageKeyFromGcpStorageUri({
    gcpStorageUri,
  });

  const fileEntity = fileEntities.find(
    (entity) =>
      entity.properties[
        "https://hash.ai/@hash/types/property-type/file-storage-key/"
      ] === hashFileStorageKey,
  );

  if (!fileEntity) {
    throw new Error(
      `File entity not found for storage key ${hashFileStorageKey}`,
    );
  }

  return fileEntity;
};

export const uploadFileToGcpStorage = async ({
  fileSystemPath,
  fileEntity,
}: {
  fileSystemPath: string;
  fileEntity: Pick<Entity<File>, "entityId" | "properties">;
}) => {
  const storage = getGoogleCloudStorage();

  if (!storageBucket) {
    throw new Error(
      "GOOGLE_CLOUD_STORAGE_BUCKET environment variable is not set",
    );
  }

  const hashFileStorageKey =
    fileEntity.properties[
      "https://hash.ai/@hash/types/property-type/file-storage-key/"
    ];

  if (!hashFileStorageKey) {
    throw new Error(
      `File entity ${fileEntity.entityId} has no file storage key`,
    );
  }

  const cloudStorageFilePath = generateStoragePathFromHashFileStorageKey({
    hashFileStorageKey,
  });

  try {
    await storage.bucket(storageBucket).file(hashFileStorageKey).getMetadata();

    logger.info(
      `Already exists in Google Cloud Storage: HASH key ${hashFileStorageKey} in ${storageBucket} bucket`,
    );
  } catch (err) {
    if ("code" in (err as Error) && (err as { code: unknown }).code === 404) {
      await storage
        .bucket(storageBucket)
        .upload(fileSystemPath, { destination: hashFileStorageKey });

      logger.info(
        `Uploaded to Google Cloud Storage: HASH key ${hashFileStorageKey} in ${storageBucket} bucket`,
      );
    } else {
      throw err;
    }
  }

  return {
    gcpStorageUri: cloudStorageFilePath,
  };
};
