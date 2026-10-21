import { isStoredPayloadRef } from "./types.js";

import type {
  ArrayStoredPayloadRef,
  FlowInputValues,
  StorablePayloadKind,
  StoredConcatRef,
  StoredItemRef,
} from "./types.js";

/**
 * A payload value of any kind, inline or stored, or an item of one. These helpers work on values whatever their
 * kind, as workflow code does not know it.
 */
// oxlint-disable-next-line typescript/no-restricted-types -- the helpers accept the payload values of every kind, which have no common type
type UntypedPayloadValue = unknown;

/*
 * Operations on stored payload references that need only their metadata, so workflow code (which can't do
 * I/O) can iterate over and combine stored arrays. Activities resolve the results.
 */

/**
 * Checks inputs given to a flow from outside it, e.g. by a user, a schedule or a trigger. Only activities create
 * stored payload references, and a run only resolves references to its own outputs, so one given as an input can
 * never resolve.
 *
 * @throws {Error} naming the input whose value, or an item of it, is a stored payload reference.
 */
export const assertNoStoredPayloadRefsInFlowInputs = (
  flowInputs: FlowInputValues,
): void => {
  /* Inputs from outside aren't validated yet, so a payload may not be an object. */
  for (const [inputName, payload] of Object.entries<{
    value?: UntypedPayloadValue;
  } | null>(flowInputs)) {
    const value = payload?.value;
    const items: UntypedPayloadValue[] = Array.isArray(value) ? value : [value];

    if (items.some(isStoredPayloadRef)) {
      throw new Error(
        `Flow input "${inputName}" contains a stored payload reference, which only the flow's own steps can create`,
      );
    }
  }
};

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

  return Array.from({ length: ref.length }, (_, index): StoredItemRef<K> => ({
    __stored: true,
    kind: ref.kind,
    array: false,
    of: ref,
    index,
  }));
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
export const getArrayPayloadLength = (value: UntypedPayloadValue): number => {
  if (isStoredPayloadRef(value)) {
    if (!value.array) {
      throw new TypeError("Cannot get the length of a singular stored payload");
    }

    return value.length;
  }

  if (!Array.isArray(value)) {
    throw new TypeError("Cannot get the length of a singular payload");
  }

  return value.length;
};

/**
 * The items of an array payload value, whether inline or stored: a stored array yields a reference per item.
 */
export const getArrayPayloadItems = (
  value: UntypedPayloadValue,
): UntypedPayloadValue[] => {
  if (isStoredPayloadRef(value)) {
    if (!value.array) {
      throw new TypeError("Cannot get the items of a singular stored payload");
    }

    return getStoredItemRefs(value);
  }

  if (!Array.isArray(value)) {
    throw new TypeError("Cannot get the items of a singular payload");
  }

  return value;
};

/**
 * Adds a value collected from one branch of a for-each step to those collected so far.
 *
 * Array values are concatenated (stored arrays by reference), and singular values are appended.
 */
export const appendCollectedValue = (
  collected: UntypedPayloadValue[] | ArrayStoredPayloadRef | undefined,
  value: UntypedPayloadValue,
): UntypedPayloadValue[] | ArrayStoredPayloadRef => {
  if (isStoredPayloadRef(value) && value.array) {
    if (collected !== undefined && !isStoredPayloadRef(collected)) {
      throw new TypeError(
        "Cannot concatenate a stored array with an inline array",
      );
    }

    return concatStoredArrayRefs(value.kind, [
      ...(collected === undefined ? [] : [collected]),
      value,
    ]);
  }

  if (isStoredPayloadRef(collected)) {
    throw new TypeError(
      "Cannot concatenate an inline value with a stored array",
    );
  }

  const valueItems: UntypedPayloadValue[] = Array.isArray(value)
    ? value
    : [value];

  return [...(collected ?? []), ...valueItems];
};
