import { ApplicationFailure } from "@temporalio/common";

import {
  describePayloadValueProblem,
  validatePayloadValue,
} from "@local/hash-isomorphic-utils/flows/payload-schemas";
import {
  isStoredPayloadRef,
  storedArrayPayloadKinds,
  storedPayloadKinds,
} from "@local/hash-isomorphic-utils/flows/types";

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
  PayloadWithKind,
  ResolvedPayloadWithKind,
  StorablePayloadKind,
  StoredArrayPayloadKind,
  StoredObjectRef,
  StoredPayloadKind,
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

/**
 * The type of the failure thrown for a payload value that isn't valid of its kind. Retrying can't change a stored
 * value, and an action that computed an invalid value is rejected without a retry, as an invalid output is.
 */
const invalidPayloadValueFailureType = "InvalidPayloadValue";

export type StorePayloadParams<
  Kind extends StorablePayloadKind,
  IsArray extends boolean,
> = {
  storageProvider: FileStorageProvider;
  workflowId: string;
  runId: string;
  stepId: string;
  outputName: string;
  kind: Kind;
  value: IsArray extends true
    ? PayloadKindValues[Kind][]
    : PayloadKindValues[Kind];
};

/**
 * Store a payload in S3 and return a typed reference to it. An array's reference records its length, so
 * workflows can iterate over it without fetching it.
 *
 * Used to avoid passing large payloads through Temporal activities.
 *
 * @throws a non-retryable failure, with the path of the invalid value, if the value isn't a valid value of its kind
 *   (see `validatePayloadValue`). Nothing is written.
 */
export const storePayload = async <
  Kind extends StorablePayloadKind,
  Value extends PayloadKindValues[Kind] | PayloadKindValues[Kind][],
>(params: {
  storageProvider: FileStorageProvider;
  workflowId: string;
  runId: string;
  stepId: string;
  outputName: string;
  kind: Kind;
  value: Value;
}): Promise<StoredObjectRef<Kind, Value extends unknown[] ? true : false>> => {
  const {
    storageProvider,
    workflowId,
    runId,
    stepId,
    outputName,
    kind,
    value,
  } = params;

  const problem = validatePayloadValue({
    kind,
    array: Array.isArray(value),
    value,
    allowStoredRefs: false,
  });

  if (problem) {
    throw ApplicationFailure.nonRetryable(
      `Can't store output "${outputName}", which is invalid${describePayloadValueProblem(problem)}`,
      invalidPayloadValueFailureType,
    );
  }

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
  ) as StoredObjectRef<Kind, Value extends unknown[] ? true : false>;
};

/**
 * Recent downloads of stored objects, by storage key. Stored objects are never modified once written, so they
 * can be reused: this stops each branch of a for-each step from downloading the same array to pick its item.
 * The cache is kept small because stored payloads can be large.
 *
 * It holds the downloaded text, and each read parses its own copy, so a caller that changes the value it gets
 * doesn't change what later reads get.
 */
const downloadCache = new Map<string, Promise<string>>();
const maxCachedDownloads = 20;

