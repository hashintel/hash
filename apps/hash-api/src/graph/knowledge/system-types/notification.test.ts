import { beforeEach, describe, expect, it, vi } from "vitest";

import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import {
  createMentionNotification,
  isEntityMentionNotificationEntity,
  markNotificationAsRead,
} from "./notification";

import type { User } from "./user";
import type { EntityId, UserId } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";

const mocks = vi.hoisted(() => ({
  createEntity: vi.fn(),
  createLinkEntity: vi.fn(),
  getWebMachineId: vi.fn(),
  updateEntity: vi.fn(),
}));

vi.mock("@local/hash-backend-utils/machine-actors", () => ({
  getWebMachineId: mocks.getWebMachineId,
}));

vi.mock("../primitive/entity", () => ({
  createEntity: mocks.createEntity,
  updateEntity: mocks.updateEntity,
}));

vi.mock("../primitive/link-entity", () => ({
  createLinkEntity: mocks.createLinkEntity,
}));

const recipientId = "00000000-0000-0000-0000-000000000001" as UserId;
const notificationEntityId =
  `${recipientId}~00000000-0000-0000-0000-000000000002` as EntityId;
const targetEntityId =
  "00000000-0000-0000-0000-000000000003~00000000-0000-0000-0000-000000000004" as EntityId;
const notificationEntity = {
  metadata: {
    entityTypeIds: [systemEntityTypes.mentionNotification.entityTypeId],
    recordId: { entityId: notificationEntityId },
  },
  properties: {},
} as unknown as HashEntity;

describe("notification helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWebMachineId.mockResolvedValue(
      "00000000-0000-0000-0000-000000000005",
    );
  });

  it("recognizes mention notifications by base URL across versions", () => {
    expect(
      isEntityMentionNotificationEntity({
        ...notificationEntity,
        metadata: {
          ...notificationEntity.metadata,
          entityTypeIds: [
            `${systemEntityTypes.mentionNotification.entityTypeBaseUrl}v/7`,
          ],
        },
      } as unknown as HashEntity),
    ).toBe(true);
  });

  it("does not write another edition when the notification is already read", async () => {
    await markNotificationAsRead(
      {} as never,
      { actorId: recipientId },
      {
        notification: {
          entity: notificationEntity as never,
          readAt: "2026-08-06T12:00:00.000Z",
        },
        readAt: "2026-08-06T13:00:00.000Z",
      },
    );

    expect(mocks.getWebMachineId).not.toHaveBeenCalled();
    expect(mocks.updateEntity).not.toHaveBeenCalled();
  });

  it("archives a notification when a required link cannot be created", async () => {
    mocks.createEntity.mockResolvedValue(notificationEntity);
    mocks.createLinkEntity.mockRejectedValue(new Error("link failed"));

    await expect(
      createMentionNotification(
        { logger: { error: vi.fn() } } as never,
        { actorId: recipientId },
        {
          occurredInEntity: {
            entity: {
              metadata: { recordId: { entityId: targetEntityId } },
            } as HashEntity,
          },
          triggeredByUser: {
            entity: {
              metadata: { recordId: { entityId: targetEntityId } },
            },
          } as User,
          webId: recipientId,
        },
      ),
    ).rejects.toThrow("link failed");

    expect(mocks.updateEntity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorId: "00000000-0000-0000-0000-000000000005",
      }),
      expect.objectContaining({
        propertyPatches: [
          expect.objectContaining({
            op: "add",
            path: ["https://hash.ai/@h/types/property-type/archived/"],
          }),
        ],
      }),
    );
  });
});
