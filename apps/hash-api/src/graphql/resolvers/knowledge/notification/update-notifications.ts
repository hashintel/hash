import { extractWebIdFromEntityId } from "@blockprotocol/type-system";

import { getLatestEntityById } from "../../../../graph/knowledge/primitive/entity";
import {
  archiveNotification,
  getNotificationFromEntity,
  markNotificationAsRead,
} from "../../../../graph/knowledge/system-types/notification";
import * as Error from "../../../error";
import { graphQLContextToImpureGraphContext } from "../../util";

import type { Notification } from "../../../../graph/knowledge/system-types/notification";
import type {
  MutationArchiveNotificationsArgs,
  MutationMarkNotificationsAsReadArgs,
  ResolverFn,
} from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import type { EntityId } from "@blockprotocol/type-system";

const getOwnedNotifications = async (
  graphQLContext: LoggedInGraphQLContext,
  notificationEntityIds: EntityId[],
): Promise<Notification[]> => {
  const { authentication, user } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  return Promise.all(
    [...new Set(notificationEntityIds)].map(async (notificationEntityId) => {
      if (extractWebIdFromEntityId(notificationEntityId) !== user.accountId) {
        throw Error.forbidden(
          "You can only update notifications in your own web.",
        );
      }

      const entity = await getLatestEntityById(context, authentication, {
        entityId: notificationEntityId,
      });

      return getNotificationFromEntity({ entity });
    }),
  );
};

export const markNotificationsAsReadResolver: ResolverFn<
  Promise<boolean>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationMarkNotificationsAsReadArgs
> = async (_, { notificationEntityIds }, graphQLContext) => {
  const notifications = await getOwnedNotifications(
    graphQLContext,
    notificationEntityIds,
  );
  const context = graphQLContextToImpureGraphContext(graphQLContext);
  const readAt = new Date().toISOString();

  await Promise.all(
    notifications.map((notification) =>
      markNotificationAsRead(context, graphQLContext.authentication, {
        notification,
        readAt,
      }),
    ),
  );

  return true;
};

export const archiveNotificationsResolver: ResolverFn<
  Promise<boolean>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationArchiveNotificationsArgs
> = async (_, { notificationEntityIds }, graphQLContext) => {
  const notifications = await getOwnedNotifications(
    graphQLContext,
    notificationEntityIds,
  );
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  await Promise.all(
    notifications.map((notification) =>
      archiveNotification(context, graphQLContext.authentication, {
        notification,
      }),
    ),
  );

  return true;
};
