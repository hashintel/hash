import stringify from "json-stable-stringify";
import { beforeAll, describe, expect, test } from "vitest";

import type { BaseUrl, VersionedUrl } from "../src/main";
import {
  extractBaseUrl,
  extractVersion,
  validateBaseUrl,
  validateVersionedUrl,
} from "../src/main";
import { initialize } from "./shared";

const invalidBaseUrlCases: string[] = [
  "http://example.com",
  "\\example\\..\\demo/.\\/",
  "https://ex ample.org/",
  "example/",
  "https://example.com:demo/",
  "http://[www.example.com]/",

  /** @todo - This was a regression when moving to a JS implementation. */
  // ["data:text/plain,Hello?World#/", { reason: "CannotBeABase" }],
];

describe("validateBaseUrl", () => {
  test.each([
    ["http://example.com/"],
    ["file://localhost/documents/myfolder/"],
    ["ftp://rms@example.com/"],
    ["https://////example.com///"],
    ["file://loc%61lhost/"],
  ])("`parseBaseUrl(%s)` succeeds", (input) => {
    expect(validateBaseUrl(input)).toEqual({ type: "Ok", inner: input });
  });

  test.each(invalidBaseUrlCases)("`parseBaseUrl(%s)` errors", (input) => {
    expect(validateBaseUrl(input)).toMatchSnapshot();
  });
});

const invalidVersionedUrlCases: string[] = [
  "example/v/2",
  "http://example.com",
  "http://example.com/v/",
  "http://example.com/v/0.2",
  "http://example.com/v//20",
  "http://example.com/v/30/1",
  "http://example.com/v/foo",
  `http://exampl${"e".repeat(2028)}.com/v/1`,
];

describe("validateVersionedUrl", () => {
  test.each([
    ["http://example.com/v/0"],
    ["http://example.com/v/1"],
    ["http://example.com/v/20"],
    [`http://exampl${"e".repeat(2027)}.com/v/1`],
  ])("`validateVersionedUrl(%s)` succeeds", (input) => {
    expect(validateVersionedUrl(input)).toEqual({ type: "Ok", inner: input });
  });

  test.each(invalidVersionedUrlCases)(
    "validateVersionedUrl(%s) returns errors",
    (input) => {
      expect(validateVersionedUrl(input)).toMatchSnapshot();
    },
  );
});

const extractBaseUrlCases: [VersionedUrl, BaseUrl][] = [
  ["http://example.com/v/0", "http://example.com/"],
  ["http://example.com/sandwich/v/1", "http://example.com/sandwich/"],
  [
    "file://localhost/documents/myfolder/v/10",
    "file://localhost/documents/myfolder/",
  ],
  ["ftp://rms@example.com/foo/v/5", "ftp://rms@example.com/foo/"],
];

describe("extractBaseUrl", () => {
  test.each(extractBaseUrlCases)(
    "`extractBaseUrl(%s)` succeeds",
    (input, expected) => {
      expect(extractBaseUrl(input)).toEqual(expected);
    },
  );
});

const extractVersionCases: [VersionedUrl, number][] = [
  ["http://example.com/v/0", 0],
  ["http://example.com/sandwich/v/1", 1],
  ["file://localhost/documents/myfolder/v/10", 10],
  ["ftp://rms@example.com/foo/v/5", 5],
];

beforeAll(async () => {
  await initialize();
});

describe("extractVersion", () => {
  test.each(extractVersionCases)(
    "`extractVersion(%s)` succeeds",
    (input, expected) => {
      expect(extractVersion(input)).toEqual(expected);
    },
  );
});
