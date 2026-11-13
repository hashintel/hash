import { describe, expect, it } from "vitest";

import { getLatestConversionTargets } from "./get-latest-conversion-targets";

import type { VersionedUrl } from "@blockprotocol/type-system";

const sourceId = "https://hash.ai/@h/types/data-type/feet/v/2" as VersionedUrl;
const target = (slug: string, version: number, value: number) => ({
  targetDataTypeId:
    `https://hash.ai/@h/types/data-type/${slug}/v/${version}` as VersionedUrl,
  title: slug,
  valueForOneOfThese: value,
});

describe("latest conversion targets", () => {
  it("shows only the latest version even when older versions arrive later", () => {
    const latestMeters = target("meters", 10, 0.3048);
    expect(
      getLatestConversionTargets(sourceId, [
        latestMeters,
        target("meters", 2, 0.3048),
        target("meters", 1, 0.3048),
      ]),
    ).toEqual([latestMeters]);
  });

  it("excludes all versions of the source and sorts the remaining units by value", () => {
    const meters = target("meters", 2, 0.3048);
    const inches = target("inches", 2, 12);
    expect(
      getLatestConversionTargets(sourceId, [
        target("feet", 1, 1),
        inches,
        target("feet", 2, 1),
        meters,
      ]),
    ).toEqual([meters, inches]);
  });
});
