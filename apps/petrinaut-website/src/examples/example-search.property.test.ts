import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import {
  canonicalSearchString,
  sharedSearchesMatch,
  validateSharedExampleSearch,
} from "./example-search";

const knownKeys = ["scenario", "subnet", "itemType", "itemId"] as const;

const plausibleValues = fc.constantFrom<unknown>(
  "none",
  "scenario-1",
  "subnet-1",
  "place",
  "transition",
  "not-a-type",
  "",
);

const paramValue = fc.oneof(
  plausibleValues,
  fc.string({ maxLength: 12 }),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.array(
    fc.oneof(plausibleValues, fc.string({ maxLength: 12 }), fc.integer()),
    { maxLength: 4 },
  ),
);

/**
 * Arbitrary decoded-search objects as TanStack Router hands them to
 * `validateSearch`: known and unknown keys, values of any JSON-ish shape.
 */
const searchInput = fc.dictionary(
  fc.oneof(
    fc.constantFrom<string>(...knownKeys),
    fc.string({ minLength: 1, maxLength: 8 }),
  ),
  paramValue,
  { maxKeys: 8 },
);

describe("example search contract laws", () => {
  test.prop([searchInput])("decoding never throws", (input) => {
    expect(() => validateSharedExampleSearch(input)).not.toThrow();
  });

  test.prop([searchInput])(
    "validation is idempotent, so the embed entry redirect terminates",
    (input) => {
      const once = validateSharedExampleSearch(input);
      const twice = validateSharedExampleSearch(once);
      expect(twice).toEqual(once);
      expect(sharedSearchesMatch(once, twice)).toBe(true);
    },
  );

  test.prop([searchInput])(
    "the canonical string is the same location, and re-decodes to itself",
    (input) => {
      const search = validateSharedExampleSearch(input);
      const decoded = validateSharedExampleSearch(
        Object.fromEntries(new URLSearchParams(canonicalSearchString(search))),
      );
      expect(sharedSearchesMatch(decoded, search)).toBe(true);
    },
  );
});