const downloadStoredObject = (
  storageProvider: FileStorageProvider,
  storageKey: string,
): Promise<unknown> => {
  const parse = (text: string) => JSON.parse(text) as unknown;

  const cached = downloadCache.get(storageKey);

  if (cached) {
    return cached.then(parse);
  }

  const download = storageProvider
    .downloadDirect({ key: storageKey })
    .then((buffer) => buffer.toString("utf-8"));

  /*
   * Don't cache failures, so that a later attempt can retry the download. A newer download of the same key may have
   * replaced this one if it was dropped from the cache while pending, so only remove this one.
   */
  download.catch(() => {
    if (downloadCache.get(storageKey) === download) {
      downloadCache.delete(storageKey);
    }
  });

  if (downloadCache.size >= maxCachedDownloads) {
    const oldestKey = downloadCache.keys().next().value;

    if (oldestKey !== undefined) {
      downloadCache.delete(oldestKey);
    }
  }

  downloadCache.set(storageKey, download);

  return download.then(parse);
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
 * @throws a non-retryable failure, with the path of the invalid value, if a value retrieved from storage isn't valid
 *   of its kind (see `validatePayloadValue`).
 */
const checkRetrievedValue = (params: {
  kind: PayloadKind;
  array: boolean;
  value: unknown;
}) => {
  const problem = validatePayloadValue({ ...params, allowStoredRefs: false });

  if (problem) {
    throw ApplicationFailure.nonRetryable(
      `The stored ${params.kind} value is invalid${describePayloadValueProblem(problem)}`,
      invalidPayloadValueFailureType,
    );
  }
};

/**
 * The value a stored reference or payload value resolves to.
 */
type ResolvedValue<Kind extends PayloadKind, Value> = Value extends
  | { array: true }
  | readonly unknown[]
  ? PayloadKindValues[Kind][]
  : PayloadKindValues[Kind];

/**
 * Retrieve a payload from S3 using a stored reference: a stored object, one item of a stored array, or a
 * concatenation of stored arrays. The value is checked against the reference's kind, as `resolvePayloadValue` checks.
 */
export const retrievePayload = async <
  Kind extends StorablePayloadKind,
  StoredRef extends StoredPayloadRef<Kind>,
>(
  context: ResolvePayloadContext,
  ref: StoredRef,
): Promise<ResolvedValue<Kind, StoredRef>> => {
  const value = await retrieveStoredValue(context, ref);

  checkRetrievedValue({ kind: ref.kind, array: ref.array, value });

  return value as ResolvedValue<Kind, StoredRef>;
};

/**
 * The value a payload value resolves to: a stored reference retrieved, or the item references in an array retrieved
 * (e.g. one a flow wrapped from a singular item of a stored array). Inline values are returned as they are.
 */
const resolveStoredValues = (
  context: ResolvePayloadContext,
  value: unknown,
): Promise<unknown> =>
  isStoredPayloadRef(value)
    ? retrieveStoredValue(context, value)
    : Array.isArray(value)
      ? Promise.all(
          value.map((item: unknown) =>
            isStoredPayloadRef(item)
              ? retrieveStoredValue(context, item)
              : item,
          ),
        )
      : Promise.resolve(value);

/**
 * Resolve a payload value for an action to use, retrieving anything stored: a stored reference, or the item
 * references in an array (e.g. one a flow wrapped from a singular item of a stored array). Inline values are
 * returned as they are.
 *
 * A value with anything retrieved is checked against `kind`'s schema (see `validatePayloadValue`), with the cost of a
 * pass over it, like parsing it. A wholly inline value isn't: it was checked when the flow was given it, or when the
 * action that returned it did.
 *
 * @throws a non-retryable failure, with the path of the invalid value, if a retrieved value isn't valid of `kind`.
 */
export const resolvePayloadValue = async <
  Kind extends PayloadKind,
  Value extends PayloadValue<Kind, boolean>,
>(
  context: ResolvePayloadContext,
  kind: Kind,
  value: Value,
): Promise<ResolvedValue<Kind, Value>> => {
  if (
    !isStoredPayloadRef(value) &&
    !(Array.isArray(value) && value.some(isStoredPayloadRef))
  ) {
    return value as ResolvedValue<Kind, Value>;
  }

  const resolved = await resolveStoredValues(context, value);

  checkRetrievedValue({
    kind,
    array: isStoredPayloadRef(value) ? value.array : true,
    value: resolved,
  });

  return resolved as ResolvedValue<Kind, Value>;
};

/**
 * Resolve a payload value to show it, e.g. in a run's events or outputs, as `resolvePayloadValue` does but without
 * checking the value against its kind's schema. Values stored before the schemas existed, or before a schema was
 * tightened, are shown as they are.
 *
 * @param _kind - The payload kind, used for type inference at call sites
 */
export const resolvePayloadValueToShow = async <
  Kind extends PayloadKind,
  Value extends PayloadValue<Kind, boolean>,
>(
  context: ResolvePayloadContext,
  _kind: Kind,
  value: Value,
): Promise<ResolvedValue<Kind, Value>> =>
  (await resolveStoredValues(context, value)) as ResolvedValue<Kind, Value>;

/**
 * Resolves an input payload of any kind, downloading it if it's stored, and returns its value with its kind.
 *
 * For an action that only learns an input's kind when it runs: a kind source, or an input with a derived kind (see
 * `KindFrom`). An action that knows its inputs' kinds uses `resolvePayloadValue`.
 */
export const resolveInputPayload = async <
  Kind extends PayloadKind,
  IsArray extends boolean,
>(
  context: ResolvePayloadContext,
  payload: PayloadWithKind<Kind, IsArray>,
): Promise<ResolvedPayloadWithKind<Kind, IsArray>> =>
  ({
    kind: payload.kind,
    value: await resolvePayloadValue(context, payload.kind, payload.value),
  }) as ResolvedPayloadWithKind<Kind, IsArray>;

/**
 * Whether a value of this kind is stored in S3 rather than passed inline: a value of a stored kind, or an array
 * of a stored-array kind.
 */
const requiresStorage = (kind: PayloadKind, value: unknown) =>
  storedPayloadKinds.includes(kind as StoredPayloadKind) ||
  (Array.isArray(value) &&
    storedArrayPayloadKinds.includes(kind as StoredArrayPayloadKind));

/**
 * Prepares an output payload of any kind for an action to return: stores it in S3 if its kind requires it, and
 * otherwise returns it inline.
 *
 * The counterpart of `resolveInputPayload`, for an output whose kind the action only learns when it runs.
 */
export const prepareOutputPayload = async <
  Kind extends PayloadKind,
  IsArray extends boolean,
>(params: {
  storageProvider: FileStorageProvider;
  workflowId: string;
  runId: string;
  stepId: string;
  outputName: string;
  payload: ResolvedPayloadWithKind<Kind, IsArray>;
}): Promise<PayloadWithKind<Kind, IsArray>> => {
  const { payload, ...storeParams } = params;
  const { kind, value } = payload;

  if (!requiresStorage(kind, value)) {
    return payload as PayloadWithKind<Kind, IsArray>;
  }

  return {
    kind,
    value: await storePayload({
      ...storeParams,
      kind: kind as StorablePayloadKind,
      value: value as
        | PayloadKindValues[StorablePayloadKind]
        | PayloadKindValues[StorablePayloadKind][],
    }),
  } as PayloadWithKind<Kind, IsArray>;
};
