import { isStoredPayloadRef } from "./types.js";

import type {
  ArrayStoredPayloadRef,
  StorablePayloadKind,
  StoredConcatRef,
  StoredItemRef,
} from "./types.js";

/*
 * Operations on stored payload references that need only their metadata, so workflow code (which can't do
 * I/O) can iterate over and combine stored arrays. Activities resolve the results.
 */

/**
 * A reference to each item of a stored array, in order. An item of a concatenation points at the part that holds
 * it, with its index within that part.
 */
export const getStoredItemRefs = <K extends StorablePayloadKind>(
  ref: ArrayStoredPayloadRef<K>,
): StoredItemRef<K>[] => {
  if ("parts" in ref) {
    return ref.parts.flatMap((part) => getStoredItemRefs(part));
  }

  return Array.from(
    { length: ref.length },
    (_, index): StoredItemRef<K> => ({
      __stored: true,
      kind: ref.kind,
      array: false,
      of: ref,
      index,
    }),
  );
};

/**
 * Stored arrays concatenated in order, without fetching them.
 */
export const concatStoredArrayRefs = <K extends StorablePayloadKind>(
  kind: K,
  refs: ArrayStoredPayloadRef<K>[],
): StoredConcatRef<K> => {
  const parts = refs.flatMap((ref) => ("parts" in ref ? ref.parts : [ref]));

  return {
    __stored: true,
    kind,
    array: true,
    parts,
    length: parts.reduce((total, part) => total + part.length, 0),
  };
};

/**
 * The number of items in an array payload value, whether inline or stored.
 */
export const getArrayPayloadLength = (value: unknown): number => {
  if (isStoredPayloadRef(value)) {
    if (!value.array) {
      throw new Error("Cannot get the length of a singular stored payload");
    }

    return value.length;
  }

  if (!Array.isArray(value)) {
    throw new Error("Cannot get the length of a singular payload");
  }

  return value.length;
};

/**
 * The items of an array payload value, whether inline or stored: a stored array yields a reference per item.
 */
export const getArrayPayloadItems = (value: unknown): unknown[] => {
  if (isStoredPayloadRef(value)) {
    if (!value.array) {
      throw new Error("Cannot get the items of a singular stored payload");
    }

    return getStoredItemRefs(value);
  }

  if (!Array.isArray(value)) {
    throw new Error("Cannot get the items of a singular payload");
  }

  return value;
};

/**
 * Adds a value collected from one branch of a for-each step to those collected so far.
 *
 * Array values are concatenated (stored arrays by reference), and singular values are appended.
 */
export const appendCollectedValue = (
  collected: unknown[] | ArrayStoredPayloadRef | undefined,
  value: unknown,
): unknown[] | ArrayStoredPayloadRef => {
  if (isStoredPayloadRef(value) && value.array) {
    if (collected !== undefined && !isStoredPayloadRef(collected)) {
      throw new Error("Cannot concatenate a stored array with an inline array");
    }

    return concatStoredArrayRefs(value.kind, [
      ...(collected === undefined ? [] : [collected]),
      value,
    ]);
  }

  if (isStoredPayloadRef(collected)) {
    throw new Error("Cannot concatenate an inline value with a stored array");
  }

  return [
    ...(collected ?? []),
    ...(Array.isArray(value) ? (value as unknown[]) : [value]),
  ];
};
