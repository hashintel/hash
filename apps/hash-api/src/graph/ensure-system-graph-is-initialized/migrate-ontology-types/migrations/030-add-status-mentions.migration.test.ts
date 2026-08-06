import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  blockProtocolPropertyTypes,
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import migrate from "./030-add-status-mentions.migration";

const mocks = vi.hoisted(() => ({
  getEntityTypeById: vi.fn(),
  updateSystemEntityType: vi.fn(),
  upgradeEntitiesToNewTypeVersion: vi.fn(),
}));

vi.mock("@local/hash-graph-sdk/entity-type", () => ({
  getEntityTypeById: mocks.getEntityTypeById,
}));

vi.mock("../util", () => ({
  getCurrentHashLinkEntityTypeId: ({
    linkEntityTypeKey,
  }: {
    linkEntityTypeKey: keyof typeof systemLinkEntityTypes;
  }) => systemLinkEntityTypes[linkEntityTypeKey].linkEntityTypeId,
  getCurrentHashSystemEntityTypeId: ({
    entityTypeKey,
  }: {
    entityTypeKey: keyof typeof systemEntityTypes;
  }) => systemEntityTypes[entityTypeKey].entityTypeId,
  updateSystemEntityType: mocks.updateSystemEntityType,
  upgradeEntitiesToNewTypeVersion: mocks.upgradeEntitiesToNewTypeVersion,
}));

describe("status mention migration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getEntityTypeById.mockImplementation(
      (_graphApi, _authentication, { entityTypeId }) =>
        Promise.resolve({
          schema:
            entityTypeId ===
            systemEntityTypes.opportunityStatusUpdate.entityTypeId
              ? {
                  properties: {
                    [systemPropertyTypes.statusUpdateText.propertyTypeBaseUrl]:
                      {
                        $ref: systemPropertyTypes.statusUpdateText
                          .propertyTypeId,
                      },
                  },
                }
              : {
                  links: {
                    [systemLinkEntityTypes.occurredInText.linkEntityTypeId]: {
                      items: {},
                      minItems: 1,
                      type: "array",
                    },
                  },
                },
        }),
    );
    mocks.updateSystemEntityType.mockResolvedValue(undefined);
    mocks.upgradeEntitiesToNewTypeVersion.mockResolvedValue(undefined);
  });

  it("preserves legacy status text and optionalizes legacy mention links", async () => {
    await migrate({
      authentication: { actorId: "test" } as never,
      context: { graphApi: {} } as never,
      migrationState: {
        dataTypeVersions: {},
        entityTypeVersions: {},
        propertyTypeVersions: {},
      },
    });

    const statusUpdateCall = mocks.updateSystemEntityType.mock.calls[0]?.[2];
    expect(statusUpdateCall.newSchema.properties).toMatchObject({
      [systemPropertyTypes.statusUpdateText.propertyTypeBaseUrl]: {
        $ref: systemPropertyTypes.statusUpdateText.propertyTypeId,
      },
      [blockProtocolPropertyTypes.textualContent.propertyTypeBaseUrl]: {
        $ref: blockProtocolPropertyTypes.textualContent.propertyTypeId,
      },
    });
    const mentionCall = mocks.updateSystemEntityType.mock.calls[1]?.[2];
    expect(
      mentionCall.newSchema.links[
        systemLinkEntityTypes.occurredInText.linkEntityTypeId
      ],
    ).toMatchObject({ maxItems: 1, minItems: 0 });
    expect(mocks.upgradeEntitiesToNewTypeVersion).toHaveBeenCalledOnce();
  });

  it("can be rerun after an interrupted attempt", async () => {
    mocks.updateSystemEntityType.mockRejectedValueOnce(
      new Error("interrupted"),
    );
    const params = {
      authentication: { actorId: "test" } as never,
      context: { graphApi: {} } as never,
      migrationState: {
        dataTypeVersions: {},
        entityTypeVersions: {},
        propertyTypeVersions: {},
      },
    };

    await expect(migrate(params)).rejects.toThrow("interrupted");
    await expect(migrate(params)).resolves.toBe(params.migrationState);
    expect(mocks.upgradeEntitiesToNewTypeVersion).toHaveBeenCalledOnce();
  });
});
