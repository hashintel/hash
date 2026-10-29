import { describe, expect, it } from "vitest";

import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { isEntityExcludedFromEmbeddings } from "./embedding-exclusions.js";

import type { VersionedUrl } from "@blockprotocol/type-system";

describe("isEntityExcludedFromEmbeddings", () => {
  it("excludes Flow Run entities of any version", () => {
    expect(
      isEntityExcludedFromEmbeddings([
        "https://hash.ai/@h/types/entity-type/flow-run/v/2" as VersionedUrl,
      ]),
    ).toBe(true);
    expect(
      isEntityExcludedFromEmbeddings([systemEntityTypes.flowRun.entityTypeId]),
    ).toBe(true);
  });

  it("includes entities of other types", () => {
    expect(
      isEntityExcludedFromEmbeddings([
        systemEntityTypes.flowSchedule.entityTypeId,
      ]),
    ).toBe(false);
  });
});
