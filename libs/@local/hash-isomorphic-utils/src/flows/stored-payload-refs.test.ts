import { describe, expect, it } from "vitest";

import {
  getArrayPayloadItems,
  getStoredItemRefs,
} from "./stored-payload-refs.js";

import type {
  ArrayStoredPayloadRef,
  StoredConcatRef,
  StoredObjectRef,
} from "./types.js";

const storedArray: StoredObjectRef<"PersistedEntityMetadata", true> = {
  __stored: true,
  kind: "PersistedEntityMetadata",
  storageKey: "flows/other-run/outputs/step-1",
  array: true,
  length: 2,
};

describe("getStoredItemRefs", () => {
  const otherArray: StoredObjectRef<"PersistedEntityMetadata", true> = {
    ...storedArray,
    storageKey: "flows/other-run/outputs/step-2",
    length: 1,
  };

  const concat: StoredConcatRef<"PersistedEntityMetadata"> = {
    __stored: true,
    kind: "PersistedEntityMetadata",
    array: true,
    parts: [storedArray, otherArray],
    length: 3,
  };

  it("makes a reference to each item, in order, pointing at the array that holds it", () => {
    expect(
      getStoredItemRefs(concat).map(({ of, index }) => [of.storageKey, index]),
    ).toEqual([
      [storedArray.storageKey, 0],
      [storedArray.storageKey, 1],
      [otherArray.storageKey, 0],
    ]);
  });

  it.each<[string, unknown, string]>([
    ["a negative length", { ...storedArray, length: -1 }, "at length"],
    ["a fractional length", { ...storedArray, length: 2.5 }, "at length"],
    [
      "a length too large to count",
      { ...storedArray, length: 2 ** 53 },
      "at length",
    ],
    [
      "a length that isn't a number",
      { ...storedArray, length: "2" },
      "at length",
    ],
    [
      "no storage key",
      { ...storedArray, storageKey: undefined },
      "at storageKey",
    ],
    [
      "a concatenation whose length isn't its parts' total",
      { ...concat, length: 4 },
      "at length: Expected the total of its parts' lengths, 3",
    ],
    [
      "a concatenation with a part of a negative length",
      {
        ...concat,
        parts: [storedArray, { ...otherArray, length: -1 }],
        length: 1,
      },
      "at parts[1].length",
    ],
  ])(
    "rejects a reference with %s, before making any items",
    (_, ref, problem) => {
      expect(() =>
        getStoredItemRefs(
          ref as ArrayStoredPayloadRef<"PersistedEntityMetadata">,
        ),
      ).toThrow(`Invalid reference to a stored array ${problem}`);
    },
  );

  it("checks a stored array given as an array payload's value", () => {
    expect(() => getArrayPayloadItems({ ...storedArray, length: -1 })).toThrow(
      "Invalid reference to a stored array at length",
    );
  });
});
