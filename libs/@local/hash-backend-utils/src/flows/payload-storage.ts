import { isStoredPayloadRef } from "@local/hash-isomorphic-utils/flows/types";

import { getAwsS3Config } from "../aws-config.js";
import {
  getFlowOutputStorageKey,
  getFlowOutputStoragePrefix,
} from "../file-storage.js";
import { AwsS3StorageProvider } from "../file-storage/aws-s3-storage-provider.js";

import type { FileStorageProvider } from "../file-storage.js";
import type {
  PayloadKind,
  PayloadKindValues,
  PayloadValue,
  StorablePayloadKind,
  StoredObjectRef,
  StoredPayloadRef,
} from "@local/hash-isomorphic-utils/flows/types";

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
  K extends StorablePayloadKind,
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
 * Store a payload in S3 and return a typed reference to it. An array's reference records its length, so
 * workflows can iterate over it without fetching it.
 *
 * Used to avoid passing large payloads through Temporal activities.
 */
export const storePayload = async <
  K extends StorablePayloadKind,
  V extends PayloadKindValues[K] | PayloadKindValues[K][],
>(params: {
  storageProvider: FileStorageProvider;
  workflowId: string;
  runId: string;
  stepId: string;
  outputName: string;
  kind: K;
  value: V;
}): Promise<StoredObjectRef<K, V extends unknown[] ? true : false>> => {
  const {
    storageProvider,
    workflowId,
    runId,
    stepId,
    outputName,
    kind,
    value,
  } = params;

  const storageKey = getFlowOutputStorageKey({
    workflowId,
    runId,
    stepId,
    outputName,
  });

  const body = JSON.stringify(value);

  await storageProvider.uploadDirect({
    key: storageKey,
    body,
    contentType: "application/json",
  });

  return (
    Array.isArray(value)
      ? { __stored: true, kind, storageKey, array: true, length: value.length }
      : { __stored: true, kind, storageKey, array: false }
  ) as StoredObjectRef<K, V extends unknown[] ? true : false>;
};

/**
 * Recent downloads of stored objects, by storage key. Stored objects are never modified once written, so they
 * can be reused: this stops each branch of a for-each step from downloading the same array to pick its item.
 * The cache is kept small because stored payloads can be large.
 */
const downloadCache = new Map<string, Promise<unknown>>();
const maxCachedDownloads = 20;

const downloadStoredObject = (
  storageProvider: FileStorageProvider,
  storageKey: string,
): Promise<unknown> => {
  const cached = downloadCache.get(storageKey);

  if (cached) {
    return cached;
  }

  const download = storageProvider
    .downloadDirect({ key: storageKey })
    .then((buffer) => JSON.parse(buffer.toString("utf-8")) as unknown);

  /* Don't cache failures, so that a later attempt can retry the download. */
  download.catch(() => downloadCache.delete(storageKey));

  if (downloadCache.size >= maxCachedDownloads) {
    const oldestKey = downloadCache.keys().next().value;

    if (oldestKey !== undefined) {
      downloadCache.delete(oldestKey);
    }
  }

  downloadCache.set(storageKey, download);

  return download;
};

export type ResolvePayloadContext = {
  storageProvider: FileStorageProvider;
  /**
   * The Temporal workflow id of the run the reference was passed to. Only that run's own outputs are resolved, so a
   * reference supplied from elsewhere, e.g. in a flow's inputs, can't read another run's outputs or other objects in
   * the bucket.
   */
  workflowId: string;
};

const retrieveStoredValue = async (
  context: ResolvePayloadContext,
  ref: StoredPayloadRef,
): Promise<unknown> => {
  if ("parts" in ref) {
    const parts = await Promise.all(
      ref.parts.map((part) => retrieveStoredValue(context, part)),
    );

    return (parts as unknown[][]).flat();
  }

  if ("of" in ref) {
    const items = await retrieveStoredValue(context, ref.of);

    if (!Array.isArray(items)) {
      throw new Error(
        "An item reference points at a stored value that isn't an array",
      );
    }

    /* A reference can come from outside the workflow, so its index may not be one. */
    if (
      !Number.isSafeInteger(ref.index) ||
      ref.index < 0 ||
      ref.index >= items.length
    ) {
      throw new Error(
        `Stored array has ${items.length} items, so it has no item ${String(ref.index)}`,
      );
    }

    return items[ref.index] as unknown;
  }

  if (
    !ref.storageKey.startsWith(
      getFlowOutputStoragePrefix(context.workflowId),
    ) ||
    /* The local storage provider normalises keys as file paths, so `..` could reach another run's outputs. */
    ref.storageKey.split("/").includes("..")
  ) {
    throw new Error(
      `Stored payload ${ref.storageKey} is not an output of workflow ${context.workflowId}`,
    );
  }

  return downloadStoredObject(context.storageProvider, ref.storageKey);
};

/**
 * The value a stored reference or payload value resolves to.
 */
type ResolvedValue<K extends PayloadKind, V> = V extends
  | { array: true }
  | readonly unknown[]
  ? PayloadKindValues[K][]
  : PayloadKindValues[K];

/**
 * Retrieve a payload from S3 using a stored reference: a stored object, one item of a stored array, or a
 * concatenation of stored arrays.
 */
export const retrievePayload = async <
  K extends StorablePayloadKind,
  R extends StoredPayloadRef<K>,
>(
  context: ResolvePayloadContext,
  ref: R,
): Promise<ResolvedValue<K, R>> =>
  retrieveStoredValue(context, ref) as Promise<ResolvedValue<K, R>>;

/**
 * Resolve a payload value to the actual value, retrieving anything stored: a stored reference, or the item
 * references in an array (e.g. one a flow wrapped from a singular item of a stored array).
 * Inline values are returned as they are.
 *
 * @param _kind - The payload kind, used for type inference at call sites
 */
export const resolvePayloadValue = async <
  K extends PayloadKind,
  V extends PayloadValue<K, boolean>,
>(
  context: ResolvePayloadContext,
  _kind: K,
  value: V,
): Promise<ResolvedValue<K, V>> => {
  const resolved = isStoredPayloadRef(value)
    ? await retrieveStoredValue(context, value)
    : Array.isArray(value)
      ? await Promise.all(
          (value as unknown[]).map((item) =>
            isStoredPayloadRef(item)
              ? retrieveStoredValue(context, item)
              : item,
          ),
        )
      : value;

  return resolved as ResolvedValue<K, V>;
};
