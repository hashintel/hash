import { describe, expect, test } from "vitest";

import { isCase, splitWords, toCase } from "./casing.js";

import type { Casing } from "./casing.js";

describe("casing", () => {
  test("split_words_boundaries", () => {
    expect.hasAssertions();

    expect(splitWords("XMLHttpRequest")).toStrictEqual([
      "XML",
      "Http",
      "Request",
    ]);
    expect(splitWords("base64Encode")).toStrictEqual(["base64", "Encode"]);
    expect(splitWords("foo_bar-baz qux")).toStrictEqual([
      "foo",
      "bar",
      "baz",
      "qux",
    ]);
    expect(splitWords("HTML5Parser")).toStrictEqual(["HTML5", "Parser"]);
  });

  test.each<[string, Casing, string]>([
    ["foo_bar", "camelCase", "fooBar"],
    ["XMLHttpRequest", "strictCamelCase", "xmlHttpRequest"],
    ["fooBar", "PascalCase", "FooBar"],
    ["fooBar", "snake_case", "foo_bar"],
    ["fooBar", "UPPER_CASE", "FOO_BAR"],
    ["__foo_bar$", "camelCase", "__fooBar$"],
    ["_", "camelCase", "_"],
  ])("to_case_%s_%s_%s", (input, format, expected) => {
    expect.hasAssertions();
    expect(toCase(input, format)).toBe(expected);
  });

  test.each<[string, Casing, boolean]>([
    ["userID", "camelCase", true],
    ["userID", "strictCamelCase", false],
    ["HTTPServer", "PascalCase", true],
    ["HTTPServer", "StrictPascalCase", false],
    ["V8ENGINE", "UPPER_CASE", true],
    ["foo__bar", "snake_case", false],
    ["foo_bar", "camelCase", false],
    ["_private", "camelCase", true],
  ])("is_case_%s_%s_%s", (input, format, expected) => {
    expect.hasAssertions();

    expect(isCase(input, format)).toBe(expected);
  });
});
