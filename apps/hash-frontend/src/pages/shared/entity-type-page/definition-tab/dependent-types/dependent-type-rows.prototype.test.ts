import { describe, expect, it } from "vitest";

import {
  getDependentTypeRows,
  getParentVersionRows,
} from "./dependent-type-rows";
import {
  allVersionsResult,
  companyBaseUrl,
  companyLatestVersion,
  latestVersionsResult,
} from "./prototype-ontology.fixture";

import type { DependentTypeRow } from "./dependent-type-rows";

const result = getDependentTypeRows({
  parentBaseUrl: companyBaseUrl,
  allVersions: allVersionsResult,
  latestVersions: latestVersionsResult,
});

/** A type ID without the fixture's common prefix, such as `charity/v/3`. */
const shortId = (entityTypeId: string) =>
  entityTypeId.replace("https://example.com/@acme/types/entity-type/", "");

const rowTitled = (title: string) => {
  const row = result.rows.find(
    (candidate) => candidate.entityType.schema.title === title,
  );
  if (!row) {
    throw new Error(`No row has the title "${title}"`);
  }
  return row;
};

/** A row as its title, what it opens, and its ranges, written as `v<first>–v<last> → v<parent>`. */
const summarize = (row: DependentTypeRow) => ({
  title: row.entityType.schema.title,
  former: row.former,
  opens: shortId(row.entityType.schema.$id),
  ranges: row.ranges.map(
    ({ firstVersion, lastVersion, parentVersion }) =>
      `v${firstVersion}–v${lastVersion} → v${parentVersion}`,
  ),
});

describe("getDependentTypeRows on the prototype's ontology", () => {
  it("lists every type whose own versions extend Company, sorted by title with Form 8-K before Form 10-K", () => {
    expect(result.rows.map((row) => row.entityType.schema.title)).toEqual([
      "Charity",
      "Form 8-K Issuer",
      "Form 10-K Issuer",
      "Holding Company",
      "Partnership",
      "Public Company",
      "Shell Company",
      "Sole Trader",
      "Subsidiary",
    ]);
    expect(result.incomplete).toBe(false);
  });

  it("gives each type its ranges and opens a current type at its latest version, a former one at its highest version that extends Company", () => {
    expect(result.rows.map(summarize)).toEqual([
      {
        title: "Charity",
        former: false,
        opens: "charity/v/3",
        ranges: ["v1–v1 → v1", "v2–v2 → v2", "v3–v3 → v3"],
      },
      {
        title: "Form 8-K Issuer",
        former: false,
        opens: "form-8k/v/3",
        ranges: ["v2–v3 → v3"],
      },
      {
        title: "Form 10-K Issuer",
        former: false,
        opens: "form-10k/v/4",
        ranges: ["v1–v4 → v1"],
      },
      {
        title: "Holding Company",
        former: true,
        opens: "holding-company/v/1",
        ranges: ["v1–v1 → v1"],
      },
      {
        title: "Partnership",
        former: false,
        opens: "partnership/v/3",
        ranges: ["v1–v1 → v2", "v3–v3 → v2"],
      },
      {
        title: "Public Company",
        former: false,
        opens: "public-company/v/6",
        ranges: ["v1–v3 → v1", "v3–v5 → v2", "v6–v6 → v1"],
      },
      {
        title: "Shell Company",
        former: true,
        opens: "shell-company/v/2",
        ranges: ["v1–v2 → v1"],
      },
      {
        title: "Sole Trader",
        former: false,
        opens: "sole-trader/v/4",
        ranges: ["v1–v2 → v2", "v4–v4 → v3"],
      },
      {
        title: "Subsidiary",
        former: false,
        opens: "subsidiary/v/26",
        ranges: ["v1–v8 → v1", "v9–v17 → v2", "v18–v26 → v3"],
      },
    ]);
  });

  it("moves Charity to each new Company version", () => {
    expect(rowTitled("Charity")).toMatchObject({
      firstVersion: 1,
      lastVersion: 3,
      parentVersions: [1, 2, 3],
      versions: [
        { version: 1, parentVersions: [1] },
        { version: 2, parentVersions: [2] },
        { version: 3, parentVersions: [3] },
      ],
    });
  });

  it("starts Form 8-K Issuer at v2, where it gains Company", () => {
    expect(rowTitled("Form 8-K Issuer")).toMatchObject({
      firstVersion: 2,
      lastVersion: 3,
      parentVersions: [3],
    });
  });

  it("lists Form 10-K Issuer, which still extends Company v1, as current", () => {
    expect(rowTitled("Form 10-K Issuer")).toMatchObject({
      former: false,
      firstVersion: 1,
      lastVersion: 4,
      parentVersions: [1],
    });
  });

  it("splits Partnership's range at its archived v2", () => {
    expect(rowTitled("Partnership").versions).toEqual([
      { version: 1, parentVersions: [2] },
      { version: 3, parentVersions: [2] },
    ]);
  });

  it("puts Public Company v3 under two Company versions and v6 back under v1", () => {
    expect(rowTitled("Public Company")).toMatchObject({
      firstVersion: 1,
      lastVersion: 6,
      parentVersions: [1, 2],
      versions: [
        { version: 1, parentVersions: [1] },
        { version: 2, parentVersions: [1] },
        { version: 3, parentVersions: [1, 2] },
        { version: 4, parentVersions: [2] },
        { version: 5, parentVersions: [2] },
        { version: 6, parentVersions: [1] },
      ],
    });
  });

  it("splits Sole Trader's range at v3, which extends nothing", () => {
    expect(rowTitled("Sole Trader")).toMatchObject({
      firstVersion: 1,
      lastVersion: 4,
      parentVersions: [2, 3],
      versions: [
        { version: 1, parentVersions: [2] },
        { version: 2, parentVersions: [2] },
        { version: 4, parentVersions: [3] },
      ],
    });
  });

  it("marks Shell Company, whose latest version v3 extends nothing, as former", () => {
    expect(rowTitled("Shell Company")).toMatchObject({
      former: true,
      firstVersion: 1,
      lastVersion: 2,
      parentVersions: [1],
    });
  });

  it("marks Holding Company, whose latest version v2 is archived, as former", () => {
    expect(rowTitled("Holding Company")).toMatchObject({
      former: true,
      firstVersion: 1,
      lastVersion: 1,
      parentVersions: [1],
    });
  });

  it("leaves out UK Public Company, which extends Company only through Public Company", () => {
    expect(
      result.rows.filter(
        (row) => row.entityType.schema.title === "UK Public Company",
      ),
    ).toEqual([]);
  });

  it("gives Subsidiary's 26 versions three ranges, one per Company version, each opening at its highest version", () => {
    const subsidiary = rowTitled("Subsidiary");

    expect(subsidiary).toMatchObject({
      firstVersion: 1,
      lastVersion: 26,
      parentVersions: [1, 2, 3],
    });
    expect(subsidiary.versions).toHaveLength(26);
    expect(
      subsidiary.ranges.map((range) => shortId(range.lastVersionId)),
    ).toEqual(["subsidiary/v/8", "subsidiary/v/17", "subsidiary/v/26"]);
  });
});

