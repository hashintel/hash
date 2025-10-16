import { describe, expect, test } from "vitest";

import type {
  BaseUrl,
  OntologyTypeVersion,
  VersionedUrl,
} from "../src/main.js";
import {
  compareOntologyTypeVersions,
  extractBaseUrl,
  extractVersion,
  validateBaseUrl,
  validateVersionedUrl,
} from "../src/main.js";

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
  ["http://example.com/v/0" as VersionedUrl, "http://example.com/" as BaseUrl],
  [
    "http://example.com/sandwich/v/1" as VersionedUrl,
    "http://example.com/sandwich/" as BaseUrl,
  ],
  [
    "file://localhost/documents/myfolder/v/10" as VersionedUrl,
    "file://localhost/documents/myfolder/" as BaseUrl,
  ],
  [
    "ftp://rms@example.com/foo/v/5" as VersionedUrl,
    "ftp://rms@example.com/foo/" as BaseUrl,
  ],
];

describe("extractBaseUrl", () => {
  test.each(extractBaseUrlCases)(
    "`extractBaseUrl(%s)` succeeds",
    (input, expected) => {
      expect(extractBaseUrl(input)).toEqual(expected);
    },
  );
});

const extractVersionCases: [VersionedUrl, string][] = [
  ["http://example.com/v/0" as VersionedUrl, "0"],
  ["http://example.com/sandwich/v/1" as VersionedUrl, "1"],
  ["file://localhost/documents/myfolder/v/10" as VersionedUrl, "10"],
  ["ftp://rms@example.com/foo/v/5" as VersionedUrl, "5"],
];

describe("extractVersion", () => {
  test.each(extractVersionCases)(
    "`extractVersion(%s)` succeeds",
    (input, expected) => {
      expect(extractVersion(input)).toEqual(expected);
    },
  );
});

