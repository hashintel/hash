import { describe, expect, it } from "vitest";

import { actorBaseUrl, makeVersion } from "./dependent-type-fixtures";
import { getDependentTypes } from "./get-dependent-types";

import type {
  DependentTypes,
  DependentTypeVersion,
} from "./get-dependent-types";
import type {
  EntityTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";

const dependentTypesFor = (
  allVersions: EntityTypeWithMetadata[],
  latestVersions: EntityTypeWithMetadata[],
  cursors: { all?: VersionedUrl; latest?: VersionedUrl } = {},
) =>
  getDependentTypes({
    parentBaseUrl: actorBaseUrl,
    allVersions: { entityTypes: allVersions, cursor: cursors.all },
    latestVersions: { entityTypes: latestVersions, cursor: cursors.latest },
  });

const versionNumbers = (versions: DependentTypeVersion[]) =>
  versions
    .map((typeVersion) => typeVersion.version)
    .toSorted((left, right) => left - right);

/** Each type as its title, the version it opens at, and its versions that extend each parent version. */
const summarizeByType = ({ byType }: DependentTypes) =>
  [...byType.values()].map(
    ({ entityType, version, former, versionsByParentVersion }) => ({
      title: `${entityType.schema.title}${former ? " (former)" : ""}`,
      version,
      versionsByParentVersion: Object.fromEntries(
        [...versionsByParentVersion].map(([parentVersion, versions]) => [
          parentVersion,
          versionNumbers(versions),
        ]),
      ),
    }),
  );

describe("getDependentTypes", () => {
  it("groups each version that extends the parent under its type and the parent version it extends", () => {
    const userVersions = [
      makeVersion("user", "User", 3, [1, 2]),
      makeVersion("user", "User", 2, [1]),
      makeVersion("user", "User", 1, [1]),
    ];
    const machine = makeVersion("machine", "Machine", 1, [2]);

    const dependentTypes = dependentTypesFor(
      [...userVersions, machine],
      [userVersions[0]!, machine],
    );

    expect(summarizeByType(dependentTypes)).toEqual([
      {
        title: "User",
        version: 3,
        versionsByParentVersion: { 1: [1, 2, 3], 2: [3] },
      },
      { title: "Machine", version: 1, versionsByParentVersion: { 2: [1] } },
    ]);
  });

  it("marks a type whose latest version no longer extends the parent as former, at its highest version that does", () => {
    const formerV1 = makeVersion("former", "Former", 1, [1]);
    const formerV2 = makeVersion("former", "Former", 2, [1]);

    const dependentTypes = dependentTypesFor([formerV1, formerV2], []);

    expect(summarizeByType(dependentTypes)).toEqual([
      {
        title: "Former (former)",
        version: 2,
        versionsByParentVersion: { 1: [1, 2] },
      },
    ]);
    expect([...dependentTypes.byType.values()][0]?.entityType.schema.$id).toBe(
      formerV2.schema.$id,
    );
  });

  it("leaves out a type that only the latest-version query returned", () => {
    const machine = makeVersion("machine", "Machine", 1, [1]);

    const dependentTypes = dependentTypesFor([], [machine]);

    expect(dependentTypes.byType.size).toBe(0);
  });

  it("leaves out the parent itself", () => {
    const actorV2 = makeVersion("actor", "Actor", 2, [1]);
    const machine = makeVersion("machine", "Machine", 1, [1]);

    const dependentTypes = dependentTypesFor(
      [actorV2, machine],
      [actorV2, machine],
    );

    expect(summarizeByType(dependentTypes)).toEqual([
      { title: "Machine", version: 1, versionsByParentVersion: { 1: [1] } },
    ]);
  });

  it("counts a version returned twice once", () => {
    const machine = makeVersion("machine", "Machine", 1, [1]);

    expect(
      summarizeByType(
        dependentTypesFor([machine, machine], [machine, machine]),
      ),
    ).toEqual([
      { title: "Machine", version: 1, versionsByParentVersion: { 1: [1] } },
    ]);
  });

  it("reports the types as incomplete when either query stopped at its row limit", () => {
    const machine = makeVersion("machine", "Machine", 1, [1]);
    const cursor = machine.schema.$id;
    const withCursors = (cursors: {
      all?: VersionedUrl;
      latest?: VersionedUrl;
    }) => dependentTypesFor([machine], [machine], cursors);

    expect(withCursors({}).incomplete).toBe(false);
    expect(withCursors({ all: cursor }).incomplete).toBe(true);
    expect(withCursors({ latest: cursor }).incomplete).toBe(true);
    expect(
      summarizeByType(withCursors({ all: cursor, latest: cursor })),
    ).toEqual([
      { title: "Machine", version: 1, versionsByParentVersion: { 1: [1] } },
    ]);
  });

  it("lists no former types when the latest-version query stopped at its row limit, because the types after the cut are missing from it", () => {
    const machine = makeVersion("machine", "Machine", 1, [1]);
    const user = makeVersion("user", "User", 1, [1]);

    const dependentTypes = dependentTypesFor([machine, user], [machine], {
      latest: machine.schema.$id,
    });

    expect(summarizeByType(dependentTypes)).toEqual([
      { title: "Machine", version: 1, versionsByParentVersion: { 1: [1] } },
    ]);
  });
});
