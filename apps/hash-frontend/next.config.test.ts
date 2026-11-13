import "next/dist/server/node-environment";
import {
  getRewrittenUrl,
  unstable_getResponseFromNextConfig,
} from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";

import nextConfig from "./next.config.js";

describe("profile type kind routes", () => {
  it.each([
    ["alice", "data-types", "data-type"],
    ["alice", "entity-types", "entity-type"],
    ["example-org", "property-types", "property-type"],
    ["example-org", "link-types", "link-type"],
  ])(
    "routes /@%s/types/%s to the profile with the %s filter",
    async (shortname, path, kind) => {
      const response = await unstable_getResponseFromNextConfig({
        url: `https://app.hash.ai/@${shortname}/types/${path}`,
        nextConfig,
      });
      const rewrittenUrl = new URL(getRewrittenUrl(response)!);
      expect(rewrittenUrl.pathname).toBe(`/@/${shortname}`);
      expect(Object.fromEntries(rewrittenUrl.searchParams)).toEqual({
        tab: "Types",
        typeKind: kind,
      });
    },
  );

  it.each([
    ["/@alice/types", "/@/alice?tab=Types"],
    ["/@h/types/data-type/text/v/1", "/@/h/types/data-type/text/v/1"],
    ["/@h/types/unknown-types", "/@/h/types/unknown-types"],
    ["/@h/types/data-types/nested", "/@/h/types/data-types/nested"],
  ])("preserves the existing route for %s", async (path, destination) => {
    const response = await unstable_getResponseFromNextConfig({
      url: `https://app.hash.ai${path}`,
      nextConfig,
    });
    expect(getRewrittenUrl(response)).toBe(`https://app.hash.ai${destination}`);
  });
});
