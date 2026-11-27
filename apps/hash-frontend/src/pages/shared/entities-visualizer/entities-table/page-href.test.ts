import { expect, test } from "vitest";

import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { getPageHref } from "./page-href";

import type { EntityId, VersionedUrl } from "@blockprotocol/type-system";

const entityId =
  "00000000-0000-4000-8000-000000000001~00000000-0000-4000-8000-000000000002" as EntityId;
const customTypeId =
  "https://example.com/types/entity-type/custom/v/1" as VersionedUrl;

test("opens dashboard rows in the dashboard editor, including multi-type entities", () => {
  expect(
    getPageHref({
      entityId,
      entityTypeIds: [customTypeId, systemEntityTypes.dashboard.entityTypeId],
    }),
  ).toBe("/dashboard/00000000-0000-4000-8000-000000000002");
});

test.each([
  systemEntityTypes.document.entityTypeId,
  systemEntityTypes.canvas.entityTypeId,
])("opens block pages using their owner's shortname (%s)", (entityTypeId) => {
  expect(
    getPageHref({
      entityId,
      entityTypeIds: [entityTypeId],
      webShortname: "alice",
    }),
  ).toBe("/@alice/00000000-0000-4000-8000-000000000002");
});

test("does not build a broken block-page link while the owner is unknown", () => {
  expect(
    getPageHref({
      entityId,
      entityTypeIds: [systemEntityTypes.document.entityTypeId],
    }),
  ).toBeNull();
});