/** Each Company version as its types, written as `<title> <ranges> opens <highest version>`. */
const summarizeParentVersions = (rows: DependentTypeRow[]) =>
  getParentVersionRows({ rows, parentLatestVersion: companyLatestVersion }).map(
    ({ parentVersion, types }) => ({
      parentVersion,
      types: types.map(
        ({ row, ranges, highestVersionId }) =>
          `${row.entityType.schema.title}${row.former ? " (former)" : ""} ${ranges
            .map((range) => `v${range.firstVersion}–v${range.lastVersion}`)
            .join(", ")} opens ${shortId(highestVersionId)}`,
      ),
    }),
  );

describe("getParentVersionRows on the prototype's ontology", () => {
  it("lists each Company version, newest first, with the types that extend it and their ranges", () => {
    expect(summarizeParentVersions(result.rows)).toEqual([
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
          "Holding Company (former) v1–v1 opens holding-company/v/1",
          "Public Company v1–v3, v6–v6 opens public-company/v/6",
          "Shell Company (former) v1–v2 opens shell-company/v/2",
          "Subsidiary v1–v8 opens subsidiary/v/8",
        ],
      },
    ]);
  });

  it("leaves Holding Company and Shell Company out of Company v1 when given only the current types", () => {
    expect(
      summarizeParentVersions(result.rows.filter((row) => !row.former)).find(
        ({ parentVersion }) => parentVersion === 1,
      ),
    ).toEqual({
      parentVersion: 1,
      types: [
        "Charity v1–v1 opens charity/v/1",
        "Form 10-K Issuer v1–v4 opens form-10k/v/4",
        "Public Company v1–v3, v6–v6 opens public-company/v/6",
        "Subsidiary v1–v8 opens subsidiary/v/8",
      ],
    });
  });
});
