import { expect, test } from "vitest";

import { draftPath, draftRoute } from "./draft-path";

import type { EntityId } from "@blockprotocol/type-system";

const webId = "00000000-0000-4000-8000-000000000001";
const uuid = "00000000-0000-4000-8000-00000000000a";
const entityId = `${webId}~${uuid}` as EntityId;

test("a draft's route names this page with its uuid, web and example as separate query values", () => {
  expect(draftRoute(entityId, "sir-model")).toEqual({
    pathname: "/processes/[uuid]",
    query: { uuid, draftWeb: webId, example: "sir-model" },
  });
  expect(draftRoute(entityId, null)).toEqual({
    pathname: "/processes/[uuid]",
    query: { uuid, draftWeb: webId },
  });
});

test("a draft's path is its route resolved to a URL", () => {
  expect(draftPath(entityId, "sir-model")).toBe(
    `/processes/${uuid}?draftWeb=${webId}&example=sir-model`,
  );
  expect(draftPath(entityId, null)).toBe(
    `/processes/${uuid}?draftWeb=${webId}`,
  );
});
