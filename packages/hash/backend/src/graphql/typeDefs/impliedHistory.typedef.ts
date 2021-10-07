import { gql } from "apollo-server-express";

export const impliedHistoryTypedef = gql`
  type ImpliedEntityVersion {
    impliedVersionId: ID!
    createdAt: Date!
  }

  type ImpliedEntityHistory {
    timelineId: ID!
    timeline: [ImpliedEntityVersion!]!
  }

  extend type Query {
    """
    Get the implied entity history for a given entity.
    """
    getImpliedEntityHistory(
      accountId: ID!
      entityId: ID!
    ): ImpliedEntityHistory!

    """
    Get a specific implied version of an entity.
    """
    getImpliedEntityVersion(impliedVersionId: ID!): UnknownEntity!
  }
`;