describe("Draft version support", () => {
  describe("validateVersionedUrl with drafts", () => {
    test.each([
      ["http://example.com/v/1-draft.abc12345.1"],
      ["http://example.com/v/2-draft.xyz98765.999"],
      ["http://example.com/person/v/5-draft.lane1234.42"],
    ])("validateVersionedUrl(%s) with draft succeeds", (input) => {
      expect(validateVersionedUrl(input)).toEqual({ type: "Ok", inner: input });
    });

    test.each([
      "http://example.com/v/1-draft", // Missing lane and revision
      "http://example.com/v/1-draft.", // Missing lane and revision
      "http://example.com/v/1-draft.lane", // Missing revision
      "http://example.com/v/1-draft.lane.", // Missing revision number
      "http://example.com/v/1-draft.lane.abc", // Invalid revision (not a number)
    ])("validateVersionedUrl(%s) with invalid draft fails", (input) => {
      const result = validateVersionedUrl(input);
      expect(result.type).toBe("Err");
    });
  });

  describe("extractVersion with drafts", () => {
    test.each([
      [
        "http://example.com/v/1-draft.abc12345.1" as VersionedUrl,
        "1-draft.abc12345.1",
      ],
      [
        "http://example.com/v/2-draft.xyz98765.999" as VersionedUrl,
        "2-draft.xyz98765.999",
      ],
    ])("extractVersion(%s) returns draft version", (input, expected) => {
      expect(extractVersion(input).toString()).toEqual(expected);
    });
  });

  describe("compareOntologyTypeVersions with SemVer", () => {
    test("compares major versions correctly", () => {
      expect(
        compareOntologyTypeVersions(
          "1" as OntologyTypeVersion,
          "2" as OntologyTypeVersion,
        ),
      ).toBe(-1);

      expect(
        compareOntologyTypeVersions(
          "3" as OntologyTypeVersion,
          "2" as OntologyTypeVersion,
        ),
      ).toBe(1);

      expect(
        compareOntologyTypeVersions(
          "2" as OntologyTypeVersion,
          "2" as OntologyTypeVersion,
        ),
      ).toBe(0);
    });

    test("published > draft (same major)", () => {
      expect(
        compareOntologyTypeVersions(
          "2" as OntologyTypeVersion,
          "2-draft.abc12345.1" as OntologyTypeVersion,
        ),
      ).toBe(1);

      expect(
        compareOntologyTypeVersions(
          "2-draft.abc12345.1" as OntologyTypeVersion,
          "2" as OntologyTypeVersion,
        ),
      ).toBe(-1);
    });

    test("compares draft versions by lane and revision", () => {
      // Same lane, different revision
      expect(
        compareOntologyTypeVersions(
          "2-draft.abc12345.1" as OntologyTypeVersion,
          "2-draft.abc12345.2" as OntologyTypeVersion,
        ),
      ).toBe(-1);

      expect(
        compareOntologyTypeVersions(
          "2-draft.abc12345.5" as OntologyTypeVersion,
          "2-draft.abc12345.3" as OntologyTypeVersion,
        ),
      ).toBe(1);

      // Different lanes (lexicographic)
      expect(
        compareOntologyTypeVersions(
          "2-draft.aaaa1111.1" as OntologyTypeVersion,
          "2-draft.bbbb2222.1" as OntologyTypeVersion,
        ),
      ).toBe(-1);

      expect(
        compareOntologyTypeVersions(
          "2-draft.xyz98765.1" as OntologyTypeVersion,
          "2-draft.abc12345.1" as OntologyTypeVersion,
        ),
      ).toBe(1);
    });

    test("major version takes precedence over draft status", () => {
      expect(
        compareOntologyTypeVersions(
          "1" as OntologyTypeVersion,
          "2-draft.abc12345.1" as OntologyTypeVersion,
        ),
      ).toBe(-1);

      expect(
        compareOntologyTypeVersions(
          "3-draft.abc12345.1" as OntologyTypeVersion,
          "2" as OntologyTypeVersion,
        ),
      ).toBe(1);
    });
  });

  describe("compareOntologyTypeVersions - SemVer Pre-Release Rules", () => {
    test("Rule 1: Numeric identifiers are compared numerically", () => {
      // SemVer: numeric lanes are compared numerically
      expect(
        compareOntologyTypeVersions(
          "1-draft.2.1" as OntologyTypeVersion,
          "1-draft.10.1" as OntologyTypeVersion,
        ),
      ).toBe(-1); // SemVer: 2 < 10

      expect(
        compareOntologyTypeVersions(
          "1-draft.100.1" as OntologyTypeVersion,
          "1-draft.20.1" as OntologyTypeVersion,
        ),
      ).toBe(1); // SemVer: 100 > 20
    });

    test("Rule 2: Alphanumeric identifiers are compared lexically", () => {
      expect(
        compareOntologyTypeVersions(
          "1-draft.alpha.1" as OntologyTypeVersion,
          "1-draft.beta.1" as OntologyTypeVersion,
        ),
      ).toBe(-1); // "alpha" < "beta"

      expect(
        compareOntologyTypeVersions(
          "1-draft.rc1.1" as OntologyTypeVersion,
          "1-draft.rc2.1" as OntologyTypeVersion,
        ),
      ).toBe(-1); // "rc1" < "rc2"
    });

    test("Rule 3: Numeric identifiers have lower precedence than non-numeric", () => {
      // SemVer: purely numeric < mixed alphanumeric
      expect(
        compareOntologyTypeVersions(
          "1-draft.999.1" as OntologyTypeVersion,
          "1-draft.123abc.1" as OntologyTypeVersion,
        ),
      ).toBe(-1); // 999 < "123abc"
    });

    test("Rule 4: Revision comparison (analogous to larger set of fields)", () => {
      // Within the same lane, higher revision wins
      expect(
        compareOntologyTypeVersions(
          "1-draft.same-lane.1" as OntologyTypeVersion,
          "1-draft.same-lane.2" as OntologyTypeVersion,
        ),
      ).toBe(-1); // revision 1 < revision 2

      expect(
        compareOntologyTypeVersions(
          "1-draft.same-lane.10" as OntologyTypeVersion,
          "1-draft.same-lane.5" as OntologyTypeVersion,
        ),
      ).toBe(1); // revision 10 > revision 5 (numeric comparison)
    });

    test("Complex lane comparison scenarios", () => {
      // Mixed alphanumeric lanes
      expect(
        compareOntologyTypeVersions(
          "1-draft.user-123.1" as OntologyTypeVersion,
          "1-draft.user-456.1" as OntologyTypeVersion,
        ),
      ).toBe(-1); // "user-123" < "user-456"

      // UUID-like lanes (lexicographic)
      expect(
        compareOntologyTypeVersions(
          "1-draft.a1b2c3d4.1" as OntologyTypeVersion,
          "1-draft.z9y8x7w6.1" as OntologyTypeVersion,
        ),
      ).toBe(-1); // "a..." < "z..."
    });

    test("Invalid pre-release identifiers are rejected", () => {
      // According to SemVer, identifiers should only contain [0-9A-Za-z-]
      // The parser should reject special characters and non-ASCII characters

      // Special characters in lane - rejected
      const result1 = validateVersionedUrl(
        "https://example.com/type/v/1-draft.abc,def.123",
      );
      expect(result1.type).toBe("Err");

      // Unicode characters - rejected
      const result2 = validateVersionedUrl(
        "https://example.com/type/v/2-draft.lane🚀test.5",
      );
      expect(result2.type).toBe("Err");

      // Empty lane - rejected (this fails the regex match itself)
      const result3 = validateVersionedUrl(
        "https://example.com/type/v/3-draft..1",
      );
      expect(result3.type).toBe("Err");

      // Spaces - rejected
      const result4 = validateVersionedUrl(
        "https://example.com/type/v/4-draft.lane 123.1",
      );
      expect(result4.type).toBe("Err");
    });
  });
});
