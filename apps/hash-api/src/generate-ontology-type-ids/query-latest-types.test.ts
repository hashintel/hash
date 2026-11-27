import { describe, expect, it } from "vitest";

import { keepLatestVersions, queryAllPages } from "./query-latest-types";

import type {
  BaseUrl,
  OntologyTypeVersion,
  VersionedUrl,
} from "@blockprotocol/type-system";

const typeAt = (baseUrl: string, version: string) => ({
  metadata: {
    recordId: {
      baseUrl: baseUrl as BaseUrl,
      version: version as OntologyTypeVersion,
    },
  },
});

const ids = (types: ReturnType<typeof typeAt>[]) =>
  types
    .map(
      ({ metadata: { recordId } }) =>
        `${recordId.baseUrl}v/${recordId.version}`,
    )
    .sort();

describe("queryAllPages", () => {
  it("follows the cursor until a page returns none", async () => {
    const pages: Record<string, { items: number[]; cursor?: VersionedUrl }> = {
      first: { items: [1, 2], cursor: "https://example.com/a/v/1" },
      "https://example.com/a/v/1": {
        items: [3, 4],
        cursor: "https://example.com/b/v/1",
      },
      "https://example.com/b/v/1": { items: [5] },
    };
    const afters: (VersionedUrl | undefined)[] = [];

    const items = await queryAllPages(
      async (after) => {
        afters.push(after);
        return pages[after ?? "first"]!;
      },
      ({ items: pageItems }) => pageItems,
    );

    expect(items).toEqual([1, 2, 3, 4, 5]);
    expect(afters).toEqual([
      undefined,
      "https://example.com/a/v/1",
      "https://example.com/b/v/1",
    ]);
  });

  it("throws when the graph repeats a cursor", async () => {
    await expect(
      queryAllPages(
        async () => ({ items: [], cursor: "https://example.com/a/v/1" }),
        ({ items }) => items,
      ),
    ).rejects.toThrow("more than once");
  });
});

describe("keepLatestVersions", () => {
  it("keeps the highest version of each base URL across pages", () => {
    const latest = keepLatestVersions([
      typeAt("https://example.com/a/", "2"),
      typeAt("https://example.com/a/", "1"),
      typeAt("https://example.com/b/", "1"),
      typeAt("https://example.com/a/", "10"),
      typeAt("https://example.com/c/", "3"),
      typeAt("https://example.com/c/", "3-draft.lane.1"),
    ]);

    expect(ids(latest)).toEqual([
      "https://example.com/a/v/10",
      "https://example.com/b/v/1",
      "https://example.com/c/v/3",
    ]);
  });
});
