import { describe, expect, it } from "vitest";

import { ENTITY_TYPE_META_SCHEMA } from "@blockprotocol/type-system";

import { getDependentTypeRows } from "./dependent-type-rows";

import type {
  BaseUrl,
  EntityTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";

const typeBaseUrl = (slug: string) =>
  `https://example.com/@alice/types/entity-type/${slug}/` as BaseUrl;

const actorBaseUrl = typeBaseUrl("actor");

/** Version `version` of `slug`, whose `allOf` names the given versions of Actor. */
const makeVersion = (
  slug: string,
  title: string,
  version: number,
  actorVersions: number[],
): EntityTypeWithMetadata =>
  ({
    schema: {
      $schema: ENTITY_TYPE_META_SCHEMA,
      kind: "entityType",
      $id: `${typeBaseUrl(slug)}v/${version}` as VersionedUrl,
      title,
      description: `A ${title}`,
      type: "object",
      properties: {},
      allOf: actorVersions.map((actorVersion) => ({
        $ref: `${actorBaseUrl}v/${actorVersion}` as VersionedUrl,
      })),
    },
    metadata: {
      recordId: { baseUrl: typeBaseUrl(slug), version: `${version}` },
    },
  }) as unknown as EntityTypeWithMetadata;

const rowsFor = (
  allVersions: EntityTypeWithMetadata[],
  latestVersions: EntityTypeWithMetadata[],
) =>
  getDependentTypeRows({
    parentBaseUrl: actorBaseUrl,
    allVersions: { entityTypes: allVersions },
    latestVersions: { entityTypes: latestVersions },
  });

/** Each row as its title and its ranges, written as `v<first>–v<last> → v<parent>`. */
const summarize = (result: ReturnType<typeof getDependentTypeRows>) =>
  result.rows.map((row) => ({
    title: row.entityType.schema.title,
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

  it("leaves out a type whose latest version no longer extends the parent", () => {
    const formerV1 = makeVersion("former", "Former", 1, [1]);

    expect(summarize(rowsFor([formerV1], []))).toEqual([]);
  });

  it("leaves out a type that only the latest-version query returned", () => {
    const machine = makeVersion("machine", "Machine", 1, [1]);

    expect(summarize(rowsFor([], [machine]))).toEqual([]);
  });

  it("leaves out the parent itself", () => {
    const actorV2 = makeVersion("actor", "Actor", 2, [1]);
    const machine = makeVersion("machine", "Machine", 1, [1]);

    expect(summarize(rowsFor([actorV2, machine], [actorV2, machine]))).toEqual([
      { title: "Machine", ranges: ["v1–v1 → v1"] },
    ]);
  });

  it("counts a version returned twice once", () => {
    const machine = makeVersion("machine", "Machine", 1, [1]);

    expect(summarize(rowsFor([machine, machine], [machine, machine]))).toEqual([
      { title: "Machine", ranges: ["v1–v1 → v1"] },
    ]);
  });

  it("sorts types by title, with numbers in titles in numeric order", () => {
    const form10K = makeVersion("form-10-k", "Form 10-K", 1, [1]);
    const form8K = makeVersion("form-8-k", "Form 8-K", 1, [1]);
    const bank = makeVersion("bank", "Bank", 1, [1]);
    const versions = [form10K, form8K, bank];

    expect(
      rowsFor(versions, versions).rows.map(
        (row) => row.entityType.schema.title,
      ),
    ).toEqual(["Bank", "Form 8-K", "Form 10-K"]);
  });

  it("gives a row its version span and the parent versions it extends, and opens each range at its highest version", () => {
    const userVersions = [
      makeVersion("user", "User", 7, [2]),
      makeVersion("user", "User", 5, [2]),
      makeVersion("user", "User", 3, [1]),
      makeVersion("user", "User", 2, [1]),
    ];

    const [row] = rowsFor(userVersions, [userVersions[0]!]).rows;

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

  it("reports the rows as incomplete when either query stopped at its row limit", () => {
    const machine = makeVersion("machine", "Machine", 1, [1]);
    const cursor = machine.schema.$id;
    const rowsWithCursors = (
      allCursor?: VersionedUrl,
      latestCursor?: VersionedUrl,
    ) =>
      getDependentTypeRows({
        parentBaseUrl: actorBaseUrl,
        allVersions: { entityTypes: [machine], cursor: allCursor },
        latestVersions: { entityTypes: [machine], cursor: latestCursor },
      });

    expect(rowsWithCursors().incomplete).toBe(false);
    expect(rowsWithCursors(cursor).incomplete).toBe(true);
    expect(rowsWithCursors(undefined, cursor).incomplete).toBe(true);
    expect(summarize(rowsWithCursors(cursor, cursor))).toEqual([
      { title: "Machine", ranges: ["v1–v1 → v1"] },
    ]);
  });
});
