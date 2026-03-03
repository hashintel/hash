import type {
  PayloadKindValues,
  StoredPayloadKind,
  StoredPayloadRef,
} from "@local/hash-isomorphic-utils/flows/types";

import { getAwsS3Config } from "../aws-config.js";
import type { FileStorageProvider } from "../file-storage.js";
import { AwsS3StorageProvider } from "../file-storage/aws-s3-storage-provider.js";

let _storageProvider: FileStorageProvider | undefined;

/**
 * Get a singleton instance of the S3 storage provider.
 * This is shared across all activities in a worker.
 */
export const getStorageProvider = (): FileStorageProvider => {
  if (!_storageProvider) {
    const s3Config = getAwsS3Config();
    _storageProvider = new AwsS3StorageProvider(s3Config);
  }
  return _storageProvider;
};

export type StorePayloadParams<
  K extends StoredPayloadKind,
  IsArray extends boolean,
> = {
  storageProvider: FileStorageProvider;
  workflowId: string;
  runId: string;
  stepId: string;
  outputName: string;
  kind: K;
  value: IsArray extends true ? PayloadKindValues[K][] : PayloadKindValues[K];
};

/**
 * Store a payload in S3 and return a typed reference to it.
 * The return type is inferred based on whether `value` is an array.
 *
 * Used to avoid passing large payloads through Temporal activities.
 * Only works with StoredPayloadKind types (ProposedEntity, ProposedEntityWithResolvedLinks, PersistedEntitiesMetadata).
 */
export const storePayload = async <
  K extends StoredPayloadKind,
  V extends PayloadKindValues[K] | PayloadKindValues[K][],
>(params: {
  storageProvider: FileStorageProvider;
  workflowId: string;
  runId: string;
  stepId: string;
  outputName: string;
  kind: K;
  value: V;
}): Promise<StoredPayloadRef<K, V extends unknown[] ? true : false>> => {
  const {
    storageProvider,
    workflowId,
    runId,
    stepId,
    outputName,
    kind,
    value,
  } = params;

  const storageKey = storageProvider.getFlowOutputStorageKey({
    workflowId,
    runId,
    stepId,
    outputName,
  });

  const isArray = Array.isArray(value);
  const body = JSON.stringify(value);

  await storageProvider.uploadDirect({
    key: storageKey,
    body,
    contentType: "application/json",
  });

  return {
    __stored: true,
    kind,
    storageKey,
    array: isArray,
  } as StoredPayloadRef<K, V extends unknown[] ? true : false>;
};

/**
 * Retrieve a payload from S3 using a stored reference.
 */
export const retrievePayload = async <
  K extends StoredPayloadKind,
  IsArray extends boolean,
>(
  storageProvider: FileStorageProvider,
  ref: StoredPayloadRef<K, IsArray>,
): Promise<
  IsArray extends true ? PayloadKindValues[K][] : PayloadKindValues[K]
> => {
  const buffer = await storageProvider.downloadDirect({ key: ref.storageKey });
  const data = JSON.parse(buffer.toString("utf-8")) as IsArray extends true
    ? PayloadKindValues[K][]
    : PayloadKindValues[K];

  return data;
};

/**
 * Resolve a stored payload reference to its actual value.
 * The return type is inferred from the ref's `IsArray` type parameter.
 *
 * Only works with StoredPayloadKind types (ProposedEntity, ProposedEntityWithResolvedLinks, PersistedEntitiesMetadata).
 *
 * @param _kind - The payload kind, used for type inference at call sites
 */
export const resolvePayloadValue = async <
  K extends StoredPayloadKind,
  IsArray extends boolean,
>(
  storageProvider: FileStorageProvider,
  _kind: K,
  ref: StoredPayloadRef<K, IsArray>,
): Promise<
  IsArray extends true ? PayloadKindValues[K][] : PayloadKindValues[K]
> => {
  return retrievePayload(storageProvider, ref);
};
