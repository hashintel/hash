import { beforeEach, describe, expect, it, vi } from "vitest";

import { createEntityResolver } from "./entity";

import type { MutationCreateEntityArgs } from "../../../api-types.gen";
import type {
  EntityId,
  EntityUuid,
  UserId,
  VersionedUrl,
  WebId,
} from "@blockprotocol/type-system";
import type { GraphQLResolveInfo } from "graphql";

const mocks = vi.hoisted(() => ({
  canUserReadEntity: vi.fn(),
  createEntityWithLinks: vi.fn(),
  createLinkEntity: vi.fn(),
}));

vi.mock("../../../../graph/knowledge/primitive/entity", () => ({
  canUserReadEntity: mocks.canUserReadEntity,
  createEntityWithLinks: mocks.createEntityWithLinks,
}));

vi.mock("../../../../graph/knowledge/primitive/link-entity", () => ({
  createLinkEntity: mocks.createLinkEntity,
}));

const impureGraphContext = { graphApi: {} };

vi.mock("../../util", () => ({
  graphQLContextToImpureGraphContext: () => impureGraphContext,
}));

const accountId = "00000000-0000-0000-0000-000000000001" as UserId;
const otherWebId = "00000000-0000-0000-0000-000000000002" as WebId;
const chosenEntityUuid = "00000000-0000-0000-0000-000000000003" as EntityUuid;
const entityTypeId =
  "https://hash.ai/@h/types/entity-type/petri-net/v/1" as VersionedUrl;
const graphQLContext = {
  authentication: { actorId: accountId },
  user: { accountId },
};
const resolveInfo = {} as GraphQLResolveInfo;

const createWith = (args: Partial<MutationCreateEntityArgs>) =>
  createEntityResolver(
    {},
    {
      entityTypeIds: [entityTypeId],
      properties: { value: {} },
      ...args,
    },
    graphQLContext as never,
    resolveInfo,
  );

describe("createEntity resolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates the entity under the uuid the caller chose, in the web the caller named", async () => {
    await createWith({ webId: otherWebId, entityUuid: chosenEntityUuid });

    expect(mocks.createEntityWithLinks).toHaveBeenCalledWith(
      impureGraphContext,
      graphQLContext.authentication,
      expect.objectContaining({
        webId: otherWebId,
        entityUuid: chosenEntityUuid,
      }),
    );
  });

  it("generates a uuid, different each time, when the caller chose none", async () => {
    await createWith({});
    await createWith({});

    const uuids = mocks.createEntityWithLinks.mock.calls.map(
      ([, , params]) => (params as { entityUuid: EntityUuid }).entityUuid,
    );

    expect(uuids).toHaveLength(2);
    expect(uuids[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(uuids[0]).not.toEqual(uuids[1]);
    expect(uuids).not.toContain(chosenEntityUuid);
  });

  it("names a public entity's view policy after the chosen uuid", async () => {
    await createWith({ entityUuid: chosenEntityUuid, makePublic: true });

    expect(mocks.createEntityWithLinks).toHaveBeenCalledWith(
      impureGraphContext,
      graphQLContext.authentication,
      expect.objectContaining({
        entityUuid: chosenEntityUuid,
        policies: [
          expect.objectContaining({
            name: `public-view-entity-${chosenEntityUuid}`,
          }),
        ],
      }),
    );
  });

  it("creates a link entity under the uuid the caller chose", async () => {
    const leftEntityId = `${accountId}~00000000-0000-0000-0000-000000000004`;
    const rightEntityId = `${accountId}~00000000-0000-0000-0000-000000000005`;

    await createWith({
      entityUuid: chosenEntityUuid,
      linkData: {
        leftEntityId: leftEntityId as EntityId,
        rightEntityId: rightEntityId as EntityId,
      },
    });

    expect(mocks.createLinkEntity).toHaveBeenCalledWith(
      impureGraphContext,
      graphQLContext.authentication,
      expect.objectContaining({ entityUuid: chosenEntityUuid }),
    );
    expect(mocks.createEntityWithLinks).not.toHaveBeenCalled();
  });

  it("passes on the store's refusal of a uuid the web already has", async () => {
    mocks.createEntityWithLinks.mockRejectedValueOnce(
      new Error("entity already exists"),
    );

    await expect(createWith({ entityUuid: chosenEntityUuid })).rejects.toThrow(
      "entity already exists",
    );
  });
});
