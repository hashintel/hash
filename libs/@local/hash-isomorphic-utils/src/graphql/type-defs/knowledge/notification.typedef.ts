import { gql } from "graphql-tag";

export const notificationTypedef = gql`
  extend type Mutation {
    """
    Mark notifications belonging to the authenticated user as read.
    """
    markNotificationsAsRead(notificationEntityIds: [EntityId!]!): Boolean!

    """
    Hide notifications belonging to the authenticated user.
    """
    archiveNotifications(notificationEntityIds: [EntityId!]!): Boolean!
  }
`;
