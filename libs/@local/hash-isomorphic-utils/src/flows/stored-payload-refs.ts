import {
  describePayloadValueProblem,
  validateStoredPayloadRef,
} from "./payload-schemas.js";
import { isStoredPayloadRef } from "./types.js";

import type {
  ArrayStoredPayloadRef,
  FlowInputValues,
  StorablePayloadKind,
  StoredConcatRef,
  StoredItemRef,
} from "./types.js";

/*
 * Operations on stored payload references that need only their metadata, so workflow code (which can't do
 * I/O) can iterate over and combine stored arrays. Activities resolve the results.
 */

/**
 * Checks inputs given to a flow from outside it, e.g. by a user, a schedule or a trigger. Only activities create
 * stored payload references, and a run only resolves references to its own outputs, so one given as an input can
 * never resolve.
 *
 * @throws naming the input whose value, or an item of it, is a stored payload reference.
 */
export const assertNoStoredPayloadRefsInFlowInputs = (
  flowInputs: FlowInputValues,
): void => {
  /* Inputs from outside aren't validated yet, so a payload may not be an object. */
  for (const [inputName, payload] of Object.entries<{ value?: unknown } | null>(
    flowInputs,
  )) {
    const value = payload?.value;
    const items: unknown[] = Array.isArray(value) ? value : [value];

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
 *
 * @throws if the reference isn't a valid reference to a stored array (see `validateStoredPayloadRef`), e.g. its
 *   `length` isn't a non-negative safe integer, before making any item references from it.
 */
export const getStoredItemRefs = <K extends StorablePayloadKind>(
  ref: ArrayStoredPayloadRef<K>,
): StoredItemRef<K>[] => {
  const problem = validateStoredPayloadRef({
    kind: ref.kind,
    array: true,
    ref,
  });

  if (problem) {
    throw new Error(
      `Invalid reference to a stored array${describePayloadValueProblem(problem)}`,
    );
  }

  return ("parts" in ref ? ref.parts : [ref]).flatMap((storedArray) =>
    Array.from(
      { length: storedArray.length },
      (_, index): StoredItemRef<K> => ({
        __stored: true,
        kind: ref.kind,
        array: false,
        of: storedArray,
        index,
      }),
    ),
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
