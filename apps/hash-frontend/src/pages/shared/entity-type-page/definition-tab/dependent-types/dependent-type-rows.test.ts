import { describe, expect, it } from "vitest";

import {
  actorBaseUrl,
  makeVersion,
  typeBaseUrl,
} from "./dependent-type-fixtures";
import {
  getDependentTypeRows,
  getParentVersionRows,
} from "./dependent-type-rows";
import { getDependentTypes } from "./get-dependent-types";

import type {
  BaseUrl,
  EntityTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";

const rowsFor = (
  allVersions: EntityTypeWithMetadata[],
  latestVersions: EntityTypeWithMetadata[],
  parentBaseUrl: BaseUrl = actorBaseUrl,
) =>
  getDependentTypeRows(
    getDependentTypes({
      parentBaseUrl,
      allVersions: { entityTypes: allVersions },
      latestVersions: { entityTypes: latestVersions },
    }),
  );

/** Each row as its title and its ranges, written as `v<first>–v<last> → v<parent>`. */
const summarize = (rows: ReturnType<typeof getDependentTypeRows>) =>
  rows.map((row) => ({
    title: `${row.entityType.schema.title}${row.former ? " (former)" : ""}`,
    ranges: row.ranges.map(
      ({ firstVersion, lastVersion, parentVersion }) =>
        `v${firstVersion}–v${lastVersion} → v${parentVersion}`,
    ),
  }));

describe("getDependentTypeRows", () => {
  it("lists a type whose latest version extends the parent, with the version it extends", () => {
    const machine = makeVersion("machine", "Machine", 1, [1]);

    expect(summarize(rowsFor([machine], [machine]))).toEqual([
      { title: "Machine", ranges: ["v1–v1 → v1"] },
    ]);
  });

  it("joins consecutive versions that extend the same parent version into one range", () => {
    const userVersions = [
      makeVersion("user", "User", 7, [2]),
      makeVersion("user", "User", 6, [2]),
      makeVersion("user", "User", 5, [2]),
      makeVersion("user", "User", 4, [2]),
      makeVersion("user", "User", 3, [1]),
      makeVersion("user", "User", 2, [1]),
    ];

    expect(summarize(rowsFor(userVersions, [userVersions[0]!]))).toEqual([
      { title: "User", ranges: ["v2–v3 → v1", "v4–v7 → v2"] },
    ]);
  });

  it("splits a range where a version is missing, such as an archived one", () => {
    const fileV3 = makeVersion("file", "File", 3, [1]);
    const fileV1 = makeVersion("file", "File", 1, [1]);

    expect(summarize(rowsFor([fileV3, fileV1], [fileV3]))).toEqual([
      { title: "File", ranges: ["v1–v1 → v1", "v3–v3 → v1"] },
    ]);
  });

  it("puts a version that extends two parent versions in a range for each", () => {
    const mixedVersions = [
      makeVersion("mixed", "Mixed", 3, [1]),
      makeVersion("mixed", "Mixed", 2, [1, 2]),
      makeVersion("mixed", "Mixed", 1, [1]),
    ];

    expect(summarize(rowsFor(mixedVersions, [mixedVersions[0]!]))).toEqual([
      { title: "Mixed", ranges: ["v1–v3 → v1", "v2–v2 → v2"] },
    ]);
  });

  it("sorts types by title, with numbers in titles in numeric order", () => {
    const form10K = makeVersion("form-10-k", "Form 10-K", 1, [1]);
    const form8K = makeVersion("form-8-k", "Form 8-K", 1, [1]);
    const bank = makeVersion("bank", "Bank", 1, [1]);
    const versions = [form10K, form8K, bank];

    expect(
      rowsFor(versions, versions).map((row) => row.entityType.schema.title),
    ).toEqual(["Bank", "Form 8-K", "Form 10-K"]);
  });

  it("gives a row its version span and the parent versions it extends, and opens each range at its highest version", () => {
    const userVersions = [
      makeVersion("user", "User", 7, [2]),
      makeVersion("user", "User", 5, [2]),
      makeVersion("user", "User", 3, [1]),
      makeVersion("user", "User", 2, [1]),
    ];

    const [row] = rowsFor(userVersions, [userVersions[0]!]);

    expect(row).toMatchObject({
      firstVersion: 2,
      lastVersion: 7,
      parentVersions: [1, 2],
    });
    expect(row?.ranges.map((range) => range.lastVersionId)).toEqual([
      `${typeBaseUrl("user")}v/3`,
      `${typeBaseUrl("user")}v/5`,
      `${typeBaseUrl("user")}v/7`,
    ]);
  });
});

describe("getParentVersionRows", () => {
  it("lists each parent version that a type extends, newest first, each with the types and ranges that extend it", () => {
    const userVersions = [
      makeVersion("user", "User", 4, [2]),
      makeVersion("user", "User", 3, [1, 2]),
      makeVersion("user", "User", 2, [1]),
    ];
    const machine = makeVersion("machine", "Machine", 1, [1]);
    const rows = rowsFor(
      [...userVersions, machine],
      [userVersions[0]!, machine],
    );

    expect(
      getParentVersionRows({ rows }).map(({ parentVersion, types }) => ({
        parentVersion,
        types: types.map(
          ({ row, ranges, highestVersionId }) =>
            `${row.entityType.schema.title} ${ranges
              .map((range) => `v${range.firstVersion}–v${range.lastVersion}`)
              .join(", ")} opens ${highestVersionId}`,
        ),
      })),
    ).toEqual([
      {
        parentVersion: 2,
        types: [`User v3–v4 opens ${typeBaseUrl("user")}v/4`],
      },
      {
        parentVersion: 1,
        types: [
          `Machine v1–v1 opens ${typeBaseUrl("machine")}v/1`,
          `User v2–v3 opens ${typeBaseUrl("user")}v/3`,
        ],
      },
    ]);
  });

  it("lists one row per parent version that a type extends, however high its number", () => {
    const machine = makeVersion("machine", "Machine", 1, [1, 4_000_000_000]);
    const rows = rowsFor([machine], [machine]);

    expect(
      getParentVersionRows({ rows }).map(({ parentVersion }) => parentVersion),
    ).toEqual([4_000_000_000, 1]);
  });
});

describe("on an example ontology of companies", () => {
  const companyBaseUrl = typeBaseUrl("company");

  /** Versions `first` to `last` of a type, each extending the given versions of Company. */
  const companyVersions = (
    slug: string,
    title: string,
    [first, last]: [number, number],
    extended: number[],
  ) =>
    Array.from({ length: last - first + 1 }, (_, index) =>
      makeVersion(slug, title, first + index, extended, companyBaseUrl),
    );

  /*
   * What the first query returns: every version that exists and extends
   * Company. Versions that extend nothing or are archived are missing.
   */
  const allVersions = [
    ...companyVersions("charity", "Charity", [1, 1], [1]),
    ...companyVersions("charity", "Charity", [2, 2], [2]),
    ...companyVersions("charity", "Charity", [3, 3], [3]),
    // v1 extends nothing.
    ...companyVersions("form-8k", "Form 8-K Issuer", [2, 3], [3]),
    ...companyVersions("form-10k", "Form 10-K Issuer", [1, 4], [1]),
    // v2, which extends Company v2, is archived.
    ...companyVersions("holding-company", "Holding Company", [1, 1], [1]),
    // v2 is archived.
    ...companyVersions("partnership", "Partnership", [1, 1], [2]),
    ...companyVersions("partnership", "Partnership", [3, 3], [2]),
    ...companyVersions("public-company", "Public Company", [1, 2], [1]),
    ...companyVersions("public-company", "Public Company", [3, 3], [1, 2]),
    ...companyVersions("public-company", "Public Company", [4, 5], [2]),
    ...companyVersions("public-company", "Public Company", [6, 6], [1]),
    // v3 extends nothing.
    ...companyVersions("shell-company", "Shell Company", [1, 2], [1]),
    // v3 extends nothing.
    ...companyVersions("sole-trader", "Sole Trader", [1, 2], [2]),
    ...companyVersions("sole-trader", "Sole Trader", [4, 4], [3]),
    ...companyVersions("subsidiary", "Subsidiary", [1, 8], [1]),
    ...companyVersions("subsidiary", "Subsidiary", [9, 17], [2]),
    ...companyVersions("subsidiary", "Subsidiary", [18, 26], [3]),
  ];

  /*
   * What the second query returns: each type's latest version, when it
   * extends Company. Shell Company's latest version extends nothing, and
   * Holding Company's is archived.
   */
  const latestVersions = [
    "charity/v/3",
    "form-8k/v/3",
    "form-10k/v/4",
    "partnership/v/3",
    "public-company/v/6",
    "sole-trader/v/4",
    "subsidiary/v/26",
  ].map((id) =>
    allVersions.find(({ schema }) => schema.$id.endsWith(`/${id}`))!,
  );

  const rows = rowsFor(allVersions, latestVersions, companyBaseUrl);

  /** A type ID without the common prefix, such as `charity/v/3`. */
  const shortId = (entityTypeId: VersionedUrl) =>
    entityTypeId.split("/entity-type/")[1];

  it("gives each type its ranges, and opens a current type at its latest version and a former one at its highest version that extends Company", () => {
    expect(
      rows.map((row) => ({
        title: `${row.entityType.schema.title}${row.former ? " (former)" : ""}`,
        opens: shortId(row.entityType.schema.$id),
        ranges: row.ranges.map(
          ({ firstVersion, lastVersion, parentVersion }) =>
            `v${firstVersion}–v${lastVersion} → v${parentVersion}`,
        ),
      })),
    ).toEqual([
      {
        title: "Charity",
        opens: "charity/v/3",
        ranges: ["v1–v1 → v1", "v2–v2 → v2", "v3–v3 → v3"],
      },
      {
        title: "Form 8-K Issuer",
        opens: "form-8k/v/3",
        ranges: ["v2–v3 → v3"],
      },
      {
        title: "Form 10-K Issuer",
        opens: "form-10k/v/4",
        ranges: ["v1–v4 → v1"],
      },
      {
        title: "Holding Company (former)",
        opens: "holding-company/v/1",
        ranges: ["v1–v1 → v1"],
      },
      {
        title: "Partnership",
        opens: "partnership/v/3",
        ranges: ["v1–v1 → v2", "v3–v3 → v2"],
      },
      {
        title: "Public Company",
        opens: "public-company/v/6",
        ranges: ["v1–v3 → v1", "v3–v5 → v2", "v6–v6 → v1"],
      },
      {
        title: "Shell Company (former)",
        opens: "shell-company/v/2",
        ranges: ["v1–v2 → v1"],
      },
      {
        title: "Sole Trader",
        opens: "sole-trader/v/4",
        ranges: ["v1–v2 → v2", "v4–v4 → v3"],
      },
      {
        title: "Subsidiary",
        opens: "subsidiary/v/26",
        ranges: ["v1–v8 → v1", "v9–v17 → v2", "v18–v26 → v3"],
      },
    ]);
  });

  it("lists each Company version, newest first, with the types that extend it and their ranges", () => {
    expect(
      getParentVersionRows({ rows }).map(({ parentVersion, types }) => ({
        parentVersion,
        types: types.map(
          ({ row, ranges, highestVersionId }) =>
            `${row.entityType.schema.title} ${ranges
              .map((range) => `v${range.firstVersion}–v${range.lastVersion}`)
              .join(", ")} opens ${shortId(highestVersionId)}`,
        ),
      })),
    ).toEqual([
      {
        parentVersion: 3,
        types: [
          "Charity v3–v3 opens charity/v/3",
          "Form 8-K Issuer v2–v3 opens form-8k/v/3",
          "Sole Trader v4–v4 opens sole-trader/v/4",
          "Subsidiary v18–v26 opens subsidiary/v/26",
        ],
      },
      {
        parentVersion: 2,
        types: [
          "Charity v2–v2 opens charity/v/2",
          "Partnership v1–v1, v3–v3 opens partnership/v/3",
          "Public Company v3–v5 opens public-company/v/5",
          "Sole Trader v1–v2 opens sole-trader/v/2",
          "Subsidiary v9–v17 opens subsidiary/v/17",
        ],
      },
      {
        parentVersion: 1,
        types: [
          "Charity v1–v1 opens charity/v/1",
          "Form 10-K Issuer v1–v4 opens form-10k/v/4",
          "Holding Company v1–v1 opens holding-company/v/1",
          "Public Company v1–v3, v6–v6 opens public-company/v/6",
          "Shell Company v1–v2 opens shell-company/v/2",
          "Subsidiary v1–v8 opens subsidiary/v/8",
        ],
      },
    ]);
  });
});
