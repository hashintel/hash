import {
  BaseUrl,
  extractBaseUrl,
  extractVersion,
  ParseBaseUrlError,
  ParseVersionedUrlError,
  TypeSystemInitializer,
  validateBaseUrl,
  validateVersionedUrl,
  VersionedUrl,
} from "@blockprotocol/type-system";

const invalidBaseUrlCases: [string, ParseBaseUrlError][] = [
  ["http://example.com", { reason: "MissingTrailingSlash" }],
  [
    "\\example\\..\\demo/.\\/",
    {
      reason: "UrlParseError",
      inner:
        '{"input":"\\\\example\\\\..\\\\demo/.\\\\/","code":"ERR_INVALID_URL"}',
    },
  ],
  [
    "https://ex ample.org/",
    {
      reason: "UrlParseError",
      inner: '{"input":"https://ex ample.org/","code":"ERR_INVALID_URL"}',
    },
  ],
  [
    "example/",
    {
      reason: "UrlParseError",
      inner: '{"input":"example/","code":"ERR_INVALID_URL"}',
    },
  ],
  [
    "https://example.com:demo/",
    {
      reason: "UrlParseError",
      inner: '{"input":"https://example.com:demo/","code":"ERR_INVALID_URL"}',
    },
  ],
  [
    "http://[www.example.com]/",
    {
      reason: "UrlParseError",
      inner: '{"input":"http://[www.example.com]/","code":"ERR_INVALID_URL"}',
    },
  ],
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

  test.each(invalidBaseUrlCases)(
    "`parseBaseUrl(%s)` errors",
    (input, expected) => {
      expect(validateBaseUrl(input)).toEqual({ type: "Err", inner: expected });
    },
  );
});

const invalidVersionedUrlCases: [string, ParseVersionedUrlError][] = [
  [
    "example/v/2",
    {
      reason: "InvalidBaseUrl",
      inner: {
        reason: "UrlParseError",
        inner: '{"input":"example/","code":"ERR_INVALID_URL"}',
      },
    },
  ],
  ["http://example.com", { reason: "IncorrectFormatting" }],
  ["http://example.com/v/", { reason: "MissingVersion" }],
  ["http://example.com/v/0.2", { reason: "AdditionalEndContent", inner: ".2" }],
  [
    "http://example.com/v//20",
    {
      reason: "InvalidVersion",
      inner: ["/20", "invalid digit found in string"],
    },
  ],
  [
    "http://example.com/v/30/1",
    { reason: "AdditionalEndContent", inner: "/1" },
  ],
  [
    "http://example.com/v/foo",
    {
      reason: "InvalidVersion",
      inner: ["foo", "invalid digit found in string"],
    },
  ],
  [`http://exampl${"e".repeat(2028)}.com/v/1`, { reason: "TooLong" }],
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
    (input, expected) => {
      expect(validateVersionedUrl(input)).toEqual({
        type: "Err",
        inner: expected,
      });
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
  await TypeSystemInitializer.initialize();
});

describe("extractVersion", () => {
  test.each(extractVersionCases)(
    "`extractVersion(%s)` succeeds",
    (input, expected) => {
      expect(extractVersion(input)).toEqual(expected);
    },
  );
});
