import { expect, test } from "vitest";

import { stripSnapshotLinks } from "./strip-snapshot-links";

test("removes snapshot payloads from event URLs, breadcrumbs, and span attributes", () => {
  const url = "https://demo.petrinaut.org/share?mode=simulate#v1.br.secret";
  const event = {
    request: { url },
    breadcrumbs: [{ data: { from: url, to: "/local/uuid" } }],
    spans: [{ data: { "url.full": url } }],
  };
  const cleaned = stripSnapshotLinks(event);
  expect(JSON.stringify(cleaned)).not.toContain("secret");
  expect(cleaned.request.url).toBe(
    "https://demo.petrinaut.org/share?mode=simulate#[snapshot]",
  );
  expect(cleaned.breadcrumbs[0]?.data.to).toBe("/local/uuid");
  expect(event.request.url).toBe(url);
});

test.each([
  "/share#invalid-payload",
  "/share#v3.unknown.data",
  "/share#v1.br.payload%20truncated",
])("also removes malformed and future payloads from %s", (url) => {
  expect(stripSnapshotLinks(url)).toBe("/share#[snapshot]");
});

test("preserves other URLs and non-plain objects", () => {
  const error = new Error("Failure");
  expect(
    stripSnapshotLinks({ url: "/docs#sharing", error, count: 3, empty: null }),
  ).toEqual({ url: "/docs#sharing", error, count: 3, empty: null });
});
