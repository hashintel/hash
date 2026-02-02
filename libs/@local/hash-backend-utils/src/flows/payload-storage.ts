import type {
  PayloadKindValues,
  StoredPayloadKind,
  StoredPayloadRef,
} from "@local/hash-isomorphic-utils/flows/types";

import { getAwsS3Config } from "../aws-config.js";
import { AwsS3StorageProvider } from "../file-storage/aws-s3-storage-provider.js";

let _storageProvider: AwsS3StorageProvider | undefined;

/**
 * Get a singleton instance of the S3 storage provider.
 * This is shared across all activities in a worker.
 */
export const getStorageProvider = (): AwsS3StorageProvider => {
  if (!_storageProvider) {
    const s3Config = getAwsS3Config();
    _storageProvider = new AwsS3StorageProvider(s3Config);
  }
  return _storageProvider;
};

export type StorePayloadParams<K extends StoredPayloadKind> = {
  storageProvider: AwsS3StorageProvider;
  workflowId: string;
  runId: string;
  stepId: string;
  outputName: string;
  kind: K;
  value: PayloadKindValues[K] | PayloadKindValues[K][];
};

/**
 * Store a payload in S3 and return a reference to it.
 * Used to avoid passing large payloads through Temporal activities.
 * Only works with StoredPayloadKind types (ProposedEntity, ProposedEntityWithResolvedLinks).
 */
export const storePayload = async <K extends StoredPayloadKind>(
  params: StorePayloadParams<K>,
): Promise<StoredPayloadRef<K>> => {
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
  };
};

/**
 * Retrieve a payload from S3 using a stored reference.
 * Only works with StoredPayloadKind types (ProposedEntity, ProposedEntityWithResolvedLinks).
 */
export const retrievePayload = async <K extends StoredPayloadKind>(
  storageProvider: AwsS3StorageProvider,
  ref: StoredPayloadRef<K>,
): Promise<PayloadKindValues[K] | PayloadKindValues[K][]> => {
  const buffer = await storageProvider.downloadDirect({ key: ref.storageKey });
  const data = JSON.parse(buffer.toString("utf-8")) as
    | PayloadKindValues[K]
    | PayloadKindValues[K][];

  return data;
};

/**
 * Retrieve a payload from S3 as a single value (not array).
 * Throws if the stored payload was an array.
 * Only works with StoredPayloadKind types (ProposedEntity, ProposedEntityWithResolvedLinks).
 */
export const retrieveSingularPayload = async <K extends StoredPayloadKind>(
  storageProvider: AwsS3StorageProvider,
  ref: StoredPayloadRef<K>,
): Promise<PayloadKindValues[K]> => {
  if (ref.array) {
    throw new Error(
      `Expected singular payload but got array for storage key: ${ref.storageKey}`,
    );
  }
  return (await retrievePayload(storageProvider, ref)) as PayloadKindValues[K];
};

/**
 * Retrieve a payload from S3 as an array.
 * Throws if the stored payload was not an array.
 * Only works with StoredPayloadKind types (ProposedEntity, ProposedEntityWithResolvedLinks).
 */
export const retrieveArrayPayload = async <K extends StoredPayloadKind>(
  storageProvider: AwsS3StorageProvider,
  ref: StoredPayloadRef<K>,
): Promise<PayloadKindValues[K][]> => {
  if (!ref.array) {
    throw new Error(
      `Expected array payload but got singular for storage key: ${ref.storageKey}`,
    );
  }
  return (await retrievePayload(
    storageProvider,
    ref,
  )) as PayloadKindValues[K][];
};

/**
 * Resolve a stored payload reference to its actual value.
 * Only works with StoredPayloadKind types (ProposedEntity, ProposedEntityWithResolvedLinks).
 *
 * @param kind - The payload kind, used for type inference
 */
export const resolvePayloadValue = async <K extends StoredPayloadKind>(
  storageProvider: AwsS3StorageProvider,
  _kind: K,
  ref: StoredPayloadRef<K>,
): Promise<PayloadKindValues[K]> => {
  return retrieveSingularPayload(storageProvider, ref);
};

/**
 * Resolve a stored payload reference to its actual array value.
 * Only works with StoredPayloadKind types (ProposedEntity, ProposedEntityWithResolvedLinks).
 *
 * @param kind - The payload kind, used for type inference
 */
export const resolveArrayPayloadValue = async <K extends StoredPayloadKind>(
  storageProvider: AwsS3StorageProvider,
  _kind: K,
  ref: StoredPayloadRef<K>,
): Promise<PayloadKindValues[K][]> => {
  return retrieveArrayPayload(storageProvider, ref);
};
