import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  archiveNotificationsResolver,
  markNotificationsAsReadResolver,
} from "./update-notifications";

import type { EntityId, UserId } from "@blockprotocol/type-system";
import type { GraphQLResolveInfo } from "graphql";

const mocks = vi.hoisted(() => ({
  archiveNotification: vi.fn(),
  getLatestEntityById: vi.fn(),
  getNotificationFromEntity: vi.fn(),
  markNotificationAsRead: vi.fn(),
}));

vi.mock("../../../../graph/knowledge/primitive/entity", () => ({
  getLatestEntityById: mocks.getLatestEntityById,
}));

vi.mock("../../../../graph/knowledge/system-types/notification", () => ({
  archiveNotification: mocks.archiveNotification,
  getNotificationFromEntity: mocks.getNotificationFromEntity,
  markNotificationAsRead: mocks.markNotificationAsRead,
}));

const impureGraphContext = { graphApi: {} };

vi.mock("../../util", () => ({
  graphQLContextToImpureGraphContext: () => impureGraphContext,
}));

const recipientAccountId = "00000000-0000-0000-0000-000000000001" as UserId;
const notificationEntityId =
  `${recipientAccountId}~00000000-0000-0000-0000-000000000002` as EntityId;
const notification = {
  entity: { metadata: { recordId: notificationEntityId } },
};
const graphQLContext = {
  authentication: { actorId: recipientAccountId },
  user: { accountId: recipientAccountId },
};
const resolveInfo = {} as GraphQLResolveInfo;

describe("notification update resolvers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks an owned notification as read through the notification service", async () => {
    const entity = {
      metadata: { recordId: { entityId: notificationEntityId } },
    };
    mocks.getLatestEntityById.mockResolvedValue(entity);
    mocks.getNotificationFromEntity.mockReturnValue(notification);

    await markNotificationsAsReadResolver(
      {},
      { notificationEntityIds: [notificationEntityId] },
      graphQLContext as never,
      resolveInfo,
    );

    expect(mocks.markNotificationAsRead).toHaveBeenCalledWith(
      impureGraphContext,
      graphQLContext.authentication,
      expect.objectContaining({ notification }),
    );
  });

  it("archives an owned notification through the notification service", async () => {
    const entity = {
      metadata: { recordId: { entityId: notificationEntityId } },
    };
    mocks.getLatestEntityById.mockResolvedValue(entity);
    mocks.getNotificationFromEntity.mockReturnValue(notification);

    await archiveNotificationsResolver(
      {},
      { notificationEntityIds: [notificationEntityId] },
      graphQLContext as never,
      resolveInfo,
    );

    expect(mocks.archiveNotification).toHaveBeenCalledWith(
      impureGraphContext,
      graphQLContext.authentication,
      { notification },
    );
  });

  it("updates duplicate notification IDs only once", async () => {
    const entity = {
      metadata: { recordId: { entityId: notificationEntityId } },
    };
    mocks.getLatestEntityById.mockResolvedValue(entity);
    mocks.getNotificationFromEntity.mockReturnValue(notification);

    await markNotificationsAsReadResolver(
      {},
      {
        notificationEntityIds: [notificationEntityId, notificationEntityId],
      },
      graphQLContext as never,
      resolveInfo,
    );

    expect(mocks.getLatestEntityById).toHaveBeenCalledTimes(1);
    expect(mocks.markNotificationAsRead).toHaveBeenCalledTimes(1);
  });

  it("rejects a notification from another web before loading it", async () => {
    const otherNotificationEntityId =
      "00000000-0000-0000-0000-000000000003~00000000-0000-0000-0000-000000000004" as EntityId;

    await expect(
      markNotificationsAsReadResolver(
        {},
        { notificationEntityIds: [otherNotificationEntityId] },
        graphQLContext as never,
        resolveInfo,
      ),
    ).rejects.toThrow("only update notifications in your own web");
    expect(mocks.getLatestEntityById).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { entityId: otherNotificationEntityId },
    );
  });
});
