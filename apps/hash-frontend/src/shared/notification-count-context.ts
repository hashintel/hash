import { createContext, useContext } from "react";

import type { EntityId } from "@blockprotocol/type-system";

export type NotificationCountContextValues = {
  numberOfUnreadNotifications?: number;
  loading: boolean;
  markNotificationAsRead: (params: {
    notificationEntityId: EntityId;
  }) => Promise<void>;
  /**
   * Mark notifications as read if they link to a specific entity
   */
  markNotificationsAsReadForEntity: (params: {
    targetEntityId: EntityId;
  }) => Promise<void>;
  /**
   * Archive notifications if they link to a specific entity
   */
  archiveNotificationsForEntity: (params: {
    targetEntityId: EntityId;
  }) => Promise<void>;
};

export const NotificationCountContext =
  createContext<null | NotificationCountContextValues>(null);

export const useNotificationCount = () => {
  const notificationCountContext = useContext(NotificationCountContext);

  if (!notificationCountContext) {
    throw new Error("Context missing");
  }

  return notificationCountContext;
};
