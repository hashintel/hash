import { gql } from "@apollo/client";

export const markNotificationsAsReadMutation = gql`
  mutation markNotificationsAsRead($notificationEntityIds: [EntityId!]!) {
    markNotificationsAsRead(notificationEntityIds: $notificationEntityIds)
  }
`;

export const archiveNotificationsMutation = gql`
  mutation archiveNotifications($notificationEntityIds: [EntityId!]!) {
    archiveNotifications(notificationEntityIds: $notificationEntityIds)
  }
`;
